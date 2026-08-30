/**
 * Toàn bộ SQL của ứng dụng.
 *
 * Quy tắc bất di bất dịch: mọi hàm chạm tới dữ liệu của một hộ gia đình đều
 * nhận `householdId` làm tham số bắt buộc và đưa nó vào mệnh đề WHERE. Không
 * có đường nào đọc được giao dịch mà bỏ qua điều kiện này.
 */
import type {
  Activity,
  ActivityException,
  ActivityKind,
  Category,
  Direction,
  FamilyMember,
  FamilyRelation,
  LargeTransactionGroup,
  MemberColor,
  MemberRole,
  PaymentMethod,
  Recurrence,
  Transaction,
  Member,
  Weekday,
} from '../../shared/types';
import { newId } from '../ids';
import { isOvernight, toTimeLabel } from '../../shared/time';

export interface TransactionRow {
  id: string;
  occurred_on: string;
  note: string;
  detail: string;
  payee: string;
  payment_method: string;
  amount: number;
  direction: Direction;
  recurrence: Recurrence;
  expires_on: string | null;
  category_id: string | null;
  category_name: string | null;
  created_by: string;
  created_by_name: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    note: row.note,
    detail: row.detail,
    payee: row.payee,
    // Cột lưu chuỗi rỗng cho "chưa ghi"; API nói bằng null cho gọn phía client.
    paymentMethod: (row.payment_method || null) as PaymentMethod | null,
    amount: row.amount,
    direction: row.direction,
    recurrence: row.recurrence,
    expiresOn: row.expires_on,
    categoryId: row.category_id,
    categoryName: row.category_name,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

const TX_SELECT = `
  SELECT t.id, t.occurred_on, t.note, t.detail, t.payee, t.payment_method,
         t.amount, t.direction, t.recurrence, t.expires_on,
         t.category_id, c.name AS category_name,
         t.created_by, u.display_name AS created_by_name,
         t.created_at, t.updated_at, t.deleted_at
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  JOIN users u ON u.id = t.created_by
`;

/* ------------------------------------------------------------------ users */

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  kdf_iterations: number;
  display_name: string;
  created_at: number;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

/* ------------------------------------------------------------- households */

export interface HouseholdRow {
  id: string;
  name: string;
  invite_code: string;
  currency: string;
  created_at: number;
}

export async function findHouseholdByInviteCode(
  db: D1Database,
  code: string,
): Promise<HouseholdRow | null> {
  return db
    .prepare('SELECT * FROM households WHERE invite_code = ?')
    .bind(code)
    .first<HouseholdRow>();
}

export async function findHouseholdById(
  db: D1Database,
  id: string,
): Promise<HouseholdRow | null> {
  return db.prepare('SELECT * FROM households WHERE id = ?').bind(id).first<HouseholdRow>();
}

export async function findMembership(
  db: D1Database,
  userId: string,
): Promise<{ household_id: string; role: MemberRole } | null> {
  return db
    .prepare('SELECT household_id, role FROM memberships WHERE user_id = ? ORDER BY joined_at LIMIT 1')
    .bind(userId)
    .first<{ household_id: string; role: MemberRole }>();
}

export async function listMembers(db: D1Database, householdId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(
      `SELECT m.user_id, m.role, m.joined_at, u.display_name, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ? ORDER BY m.joined_at`,
    )
    .bind(householdId)
    .all<{
      user_id: string;
      role: MemberRole;
      joined_at: number;
      display_name: string;
      email: string;
    }>();
  return results.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    email: r.email,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

export async function rotateInviteCode(
  db: D1Database,
  householdId: string,
  code: string,
): Promise<void> {
  await db
    .prepare('UPDATE households SET invite_code = ? WHERE id = ?')
    .bind(code, householdId)
    .run();
}

/* ------------------------------------------------------------- categories */

/** Bộ danh mục khởi tạo cho mỗi hộ gia đình mới. */
export const DEFAULT_CATEGORIES: Array<{ name: string; kind: Direction; icon: string }> = [
  { name: 'Ăn uống', kind: 'expense', icon: '🍜' },
  { name: 'Đi lại', kind: 'expense', icon: '🛵' },
  { name: 'Nhà cửa', kind: 'expense', icon: '🏠' },
  { name: 'Điện nước', kind: 'expense', icon: '💡' },
  { name: 'Y tế', kind: 'expense', icon: '💊' },
  { name: 'Giáo dục', kind: 'expense', icon: '📚' },
  { name: 'Giải trí', kind: 'expense', icon: '🎬' },
  { name: 'Mua sắm', kind: 'expense', icon: '🛍️' },
  { name: 'Chi khác', kind: 'expense', icon: '📦' },
  { name: 'Lương', kind: 'income', icon: '💰' },
  { name: 'Thưởng', kind: 'income', icon: '🎁' },
  { name: 'Kinh doanh', kind: 'income', icon: '📈' },
  { name: 'Thu khác', kind: 'income', icon: '🪙' },
];

interface CategoryRow {
  id: string;
  name: string;
  kind: Direction;
  icon: string | null;
  is_archived: number;
  deleted_at: number | null;
}

const CATEGORY_COLUMNS = 'id, name, kind, icon, is_archived, deleted_at';

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    isArchived: row.is_archived === 1,
    deletedAt: row.deleted_at,
  };
}

export async function listCategories(
  db: D1Database,
  householdId: string,
  options: { includeArchived?: boolean; includeDeleted?: boolean } = {},
): Promise<Category[]> {
  const where = ['household_id = ?'];
  if (!options.includeArchived) where.push('is_archived = 0');
  if (!options.includeDeleted) where.push('deleted_at IS NULL');
  const { results } = await db
    .prepare(
      `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE ${where.join(' AND ')} ORDER BY kind DESC, name`,
    )
    .bind(householdId)
    .all<CategoryRow>();
  return results.map(mapCategory);
}

export async function getCategory(
  db: D1Database,
  householdId: string,
  id: string,
  includeDeleted = false,
): Promise<Category | null> {
  const row = await db
    .prepare(
      `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE household_id = ? AND id = ?${
        includeDeleted ? '' : ' AND deleted_at IS NULL'
      }`,
    )
    .bind(householdId, id)
    .first<CategoryRow>();
  return row ? mapCategory(row) : null;
}

/**
 * Tra theo cặp (loại, tên) — đúng khoá UNIQUE của bảng. Dùng khi tạo mới đụng
 * ràng buộc: nếu hàng chắn chỗ là một danh mục đã xoá thì khôi phục nó thay vì
 * bắt người dùng đi tìm trong đống đã xoá.
 */
export async function findCategoryByName(
  db: D1Database,
  householdId: string,
  kind: Direction,
  name: string,
): Promise<Category | null> {
  const row = await db
    .prepare(
      `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE household_id = ? AND kind = ? AND name = ?`,
    )
    .bind(householdId, kind, name)
    .first<CategoryRow>();
  return row ? mapCategory(row) : null;
}

export async function insertCategory(
  db: D1Database,
  householdId: string,
  input: { name: string; kind: Direction; icon: string | null },
  now: number,
): Promise<Category> {
  const id = newId();
  await db
    .prepare(
      'INSERT INTO categories (id, household_id, name, kind, icon, is_archived, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    )
    .bind(id, householdId, input.name, input.kind, input.icon, now)
    .run();
  return {
    id,
    name: input.name,
    kind: input.kind,
    icon: input.icon,
    isArchived: false,
    deletedAt: null,
  };
}

export async function updateCategory(
  db: D1Database,
  householdId: string,
  id: string,
  patch: { name?: string; icon?: string | null; isArchived?: boolean },
): Promise<boolean> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    binds.push(patch.name);
  }
  if (patch.icon !== undefined) {
    sets.push('icon = ?');
    binds.push(patch.icon);
  }
  if (patch.isArchived !== undefined) {
    sets.push('is_archived = ?');
    binds.push(patch.isArchived ? 1 : 0);
  }
  if (sets.length === 0) return true;
  binds.push(householdId, id);
  const res = await db
    .prepare(
      `UPDATE categories SET ${sets.join(', ')}
       WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function countTransactionsInCategory(
  db: D1Database,
  householdId: string,
  categoryId: string,
): Promise<number> {
  const row = await db
    .prepare('SELECT count(*) AS n FROM transactions WHERE household_id = ? AND category_id = ?')
    .bind(householdId, categoryId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Xoá mềm: hàng ở lại nên giao dịch cũ vẫn đọc được tên danh mục, còn ô chọn
 * danh mục thì không thấy nó nữa. Không có hàm nào xoá hẳn một danh mục.
 */
export async function softDeleteCategory(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      'UPDATE categories SET deleted_at = ? WHERE household_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .bind(now, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function restoreCategory(
  db: D1Database,
  householdId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      'UPDATE categories SET deleted_at = NULL WHERE household_id = ? AND id = ? AND deleted_at IS NOT NULL',
    )
    .bind(householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/* ----------------------------------------------------------- transactions */

export interface TransactionFilter {
  from?: string;
  to?: string;
  direction?: Direction;
  recurrence?: Recurrence;
  categoryId?: string;
  q?: string;
  /** Kèm cả giao dịch đã xoá mềm — danh sách hiển thị chúng ở dạng gạch ngang. */
  includeDeleted?: boolean;
  limit: number;
  /** Keyset cursor dạng '<occurred_on>|<id>'. */
  cursor?: string;
}

export async function listTransactions(
  db: D1Database,
  householdId: string,
  filter: TransactionFilter,
): Promise<{ items: Transaction[]; nextCursor: string | null }> {
  const where = ['t.household_id = ?'];
  if (!filter.includeDeleted) where.push('t.deleted_at IS NULL');
  const binds: unknown[] = [householdId];

  if (filter.from) {
    where.push('t.occurred_on >= ?');
    binds.push(filter.from);
  }
  if (filter.to) {
    where.push('t.occurred_on <= ?');
    binds.push(filter.to);
  }
  if (filter.direction) {
    where.push('t.direction = ?');
    binds.push(filter.direction);
  }
  if (filter.recurrence) {
    where.push('t.recurrence = ?');
    binds.push(filter.recurrence);
  }
  if (filter.categoryId) {
    where.push('t.category_id = ?');
    binds.push(filter.categoryId);
  }
  if (filter.q) {
    // Tìm cả trong phần chi tiết và bên nhận, không chỉ dòng nội dung ngắn.
    where.push('(t.note LIKE ? OR t.detail LIKE ? OR t.payee LIKE ?)');
    const like = `%${filter.q}%`;
    binds.push(like, like, like);
  }
  if (filter.cursor) {
    const sep = filter.cursor.lastIndexOf('|');
    if (sep > 0) {
      // Keyset: trang sau bắt đầu ở bản ghi "cũ hơn" theo thứ tự (occurred_on DESC, id DESC).
      where.push('(t.occurred_on < ? OR (t.occurred_on = ? AND t.id < ?))');
      const day = filter.cursor.slice(0, sep);
      const id = filter.cursor.slice(sep + 1);
      binds.push(day, day, id);
    }
  }

  binds.push(filter.limit + 1); // lấy dư 1 để biết còn trang sau hay không
  const { results } = await db
    .prepare(
      `${TX_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.occurred_on DESC, t.id DESC LIMIT ?`,
    )
    .bind(...binds)
    .all<TransactionRow>();

  const hasMore = results.length > filter.limit;
  const rows = hasMore ? results.slice(0, filter.limit) : results;
  const last = rows[rows.length - 1];
  return {
    items: rows.map(mapTransaction),
    nextCursor: hasMore && last ? `${last.occurred_on}|${last.id}` : null,
  };
}

export async function getTransaction(
  db: D1Database,
  householdId: string,
  id: string,
  includeDeleted = false,
): Promise<Transaction | null> {
  const row = await db
    .prepare(
      `${TX_SELECT} WHERE t.household_id = ? AND t.id = ?${
        includeDeleted ? '' : ' AND t.deleted_at IS NULL'
      }`,
    )
    .bind(householdId, id)
    .first<TransactionRow>();
  return row ? mapTransaction(row) : null;
}

/** Nạp nhiều giao dịch theo id — dùng để hydrate kết quả từ Vectorize. */
export async function getTransactionsByIds(
  db: D1Database,
  householdId: string,
  ids: string[],
): Promise<Transaction[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `${TX_SELECT} WHERE t.household_id = ? AND t.deleted_at IS NULL AND t.id IN (${placeholders})`,
    )
    .bind(householdId, ...ids)
    .all<TransactionRow>();
  return results.map(mapTransaction);
}

export interface TransactionInput {
  occurredOn: string;
  note: string;
  detail: string;
  payee: string;
  paymentMethod: PaymentMethod | null;
  amount: number;
  direction: Direction;
  recurrence: Recurrence;
  /** null nghĩa là khoản này không có hạn phải gia hạn. */
  expiresOn: string | null;
  categoryId: string | null;
}

export async function insertTransaction(
  db: D1Database,
  householdId: string,
  userId: string,
  input: TransactionInput,
  now: number,
  embedStatus: 'pending' | 'skipped',
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO transactions
         (id, household_id, created_by, occurred_on, note, detail, payee, payment_method,
          amount, direction, recurrence, expires_on, category_id, embed_status,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      householdId,
      userId,
      input.occurredOn,
      input.note,
      input.detail,
      input.payee,
      input.paymentMethod ?? '',
      input.amount,
      input.direction,
      input.recurrence,
      input.expiresOn,
      input.categoryId,
      embedStatus,
      now,
      now,
    )
    .run();
  return id;
}

export async function updateTransaction(
  db: D1Database,
  householdId: string,
  id: string,
  patch: Partial<TransactionInput>,
  now: number,
  embedStatus: 'pending' | 'skipped',
): Promise<boolean> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  const columns: Record<keyof TransactionInput, string> = {
    occurredOn: 'occurred_on',
    note: 'note',
    detail: 'detail',
    payee: 'payee',
    paymentMethod: 'payment_method',
    amount: 'amount',
    direction: 'direction',
    recurrence: 'recurrence',
    expiresOn: 'expires_on',
    categoryId: 'category_id',
  };
  for (const [key, column] of Object.entries(columns) as Array<[keyof TransactionInput, string]>) {
    const value = patch[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      // paymentMethod = null nghĩa là gỡ bỏ; cột lưu chuỗi rỗng.
      binds.push(key === 'paymentMethod' ? (value ?? '') : value);
    }
  }
  if (sets.length === 0) return true;
  sets.push('updated_at = ?', 'embed_status = ?');
  binds.push(now, embedStatus, householdId, id);
  const res = await db
    .prepare(
      `UPDATE transactions SET ${sets.join(', ')} WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Bỏ đánh dấu xoá. Trả về false khi giao dịch không tồn tại hoặc chưa từng bị xoá. */
export async function restoreTransaction(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
  embedStatus: 'pending' | 'skipped',
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE transactions SET deleted_at = NULL, updated_at = ?, embed_status = ?
       WHERE household_id = ? AND id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(now, embedStatus, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function softDeleteTransaction(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE household_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .bind(now, now, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Các khoản có hạn tới trước hoặc đúng ngày `through`, cũ nhất đứng trước.
 *
 * Không có cận dưới: một khoản đã quá hạn mà chưa gia hạn thì càng để lâu càng
 * phải nhắc, chứ không phải im đi sau vài ngày. Vì thế danh sách có `limit` —
 * nơi gọi chịu trách nhiệm về việc hiển thị khi số lượng chạm trần.
 */
export async function listExpiringTransactions(
  db: D1Database,
  householdId: string,
  through: string,
  limit: number,
): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      `${TX_SELECT}
       WHERE t.household_id = ? AND t.deleted_at IS NULL
         AND t.expires_on IS NOT NULL AND t.expires_on <= ?
       ORDER BY t.expires_on ASC, t.id ASC LIMIT ?`,
    )
    .bind(householdId, through, limit)
    .all<TransactionRow>();
  return results.map(mapTransaction);
}

/* -------------------------------------------------------- khoản thu/chi lớn */

/** Ngưỡng mặc định coi là "khoản lớn": 1 triệu đồng. */
export const DEFAULT_LARGE_THRESHOLD = 1_000_000;

/**
 * Các khoản vượt ngưỡng của một chiều trong khoảng ngày, kèm tổng của cả chiều
 * đó trong cùng khoảng để tính tỷ trọng. Sắp theo số tiền giảm dần vì người
 * dùng vào đây để soi khoản to nhất trước.
 */
export async function listLargeTransactions(
  db: D1Database,
  householdId: string,
  params: {
    fromInclusive: string;
    toExclusive: string;
    direction: Direction;
    threshold: number;
    limit: number;
  },
): Promise<LargeTransactionGroup> {
  const { fromInclusive, toExclusive, direction, threshold, limit } = params;
  const [{ results }, totals] = await Promise.all([
    db
      .prepare(
        `${TX_SELECT} WHERE t.household_id = ? AND t.deleted_at IS NULL
           AND t.direction = ? AND t.amount >= ?
           AND t.occurred_on >= ? AND t.occurred_on < ?
         ORDER BY t.amount DESC, t.occurred_on DESC, t.id DESC LIMIT ?`,
      )
      .bind(householdId, direction, threshold, fromInclusive, toExclusive, limit)
      .all<TransactionRow>(),
    // Đếm trên toàn bộ khoản vượt ngưỡng chứ không chỉ trang đang trả về, để
    // "5 khoản lớn chiếm 62% tổng chi" không sai khi có nhiều hơn `limit` khoản.
    db
      .prepare(
        `SELECT sum(amount) AS month_total, count(*) AS month_n,
                sum(CASE WHEN amount >= ?1 THEN amount ELSE 0 END) AS large_total,
                sum(CASE WHEN amount >= ?1 THEN 1 ELSE 0 END) AS large_n,
                sum(CASE WHEN amount >= ?1 AND trim(detail) = '' THEN 1 ELSE 0 END) AS missing
         FROM transactions
         WHERE household_id = ?2 AND deleted_at IS NULL AND direction = ?3
           AND occurred_on >= ?4 AND occurred_on < ?5`,
      )
      .bind(threshold, householdId, direction, fromInclusive, toExclusive)
      .first<{
        month_total: number | null;
        month_n: number;
        large_total: number | null;
        large_n: number | null;
        missing: number | null;
      }>(),
  ]);

  return {
    items: results.map(mapTransaction),
    total: totals?.large_total ?? 0,
    monthTotal: totals?.month_total ?? 0,
    count: totals?.large_n ?? 0,
    monthCount: totals?.month_n ?? 0,
    missingDetail: totals?.missing ?? 0,
  };
}

/* -------------------------------------------------------------- dashboard */

export interface AggregateRow {
  month: string;
  direction: Direction;
  recurrence: Recurrence;
  category_id: string | null;
  category_name: string | null;
  total: number;
  n: number;
}

/**
 * Một truy vấn gộp phủ cả tháng hiện tại lẫn tháng trước; phần pivot làm ở TS.
 * Cận dưới bao gồm, cận trên loại trừ — so sánh chuỗi ISO nên đúng thứ tự.
 */
export async function aggregateRange(
  db: D1Database,
  householdId: string,
  fromInclusive: string,
  toExclusive: string,
): Promise<AggregateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT substr(t.occurred_on, 1, 7) AS month,
              t.direction, t.recurrence, t.category_id,
              c.name AS category_name,
              sum(t.amount) AS total, count(*) AS n
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.household_id = ? AND t.deleted_at IS NULL
         AND t.occurred_on >= ? AND t.occurred_on < ?
       GROUP BY month, t.direction, t.recurrence, t.category_id`,
    )
    .bind(householdId, fromInclusive, toExclusive)
    .all<AggregateRow>();
  return results;
}

export interface DailyRow {
  occurred_on: string;
  total: number;
}

export async function dailyExpenses(
  db: D1Database,
  householdId: string,
  fromInclusive: string,
  toExclusive: string,
): Promise<DailyRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.occurred_on, sum(t.amount) AS total
       FROM transactions t
       WHERE t.household_id = ? AND t.deleted_at IS NULL AND t.direction = 'expense'
         AND t.occurred_on >= ? AND t.occurred_on < ?
       GROUP BY t.occurred_on ORDER BY t.occurred_on`,
    )
    .bind(householdId, fromInclusive, toExclusive)
    .all<DailyRow>();
  return results;
}

export async function recentTransactions(
  db: D1Database,
  householdId: string,
  limit: number,
): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      `${TX_SELECT} WHERE t.household_id = ? AND t.deleted_at IS NULL
       ORDER BY t.occurred_on DESC, t.created_at DESC LIMIT ?`,
    )
    .bind(householdId, limit)
    .all<TransactionRow>();
  return results.map(mapTransaction);
}

/* ------------------------------------------------------------- embeddings */

export interface PendingEmbedRow {
  id: string;
  household_id: string;
  occurred_on: string;
  note: string;
  detail: string;
  payee: string;
  amount: number;
  direction: Direction;
  recurrence: Recurrence;
  expires_on: string | null;
  category_name: string | null;
}

export async function listPendingEmbeds(
  db: D1Database,
  householdId: string,
  limit: number,
): Promise<PendingEmbedRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.household_id, t.occurred_on, t.note, t.detail, t.payee,
              t.amount, t.direction, t.recurrence, t.expires_on, c.name AS category_name
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.household_id = ? AND t.deleted_at IS NULL
         AND t.embed_status IN ('pending', 'error', 'skipped')
       LIMIT ?`,
    )
    .bind(householdId, limit)
    .all<PendingEmbedRow>();
  return results;
}

export async function setEmbedStatus(
  db: D1Database,
  ids: string[],
  status: 'ok' | 'error' | 'pending' | 'skipped',
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db
    .prepare(`UPDATE transactions SET embed_status = ? WHERE id IN (${placeholders})`)
    .bind(status, ...ids)
    .run();
}

/* ---------------------------------------------------------- login attempts */

export interface LoginAttemptRow {
  key: string;
  fail_count: number;
  window_start: number;
}

export async function getLoginAttempt(
  db: D1Database,
  key: string,
): Promise<LoginAttemptRow | null> {
  return db.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(key).first<LoginAttemptRow>();
}

export async function bumpLoginAttempt(
  db: D1Database,
  key: string,
  now: number,
  windowMs: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (key, fail_count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         fail_count = CASE WHEN excluded.window_start - login_attempts.window_start > ?
                           THEN 1 ELSE login_attempts.fail_count + 1 END,
         window_start = CASE WHEN excluded.window_start - login_attempts.window_start > ?
                             THEN excluded.window_start ELSE login_attempts.window_start END`,
    )
    .bind(key, now, windowMs, windowMs)
    .run();
}

export async function clearLoginAttempt(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}

/* -------------------------------------------------- thành viên trong nhà */

const MEMBER_COLUMNS = `id, user_id, name, nickname, relation, color, icon, birth_date,
  sort_order, created_at, updated_at, deleted_at`;

interface FamilyMemberRow {
  id: string;
  user_id: string | null;
  name: string;
  nickname: string;
  relation: FamilyRelation;
  color: MemberColor;
  icon: string | null;
  birth_date: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function mapFamilyMember(row: FamilyMemberRow): FamilyMember {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    nickname: row.nickname,
    relation: row.relation,
    color: row.color,
    icon: row.icon,
    birthDate: row.birth_date,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listFamilyMembers(
  db: D1Database,
  householdId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<FamilyMember[]> {
  const where = ['household_id = ?'];
  if (!options.includeDeleted) where.push('deleted_at IS NULL');
  const { results } = await db
    .prepare(
      `SELECT ${MEMBER_COLUMNS} FROM family_members WHERE ${where.join(' AND ')}
       ORDER BY sort_order, name`,
    )
    .bind(householdId)
    .all<FamilyMemberRow>();
  return results.map(mapFamilyMember);
}

export async function getFamilyMember(
  db: D1Database,
  householdId: string,
  id: string,
  includeDeleted = false,
): Promise<FamilyMember | null> {
  const row = await db
    .prepare(
      `SELECT ${MEMBER_COLUMNS} FROM family_members WHERE household_id = ? AND id = ?${
        includeDeleted ? '' : ' AND deleted_at IS NULL'
      }`,
    )
    .bind(householdId, id)
    .first<FamilyMemberRow>();
  return row ? mapFamilyMember(row) : null;
}

export interface FamilyMemberInput {
  name: string;
  nickname: string;
  relation: FamilyRelation;
  color: MemberColor;
  icon: string | null;
  birthDate: string | null;
  userId: string | null;
  sortOrder: number;
}

export async function insertFamilyMember(
  db: D1Database,
  householdId: string,
  input: FamilyMemberInput,
  now: number,
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO family_members
         (id, household_id, user_id, name, nickname, relation, color, icon, birth_date,
          sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      householdId,
      input.userId,
      input.name,
      input.nickname,
      input.relation,
      input.color,
      input.icon,
      input.birthDate,
      input.sortOrder,
      now,
      now,
    )
    .run();
  return id;
}

export async function updateFamilyMember(
  db: D1Database,
  householdId: string,
  id: string,
  patch: Partial<FamilyMemberInput>,
  now: number,
): Promise<boolean> {
  const columns: Record<keyof FamilyMemberInput, string> = {
    name: 'name',
    nickname: 'nickname',
    relation: 'relation',
    color: 'color',
    icon: 'icon',
    birthDate: 'birth_date',
    userId: 'user_id',
    sortOrder: 'sort_order',
  };
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, column] of Object.entries(columns) as Array<[keyof FamilyMemberInput, string]>) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    binds.push(value);
  }
  if (sets.length === 0) return true;
  sets.push('updated_at = ?');
  binds.push(now, householdId, id);
  const res = await db
    .prepare(
      `UPDATE family_members SET ${sets.join(', ')}
       WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Số hoạt động đang gắn với người này — để nói rõ hậu quả trước khi xoá. */
export async function countActivitiesOfMember(
  db: D1Database,
  householdId: string,
  memberId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT count(*) AS n FROM activities
       WHERE household_id = ? AND member_id = ? AND deleted_at IS NULL`,
    )
    .bind(householdId, memberId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Xoá mềm. Hoạt động của người này giữ nguyên: truy vấn lịch join sang bảng này
 * và lọc deleted_at IS NULL, nên lịch của họ biến khỏi calendar rồi quay lại
 * nguyên vẹn khi khôi phục.
 */
export async function softDeleteFamilyMember(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE family_members SET deleted_at = ?, updated_at = ?
       WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(now, now, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function restoreFamilyMember(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE family_members SET deleted_at = NULL, updated_at = ?
       WHERE household_id = ? AND id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(now, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Tra theo tên — đúng khoá của idx_member_name. Dùng trên nhánh lỗi UNIQUE để
 * nói được chính xác cái gì trùng, thay vì đoán từ chuỗi lỗi của SQLite.
 */
export async function findFamilyMemberByName(
  db: D1Database,
  householdId: string,
  name: string,
): Promise<FamilyMember | null> {
  const row = await db
    .prepare(
      `SELECT ${MEMBER_COLUMNS} FROM family_members
       WHERE household_id = ? AND name = ? AND deleted_at IS NULL`,
    )
    .bind(householdId, name)
    .first<FamilyMemberRow>();
  return row ? mapFamilyMember(row) : null;
}

export async function findFamilyMemberByUserId(
  db: D1Database,
  householdId: string,
  userId: string,
): Promise<FamilyMember | null> {
  const row = await db
    .prepare(
      `SELECT ${MEMBER_COLUMNS} FROM family_members
       WHERE household_id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(householdId, userId)
    .first<FamilyMemberRow>();
  return row ? mapFamilyMember(row) : null;
}

/** Người này có phải thành viên của hộ (theo bảng memberships) không. */
export async function isHouseholdUser(
  db: D1Database,
  householdId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM memberships WHERE household_id = ? AND user_id = ?')
    .bind(householdId, userId)
    .first<{ ok: number }>();
  return row !== null;
}

/* ------------------------------------------------------- lịch hoạt động */

const ACTIVITY_COLUMNS = `a.id, a.member_id, a.title, a.kind, a.location, a.note,
  a.days_of_week, a.start_minute, a.duration_min, a.effective_from, a.effective_to,
  a.created_at, a.updated_at, a.deleted_at`;

export interface ActivityRow {
  id: string;
  member_id: string;
  title: string;
  kind: ActivityKind;
  location: string;
  note: string;
  days_of_week: string;
  start_minute: number;
  duration_min: number;
  effective_from: string;
  effective_to: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  member_name?: string;
}

/** '1,3,5' → [1,3,5]. Chuỗi rỗng cho mảng rỗng chứ không phải [NaN]. */
export function parseDaysOfWeek(raw: string): Weekday[] {
  return raw
    .split(',')
    .filter((part) => part !== '')
    .map(Number) as Weekday[];
}

export function mapActivity(row: ActivityRow): Activity {
  const endMinute = row.start_minute + row.duration_min;
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name ?? '',
    title: row.title,
    kind: row.kind,
    location: row.location,
    note: row.note,
    daysOfWeek: parseDaysOfWeek(row.days_of_week),
    startTime: toTimeLabel(row.start_minute),
    endTime: toTimeLabel(endMinute),
    durationMin: row.duration_min,
    overnight: isOvernight(row.start_minute, row.duration_min),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listActivities(
  db: D1Database,
  householdId: string,
  options: { memberId?: string; kind?: ActivityKind; includeDeleted?: boolean } = {},
): Promise<Activity[]> {
  const where = ['a.household_id = ?'];
  const binds: unknown[] = [householdId];
  if (!options.includeDeleted) where.push('a.deleted_at IS NULL');
  if (options.memberId) {
    where.push('a.member_id = ?');
    binds.push(options.memberId);
  }
  if (options.kind) {
    where.push('a.kind = ?');
    binds.push(options.kind);
  }
  const { results } = await db
    .prepare(
      `SELECT ${ACTIVITY_COLUMNS}, m.name AS member_name
       FROM activities a JOIN family_members m ON m.id = a.member_id
       WHERE ${where.join(' AND ')}
       ORDER BY m.sort_order, m.name, a.start_minute, a.title`,
    )
    .bind(...binds)
    .all<ActivityRow>();
  return results.map(mapActivity);
}

export async function getActivity(
  db: D1Database,
  householdId: string,
  id: string,
  includeDeleted = false,
): Promise<Activity | null> {
  const row = await db
    .prepare(
      `SELECT ${ACTIVITY_COLUMNS}, m.name AS member_name
       FROM activities a JOIN family_members m ON m.id = a.member_id
       WHERE a.household_id = ? AND a.id = ?${includeDeleted ? '' : ' AND a.deleted_at IS NULL'}`,
    )
    .bind(householdId, id)
    .first<ActivityRow>();
  return row ? mapActivity(row) : null;
}

export interface ActivityInput {
  memberId: string;
  title: string;
  kind: ActivityKind;
  location: string;
  note: string;
  daysOfWeek: number[];
  startMinute: number;
  durationMin: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export async function insertActivity(
  db: D1Database,
  householdId: string,
  input: ActivityInput,
  now: number,
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO activities
         (id, household_id, member_id, title, kind, location, note, days_of_week,
          start_minute, duration_min, effective_from, effective_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      householdId,
      input.memberId,
      input.title,
      input.kind,
      input.location,
      input.note,
      input.daysOfWeek.join(','),
      input.startMinute,
      input.durationMin,
      input.effectiveFrom,
      input.effectiveTo,
      now,
      now,
    )
    .run();
  return id;
}

export async function updateActivity(
  db: D1Database,
  householdId: string,
  id: string,
  patch: Partial<ActivityInput>,
  now: number,
): Promise<boolean> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    binds.push(value);
  };
  if (patch.memberId !== undefined) push('member_id', patch.memberId);
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.kind !== undefined) push('kind', patch.kind);
  if (patch.location !== undefined) push('location', patch.location);
  if (patch.note !== undefined) push('note', patch.note);
  if (patch.daysOfWeek !== undefined) push('days_of_week', patch.daysOfWeek.join(','));
  if (patch.startMinute !== undefined) push('start_minute', patch.startMinute);
  if (patch.durationMin !== undefined) push('duration_min', patch.durationMin);
  if (patch.effectiveFrom !== undefined) push('effective_from', patch.effectiveFrom);
  if (patch.effectiveTo !== undefined) push('effective_to', patch.effectiveTo);
  if (sets.length === 0) return true;
  push('updated_at', now);
  binds.push(householdId, id);
  const res = await db
    .prepare(
      `UPDATE activities SET ${sets.join(', ')}
       WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function softDeleteActivity(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE activities SET deleted_at = ?, updated_at = ?
       WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(now, now, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function restoreActivity(
  db: D1Database,
  householdId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE activities SET deleted_at = NULL, updated_at = ?
       WHERE household_id = ? AND id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(now, householdId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Chép mọi khuôn mẫu đang dùng của một người sang một người khác.
 *
 * Đi một D1 batch (batch là một transaction) để không bao giờ để lại nửa cái
 * lịch nếu có câu nào hỏng giữa chừng.
 *
 * Ngoại lệ KHÔNG được chép: "Mẹ nghỉ buổi 2/9" là chuyện riêng của Mẹ, đem sang
 * người khác là sai. Bản chép luôn là lịch sạch theo đúng khuôn mẫu.
 */
export async function copyActivitiesToMember(
  db: D1Database,
  householdId: string,
  fromMemberId: string,
  toMemberId: string,
  now: number,
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT title, kind, location, note, days_of_week, start_minute, duration_min,
              effective_from, effective_to
       FROM activities
       WHERE household_id = ? AND member_id = ? AND deleted_at IS NULL
       ORDER BY start_minute, title`,
    )
    .bind(householdId, fromMemberId)
    .all<{
      title: string;
      kind: ActivityKind;
      location: string;
      note: string;
      days_of_week: string;
      start_minute: number;
      duration_min: number;
      effective_from: string;
      effective_to: string | null;
    }>();
  if (results.length === 0) return 0;

  await db.batch(
    results.map((r) =>
      db
        .prepare(
          `INSERT INTO activities
             (id, household_id, member_id, title, kind, location, note, days_of_week,
              start_minute, duration_min, effective_from, effective_to, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          householdId,
          toMemberId,
          r.title,
          r.kind,
          r.location,
          r.note,
          r.days_of_week,
          r.start_minute,
          r.duration_min,
          r.effective_from,
          r.effective_to,
          now,
          now,
        ),
    ),
  );
  return results.length;
}

/* ------------------------------------------------------ ngoại lệ từng buổi */

export interface ExceptionRow {
  id: string;
  activity_id: string;
  occurs_on: string;
  status: 'cancelled' | 'moved';
  new_date: string | null;
  new_start_minute: number | null;
  new_duration_min: number | null;
  note: string;
}

const EXCEPTION_COLUMNS = `id, activity_id, occurs_on, status, new_date, new_start_minute,
  new_duration_min, note`;

export function mapException(row: ExceptionRow): ActivityException {
  return {
    id: row.id,
    activityId: row.activity_id,
    occursOn: row.occurs_on,
    status: row.status,
    newDate: row.new_date,
    newStartTime: row.new_start_minute === null ? null : toTimeLabel(row.new_start_minute),
    newDurationMin: row.new_duration_min,
    note: row.note,
  };
}

export async function listExceptionsOfActivity(
  db: D1Database,
  householdId: string,
  activityId: string,
): Promise<ActivityException[]> {
  const { results } = await db
    .prepare(
      `SELECT ${EXCEPTION_COLUMNS} FROM activity_exceptions
       WHERE household_id = ? AND activity_id = ? ORDER BY occurs_on`,
    )
    .bind(householdId, activityId)
    .all<ExceptionRow>();
  return results.map(mapException);
}

export interface ExceptionInput {
  activityId: string;
  occursOn: string;
  status: 'cancelled' | 'moved';
  newDate: string | null;
  newStartMinute: number | null;
  newDurationMin: number | null;
  note: string;
}

export async function insertException(
  db: D1Database,
  householdId: string,
  input: ExceptionInput,
  now: number,
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO activity_exceptions
         (id, household_id, activity_id, occurs_on, status, new_date, new_start_minute,
          new_duration_min, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      householdId,
      input.activityId,
      input.occursOn,
      input.status,
      input.newDate,
      input.newStartMinute,
      input.newDurationMin,
      input.note,
      now,
    )
    .run();
  return id;
}

/** Xoá hẳn: ngoại lệ chính là cái "undo" của một buổi, xoá mềm nó thì vô nghĩa. */
export async function deleteException(
  db: D1Database,
  householdId: string,
  activityId: string,
  occursOn: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `DELETE FROM activity_exceptions
       WHERE household_id = ? AND activity_id = ? AND occurs_on = ?`,
    )
    .bind(householdId, activityId, occursOn)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/* ------------------------------------------------- nạp dữ liệu cho calendar */

/**
 * Khuôn mẫu có thể sinh buổi trong [from, toExclusive).
 *
 * Join sang family_members và lọc deleted_at IS NULL ở cả hai bảng: lịch của
 * thành viên đã xoá mềm phải biến khỏi calendar.
 */
export async function listActivitiesInRange(
  db: D1Database,
  householdId: string,
  range: { from: string; toExclusive: string; memberId?: string; kind?: ActivityKind },
): Promise<ActivityRow[]> {
  const where = [
    'a.household_id = ?',
    'a.deleted_at IS NULL',
    'm.deleted_at IS NULL',
    'a.effective_from < ?',
    '(a.effective_to IS NULL OR a.effective_to >= ?)',
  ];
  const binds: unknown[] = [householdId, range.toExclusive, range.from];
  if (range.memberId) {
    where.push('a.member_id = ?');
    binds.push(range.memberId);
  }
  if (range.kind) {
    where.push('a.kind = ?');
    binds.push(range.kind);
  }
  const { results } = await db
    .prepare(
      `SELECT ${ACTIVITY_COLUMNS}, m.name AS member_name
       FROM activities a JOIN family_members m ON m.id = a.member_id
       WHERE ${where.join(' AND ')}`,
    )
    .bind(...binds)
    .all<ActivityRow>();
  return results;
}

/**
 * Ngoại lệ liên quan tới khoảng đang xem.
 *
 * Lấy theo `occurs_on` (buổi gốc nằm trong khoảng) HOẶC `new_date` (buổi bị dời
 * từ ngoài khoảng vào trong) — thiếu vế thứ hai là mất buổi đã dời tới.
 * Nới hai đầu một ngày để ca qua đêm ở biên không bị sót ngoại lệ của nó.
 */
export async function listExceptionsInRange(
  db: D1Database,
  householdId: string,
  range: { from: string; toExclusive: string },
): Promise<ExceptionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${EXCEPTION_COLUMNS} FROM activity_exceptions
       WHERE household_id = ?
         AND ((occurs_on >= ? AND occurs_on < ?) OR (new_date >= ? AND new_date < ?))`,
    )
    .bind(householdId, range.from, range.toExclusive, range.from, range.toExclusive)
    .all<ExceptionRow>();
  return results;
}

/** Mọi ngoại lệ của một nhóm khuôn mẫu — dùng khi cần đủ ngữ cảnh chứ không chỉ trong khoảng. */
export async function listExceptionsForActivities(
  db: D1Database,
  householdId: string,
  activityIds: string[],
): Promise<ExceptionRow[]> {
  if (activityIds.length === 0) return [];
  const holes = activityIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT ${EXCEPTION_COLUMNS} FROM activity_exceptions
       WHERE household_id = ? AND activity_id IN (${holes})`,
    )
    .bind(householdId, ...activityIds)
    .all<ExceptionRow>();
  return results;
}

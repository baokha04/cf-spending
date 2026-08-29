/**
 * Toàn bộ SQL của ứng dụng.
 *
 * Quy tắc bất di bất dịch: mọi hàm chạm tới dữ liệu của một hộ gia đình đều
 * nhận `householdId` làm tham số bắt buộc và đưa nó vào mệnh đề WHERE. Không
 * có đường nào đọc được giao dịch mà bỏ qua điều kiện này.
 */
import type {
  Category,
  Direction,
  LargeTransactionGroup,
  MemberRole,
  PaymentMethod,
  Recurrence,
  Transaction,
  Member,
} from '../../shared/types';
import { newId } from '../ids';

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
         t.amount, t.direction, t.recurrence,
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
          amount, direction, recurrence, category_id, embed_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              t.amount, t.direction, t.recurrence, c.name AS category_name
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

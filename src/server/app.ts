import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppBindings, Env } from './env';
import { aiEnabled } from './env';
import {
  SESSION_TTL_MS,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  readSessionCookie,
  sessionCookie,
  verifyPassword,
} from './auth';
import { csrfGuard, isSecure, requireAuth, requireOwner } from './middleware';
import { newId, newInviteCode, normalizeInviteCode } from './ids';
import * as db from './db/queries';
import {
  MAX_SCHEDULE_SPAN_DAYS,
  activityCopySchema,
  activityCreateSchema,
  activityKindParam,
  activityExceptionSchema,
  activityUpdateSchema,
  askSchema,
  categoryCreateSchema,
  expiringQuerySchema,
  categoryUpdateSchema,
  familyMemberCreateSchema,
  familyMemberUpdateSchema,
  EXPIRY_ORDER_MESSAGE,
  formatZodError,
  joinSchema,
  largeQuerySchema,
  loginSchema,
  monthParam,
  registerSchema,
  scheduleQuerySchema,
  transactionCreateSchema,
  transactionUpdateSchema,
} from './validators';
import {
  addDays,
  currentMonthInVietnam,
  daysBetween,
  isValidDate,
  isoWeekday,
  monthEndExclusive,
  monthStart,
  todayInVietnam,
} from './dates';
import { durationBetween, toMinutes } from '../shared/time';
import { daysUntil } from '../shared/expiry';
import { expandOccurrences } from './schedule';
import { buildDashboardSummary } from './dashboard';
import { deleteTransactionVector, embedTransactionById, upsertTransactionVectors } from './ai/embed';
import { semanticSearch } from './ai/search';
import { askAboutSpending } from './ai/ask';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const REINDEX_BATCH = 50;

/** Chạy công việc nền nếu runtime có executionCtx; nếu không thì chờ luôn (test). */
function background(c: Context<AppBindings>, work: Promise<unknown>): void {
  const swallow = work.catch((err) => console.error('background task lỗi', err));
  try {
    c.executionCtx.waitUntil(swallow);
  } catch {
    // Không có execution context (ví dụ trong unit test) — bỏ qua, reindex sẽ dọn sau.
  }
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown):
  | { ok: true; data: z.infer<T> }
  | { ok: false; message: string } {
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, message: formatZodError(parsed.error) };
}

async function readJson(c: Context<AppBindings>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export const app = new Hono<AppBindings>().basePath('/api');

app.use('*', csrfGuard);

app.onError((err, c) => {
  console.error('Lỗi không bắt được', err);
  return c.json({ error: 'Có lỗi xảy ra ở máy chủ' }, 500);
});

app.notFound((c) => c.json({ error: 'Không tìm thấy endpoint' }, 404));

/* ===================================================================== auth */

app.post('/auth/register', async (c) => {
  const parsed = parseBody(registerSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const { email, password, displayName, householdName, inviteCode } = parsed.data;

  if (await db.findUserByEmail(c.env.DB, email)) {
    return c.json({ error: 'Email này đã được đăng ký' }, 409);
  }

  const now = Date.now();
  let householdId: string;
  let role: 'owner' | 'member';

  // Cả việc tạo hộ lẫn tạo tài khoản đi chung một batch (D1 batch là một
  // transaction), nếu không một lỗi ở bước sau sẽ để lại hộ mồ côi không ai vào được.
  const statements: D1PreparedStatement[] = [];

  if (inviteCode) {
    const household = await db.findHouseholdByInviteCode(c.env.DB, normalizeInviteCode(inviteCode));
    if (!household) return c.json({ error: 'Mã mời không đúng' }, 404);
    householdId = household.id;
    role = 'member';
  } else {
    householdId = newId();
    role = 'owner';
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO households (id, name, invite_code, currency, created_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(householdId, householdName!, newInviteCode(), 'VND', now),
    );
  }

  const userId = newId();
  const pw = await hashPassword(password);
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, kdf_iterations, display_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(userId, email, pw.hash, pw.salt, pw.iterations, displayName, now),
    c.env.DB.prepare(
      'INSERT INTO memberships (user_id, household_id, role, joined_at) VALUES (?, ?, ?, ?)',
    ).bind(userId, householdId, role, now),
  );

  // Hộ mới thì kèm luôn bộ danh mục mặc định để dùng được ngay.
  if (role === 'owner') {
    for (const cat of db.DEFAULT_CATEGORIES) {
      statements.push(
        c.env.DB.prepare(
          'INSERT INTO categories (id, household_id, name, kind, icon, is_archived, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        ).bind(newId(), householdId, cat.name, cat.kind, cat.icon, now),
      );
    }
  }
  await c.env.DB.batch(statements);

  const { token, id: sessionId } = await createSessionToken();
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(sessionId, userId, now, now + SESSION_TTL_MS)
    .run();

  c.header('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), isSecure(c.req.url)));
  return c.json(await meResponse(c.env, userId), 201);
});

app.post('/auth/login', async (c) => {
  const parsed = parseBody(loginSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const { email, password } = parsed.data;
  const now = Date.now();

  const attemptKey = `email:${email}`;
  const attempt = await db.getLoginAttempt(c.env.DB, attemptKey);
  if (
    attempt &&
    attempt.fail_count >= LOGIN_MAX_FAILURES &&
    now - attempt.window_start < LOGIN_WINDOW_MS
  ) {
    return c.json({ error: 'Sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' }, 429);
  }

  const user = await db.findUserByEmail(c.env.DB, email);
  const valid =
    user !== null &&
    (await verifyPassword(password, {
      hash: user.password_hash,
      salt: user.password_salt,
      iterations: user.kdf_iterations,
    }));

  if (!user || !valid) {
    await db.bumpLoginAttempt(c.env.DB, attemptKey, now, LOGIN_WINDOW_MS);
    // Cùng một thông báo cho mọi trường hợp: không tiết lộ email có tồn tại hay không.
    return c.json({ error: 'Email hoặc mật khẩu không đúng' }, 401);
  }

  await db.clearLoginAttempt(c.env.DB, attemptKey);
  const { token, id: sessionId } = await createSessionToken();
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(sessionId, user.id, now, now + SESSION_TTL_MS)
    .run();

  c.header('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), isSecure(c.req.url)));
  return c.json(await meResponse(c.env, user.id));
});

app.post('/auth/logout', async (c) => {
  const token = readSessionCookie(c.req.header('cookie'));
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await hashSessionToken(token)).run();
  }
  c.header('Set-Cookie', clearSessionCookie(isSecure(c.req.url)));
  return c.json({ ok: true });
});

app.get('/auth/me', requireAuth, async (c) => c.json(await meResponse(c.env, c.get('user').id)));

async function meResponse(env: Env, userId: string) {
  const user = await db.findUserById(env.DB, userId);
  const membership = await db.findMembership(env.DB, userId);
  if (!user || !membership) throw new Error('Không dựng được thông tin phiên đăng nhập');
  const household = await db.findHouseholdById(env.DB, membership.household_id);
  if (!household) throw new Error('Hộ gia đình không tồn tại');
  return {
    user: { id: user.id, email: user.email, displayName: user.display_name },
    household: {
      id: household.id,
      name: household.name,
      inviteCode: household.invite_code,
      currency: household.currency,
      role: membership.role,
    },
  };
}

/* ================================================================ household */

app.get('/household/members', requireAuth, async (c) =>
  c.json({ members: await db.listMembers(c.env.DB, c.get('householdId')) }),
);

app.post('/household/join', requireAuth, async (c) => {
  const parsed = parseBody(joinSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);

  const target = await db.findHouseholdByInviteCode(
    c.env.DB,
    normalizeInviteCode(parsed.data.inviteCode),
  );
  if (!target) return c.json({ error: 'Mã mời không đúng' }, 404);
  if (target.id === c.get('householdId')) {
    return c.json({ error: 'Bạn đã ở trong hộ gia đình này' }, 400);
  }
  // Mỗi tài khoản thuộc đúng một hộ: chuyển hộ là thay membership hiện có.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM memberships WHERE user_id = ?').bind(c.get('user').id),
    c.env.DB.prepare(
      'INSERT INTO memberships (user_id, household_id, role, joined_at) VALUES (?, ?, ?, ?)',
    ).bind(c.get('user').id, target.id, 'member', Date.now()),
  ]);
  return c.json(await meResponse(c.env, c.get('user').id));
});

app.post('/household/invite-code/rotate', requireAuth, requireOwner, async (c) => {
  const code = newInviteCode();
  await db.rotateInviteCode(c.env.DB, c.get('householdId'), code);
  return c.json({ inviteCode: code });
});

/* =============================================================== categories */

app.get('/categories', requireAuth, async (c) => {
  return c.json({
    categories: await db.listCategories(c.env.DB, c.get('householdId'), {
      includeArchived: c.req.query('includeArchived') === '1',
      includeDeleted: c.req.query('includeDeleted') === '1',
    }),
  });
});

app.post('/categories', requireAuth, async (c) => {
  const parsed = parseBody(categoryCreateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  try {
    const created = await db.insertCategory(
      c.env.DB,
      c.get('householdId'),
      { name: parsed.data.name, kind: parsed.data.kind, icon: parsed.data.icon ?? null },
      Date.now(),
    );
    return c.json(created, 201);
  } catch (err) {
    if (!String(err).includes('UNIQUE')) throw err;
    // Chỗ bị chiếm có thể là một danh mục đã xoá — ràng buộc UNIQUE tính cả
    // hàng đã xoá mềm. Khôi phục nó lại (kèm biểu tượng mới) thay vì bắt người
    // dùng đi tìm trong danh sách đã xoá; tên trùng với danh mục đang dùng thì
    // vẫn từ chối như cũ.
    const existing = await db.findCategoryByName(
      c.env.DB,
      c.get('householdId'),
      parsed.data.kind,
      parsed.data.name,
    );
    if (!existing || existing.deletedAt === null) {
      return c.json({ error: 'Danh mục cùng tên và cùng loại đã tồn tại' }, 409);
    }
    await db.restoreCategory(c.env.DB, c.get('householdId'), existing.id);
    await db.updateCategory(c.env.DB, c.get('householdId'), existing.id, {
      icon: parsed.data.icon ?? null,
      isArchived: false,
    });
    const restored = await db.getCategory(c.env.DB, c.get('householdId'), existing.id);
    return c.json({ ...restored!, restored: true }, 200);
  }
});

app.patch('/categories/:id', requireAuth, async (c) => {
  const parsed = parseBody(categoryUpdateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const patch = {
    name: parsed.data.name,
    icon: parsed.data.icon === undefined ? undefined : (parsed.data.icon ?? null),
    isArchived: parsed.data.isArchived,
  };
  try {
    const ok = await db.updateCategory(c.env.DB, c.get('householdId'), c.req.param('id'), patch);
    if (!ok) return c.json({ error: 'Không tìm thấy danh mục' }, 404);
  } catch (err) {
    // Đổi tên trùng một danh mục khác cùng loại — ràng buộc UNIQUE của bảng.
    if (String(err).includes('UNIQUE')) {
      return c.json({ error: 'Danh mục cùng tên và cùng loại đã tồn tại' }, 409);
    }
    throw err;
  }
  return c.json(await db.getCategory(c.env.DB, c.get('householdId'), c.req.param('id')));
});

/**
 * Xoá danh mục cũng chỉ là xoá mềm: hàng ở lại nên giao dịch cũ giữ nguyên
 * nhãn, còn ô chọn danh mục thì không thấy nó nữa. Trả về số giao dịch đang
 * mang nhãn này để giao diện nói rõ hậu quả.
 */
app.delete('/categories/:id', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const used = await db.countTransactionsInCategory(c.env.DB, householdId, id);
  const ok = await db.softDeleteCategory(c.env.DB, householdId, id, Date.now());
  if (!ok) return c.json({ error: 'Không tìm thấy danh mục' }, 404);
  return c.json({ deleted: true, transactions: used });
});

app.post('/categories/:id/restore', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const ok = await db.restoreCategory(c.env.DB, householdId, id);
  if (!ok) return c.json({ error: 'Không tìm thấy danh mục đã xoá' }, 404);
  return c.json(await db.getCategory(c.env.DB, householdId, id));
});

/* ==================================================== thành viên trong nhà */

/**
 * Danh mục người trong nhà — tách hẳn khỏi `memberships` (tài khoản đăng nhập)
 * để thêm được cả con nhỏ, ông bà. `userId` là cầu nối tuỳ chọn giữa hai bên.
 */

/**
 * Tài khoản gắn vào phải thuộc cùng hộ và chưa gắn cho ai khác.
 * Hai lỗi khác hạng: sai tài khoản là dữ liệu hỏng (400), còn tài khoản đã có
 * chủ là tranh chấp với một hàng đang tồn tại (409).
 */
async function validateMemberUser(
  env: Env,
  householdId: string,
  userId: string | null | undefined,
  selfId?: string,
): Promise<{ message: string; status: 400 | 409 } | null> {
  if (!userId) return null;
  if (!(await db.isHouseholdUser(env.DB, householdId, userId))) {
    return { message: 'Tài khoản này không ở trong hộ gia đình', status: 400 };
  }
  const taken = await db.findFamilyMemberByUserId(env.DB, householdId, userId);
  if (taken && taken.id !== selfId) {
    return { message: 'Tài khoản này đã gắn với một thành viên khác', status: 409 };
  }
  return null;
}

/** Đọc lại nguyên nhân UNIQUE thay vì đoán từ chuỗi lỗi của SQLite. */
async function memberConflictMessage(
  env: Env,
  householdId: string,
  name: string,
  userId: string | null,
  selfId?: string,
): Promise<string> {
  const byName = await db.findFamilyMemberByName(env.DB, householdId, name);
  if (byName && byName.id !== selfId) return 'Đã có thành viên tên này trong nhà';
  if (userId) {
    const byUser = await db.findFamilyMemberByUserId(env.DB, householdId, userId);
    if (byUser && byUser.id !== selfId) return 'Tài khoản này đã gắn với một thành viên khác';
  }
  return 'Thành viên bị trùng với một người đã có';
}

app.get('/family-members', requireAuth, async (c) =>
  c.json({
    members: await db.listFamilyMembers(c.env.DB, c.get('householdId'), {
      includeDeleted: c.req.query('includeDeleted') === '1',
    }),
  }),
);

app.post('/family-members', requireAuth, async (c) => {
  const parsed = parseBody(familyMemberCreateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const input = {
    name: parsed.data.name,
    nickname: parsed.data.nickname,
    relation: parsed.data.relation,
    color: parsed.data.color,
    icon: parsed.data.icon ?? null,
    birthDate: parsed.data.birthDate ?? null,
    userId: parsed.data.userId ?? null,
    sortOrder: parsed.data.sortOrder,
  };

  const userError = await validateMemberUser(c.env, householdId, input.userId);
  if (userError) return c.json({ error: userError.message }, userError.status);

  let id: string;
  try {
    id = await db.insertFamilyMember(c.env.DB, householdId, input, Date.now());
  } catch (err) {
    if (!String(err).includes('UNIQUE')) throw err;
    // Ràng buộc là partial index WHERE deleted_at IS NULL, nên chỗ bị chiếm chắc
    // chắn là một người đang dùng — không có đường "khôi phục khi trùng" như
    // /categories, cứ báo trùng là đúng.
    return c.json(
      { error: await memberConflictMessage(c.env, householdId, input.name, input.userId) },
      409,
    );
  }
  return c.json(await db.getFamilyMember(c.env.DB, householdId, id), 201);
});

app.patch('/family-members/:id', requireAuth, async (c) => {
  const parsed = parseBody(familyMemberUpdateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const id = c.req.param('id');

  const patch = {
    ...parsed.data,
    // Gửi lên null nghĩa là gỡ; không gửi trường thì giữ nguyên.
    icon: parsed.data.icon === undefined ? undefined : (parsed.data.icon ?? null),
    birthDate: parsed.data.birthDate === undefined ? undefined : (parsed.data.birthDate ?? null),
    userId: parsed.data.userId === undefined ? undefined : (parsed.data.userId ?? null),
  };

  const userError = await validateMemberUser(c.env, householdId, patch.userId, id);
  if (userError) return c.json({ error: userError.message }, userError.status);

  try {
    const ok = await db.updateFamilyMember(c.env.DB, householdId, id, patch, Date.now());
    if (!ok) return c.json({ error: 'Không tìm thấy thành viên' }, 404);
  } catch (err) {
    if (!String(err).includes('UNIQUE')) throw err;
    return c.json(
      {
        error: await memberConflictMessage(
          c.env,
          householdId,
          patch.name ?? '',
          patch.userId ?? null,
          id,
        ),
      },
      409,
    );
  }
  return c.json(await db.getFamilyMember(c.env.DB, householdId, id));
});

/**
 * Xoá mềm. Hoạt động của người này ở nguyên chỗ cũ: truy vấn lịch lọc theo
 * `family_members.deleted_at`, nên lịch của họ biến khỏi calendar rồi quay lại
 * đầy đủ khi khôi phục. Trả về số hoạt động để giao diện nói rõ hậu quả.
 */
app.delete('/family-members/:id', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const activities = await db.countActivitiesOfMember(c.env.DB, householdId, id);
  const ok = await db.softDeleteFamilyMember(c.env.DB, householdId, id, Date.now());
  if (!ok) return c.json({ error: 'Không tìm thấy thành viên' }, 404);
  return c.json({ deleted: true, activities });
});

app.post('/family-members/:id/restore', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const ok = await db.restoreFamilyMember(c.env.DB, householdId, id, Date.now());
  if (!ok) return c.json({ error: 'Không tìm thấy thành viên đã xoá' }, 404);
  return c.json(await db.getFamilyMember(c.env.DB, householdId, id));
});

/* ========================================================= lịch hoạt động */

/** Thành viên phải thuộc cùng hộ và chưa bị xoá. */
async function validateActivityMember(
  env: Env,
  householdId: string,
  memberId: string,
): Promise<string | null> {
  const member = await db.getFamilyMember(env.DB, householdId, memberId, true);
  if (!member) return 'Thành viên không tồn tại';
  if (member.deletedAt !== null) return 'Thành viên đã bị xoá — khôi phục lại trước khi dùng';
  return null;
}

app.get('/activities', requireAuth, async (c) => {
  const kind = c.req.query('kind');
  const parsedKind = kind === undefined ? undefined : activityKindParam.safeParse(kind);
  if (parsedKind && !parsedKind.success) {
    return c.json({ error: formatZodError(parsedKind.error) }, 400);
  }
  return c.json({
    activities: await db.listActivities(c.env.DB, c.get('householdId'), {
      memberId: c.req.query('memberId'),
      kind: parsedKind?.data,
      includeDeleted: c.req.query('includeDeleted') === '1',
    }),
  });
});

/**
 * Chép cả lịch của một người sang một người khác — hai đứa con học cùng lớp thì
 * khai một lần rồi chép, khỏi gõ lại từng buổi.
 *
 * Đặt TRƯỚC '/activities/:id' cho chắc: dự án đã dính một lần với
 * '/transactions/large' bị hiểu thành một id.
 */
app.post('/activities/copy', requireAuth, async (c) => {
  const parsed = parseBody(activityCopySchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const { fromMemberId, toMemberId } = parsed.data;

  const [from, to] = await Promise.all([
    db.getFamilyMember(c.env.DB, householdId, fromMemberId),
    db.getFamilyMember(c.env.DB, householdId, toMemberId),
  ]);
  if (!from) return c.json({ error: 'Không tìm thấy người có lịch cần chép' }, 404);
  if (!to) return c.json({ error: 'Không tìm thấy người nhận lịch' }, 404);

  const copied = await db.copyActivitiesToMember(
    c.env.DB,
    householdId,
    fromMemberId,
    toMemberId,
    Date.now(),
  );
  return c.json({ copied, fromName: from.name, toName: to.name });
});

app.post('/activities', requireAuth, async (c) => {
  const parsed = parseBody(activityCreateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');

  const memberError = await validateActivityMember(c.env, householdId, parsed.data.memberId);
  if (memberError) return c.json({ error: memberError }, 400);

  const startMinute = toMinutes(parsed.data.startTime);
  const durationMin = durationBetween(startMinute, toMinutes(parsed.data.endTime));
  if (durationMin === null) return c.json({ error: 'Giờ kết thúc phải khác giờ bắt đầu' }, 400);

  const id = await db.insertActivity(
    c.env.DB,
    householdId,
    {
      memberId: parsed.data.memberId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      location: parsed.data.location,
      note: parsed.data.note,
      daysOfWeek: parsed.data.daysOfWeek,
      startMinute,
      durationMin,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo ?? null,
    },
    Date.now(),
  );
  return c.json(await db.getActivity(c.env.DB, householdId, id), 201);
});

app.patch('/activities/:id', requireAuth, async (c) => {
  const parsed = parseBody(activityUpdateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const id = c.req.param('id');

  const existing = await db.getActivity(c.env.DB, householdId, id);
  if (!existing) return c.json({ error: 'Không tìm thấy hoạt động' }, 404);

  if (parsed.data.memberId !== undefined) {
    const memberError = await validateActivityMember(c.env, householdId, parsed.data.memberId);
    if (memberError) return c.json({ error: memberError }, 400);
  }

  // Khoảng hiệu lực mới phải nhất quán với phần không gửi lên lần này.
  const effectiveFrom = parsed.data.effectiveFrom ?? existing.effectiveFrom;
  const effectiveTo =
    parsed.data.effectiveTo === undefined ? existing.effectiveTo : (parsed.data.effectiveTo ?? null);
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return c.json({ error: 'Ngày kết thúc phải từ ngày bắt đầu trở đi' }, 400);
  }

  let startMinute: number | undefined;
  let durationMin: number | undefined;
  if (parsed.data.startTime !== undefined && parsed.data.endTime !== undefined) {
    startMinute = toMinutes(parsed.data.startTime);
    const computed = durationBetween(startMinute, toMinutes(parsed.data.endTime));
    if (computed === null) return c.json({ error: 'Giờ kết thúc phải khác giờ bắt đầu' }, 400);
    durationMin = computed;
  }

  const ok = await db.updateActivity(
    c.env.DB,
    householdId,
    id,
    {
      memberId: parsed.data.memberId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      location: parsed.data.location,
      note: parsed.data.note,
      daysOfWeek: parsed.data.daysOfWeek,
      startMinute,
      durationMin,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo === undefined ? undefined : effectiveTo,
    },
    Date.now(),
  );
  if (!ok) return c.json({ error: 'Không tìm thấy hoạt động' }, 404);
  return c.json(await db.getActivity(c.env.DB, householdId, id));
});

app.delete('/activities/:id', requireAuth, async (c) => {
  const ok = await db.softDeleteActivity(
    c.env.DB,
    c.get('householdId'),
    c.req.param('id'),
    Date.now(),
  );
  if (!ok) return c.json({ error: 'Không tìm thấy hoạt động' }, 404);
  return c.json({ deleted: true });
});

app.post('/activities/:id/restore', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const ok = await db.restoreActivity(c.env.DB, householdId, id, Date.now());
  if (!ok) return c.json({ error: 'Không tìm thấy hoạt động đã xoá' }, 404);
  return c.json(await db.getActivity(c.env.DB, householdId, id));
});

app.get('/activities/:id/exceptions', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  if (!(await db.getActivity(c.env.DB, householdId, id, true))) {
    return c.json({ error: 'Không tìm thấy hoạt động' }, 404);
  }
  return c.json({ exceptions: await db.listExceptionsOfActivity(c.env.DB, householdId, id) });
});

/** Nghỉ hoặc dời đúng một buổi. Một buổi chỉ mang được một ngoại lệ. */
app.post('/activities/:id/exceptions', requireAuth, async (c) => {
  const parsed = parseBody(activityExceptionSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const id = c.req.param('id');

  const activity = await db.getActivity(c.env.DB, householdId, id);
  if (!activity) return c.json({ error: 'Không tìm thấy hoạt động' }, 404);

  // Ngoại lệ phải trỏ vào một buổi có thật, nếu không nó nằm chết trong bảng.
  const { occursOn } = parsed.data;
  const weekday = isoWeekday(occursOn);
  if (
    !activity.daysOfWeek.includes(weekday as never) ||
    occursOn < activity.effectiveFrom ||
    (activity.effectiveTo !== null && occursOn > activity.effectiveTo)
  ) {
    return c.json({ error: 'Ngày này không có buổi nào của hoạt động' }, 400);
  }

  let newStartMinute: number | null = null;
  let newDurationMin: number | null = null;
  if (parsed.data.newStartTime && parsed.data.newEndTime) {
    newStartMinute = toMinutes(parsed.data.newStartTime);
    newDurationMin = durationBetween(newStartMinute, toMinutes(parsed.data.newEndTime));
    if (newDurationMin === null) return c.json({ error: 'Giờ kết thúc phải khác giờ bắt đầu' }, 400);
  }

  try {
    await db.insertException(
      c.env.DB,
      householdId,
      {
        activityId: id,
        occursOn,
        status: parsed.data.status,
        newDate: parsed.data.newDate ?? null,
        newStartMinute,
        newDurationMin,
        note: parsed.data.note,
      },
      Date.now(),
    );
  } catch (err) {
    if (!String(err).includes('UNIQUE')) throw err;
    return c.json({ error: 'Buổi này đã có ngoại lệ — xoá cái cũ trước' }, 409);
  }
  const exceptions = await db.listExceptionsOfActivity(c.env.DB, householdId, id);
  return c.json(exceptions.find((e) => e.occursOn === occursOn)!, 201);
});

/** Xoá ngoại lệ là trả buổi về đúng khuôn mẫu. */
app.delete('/activities/:id/exceptions/:occursOn', requireAuth, async (c) => {
  const occursOn = c.req.param('occursOn');
  if (!isValidDate(occursOn)) return c.json({ error: 'Ngày phải có dạng YYYY-MM-DD' }, 400);
  const ok = await db.deleteException(
    c.env.DB,
    c.get('householdId'),
    c.req.param('id'),
    occursOn,
  );
  if (!ok) return c.json({ error: 'Không tìm thấy ngoại lệ' }, 404);
  return c.json({ deleted: true });
});

/* ========================================================== lịch tổng hợp */

/**
 * Buổi cụ thể trong một khoảng ngày — một endpoint phục vụ cả lưới tuần (7 ngày)
 * lẫn lưới tháng (42 ô). `to` là mốc bao gồm.
 */
app.get('/schedule', requireAuth, async (c) => {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = scheduleQuerySchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);

  const { from, to, memberId, kind } = parsed.data;
  if (daysBetween(from, to) + 1 > MAX_SCHEDULE_SPAN_DAYS) {
    return c.json({ error: `Khoảng ngày tối đa ${MAX_SCHEDULE_SPAN_DAYS} ngày` }, 400);
  }
  const toExclusive = addDays(to, 1);
  const householdId = c.get('householdId');

  const [members, activities, exceptions] = await Promise.all([
    db.listFamilyMembers(c.env.DB, householdId),
    db.listActivitiesInRange(c.env.DB, householdId, { from, toExclusive, memberId, kind }),
    db.listExceptionsInRange(c.env.DB, householdId, { from, toExclusive }),
  ]);

  // Ngoại lệ phải phủ cả buổi bị dời ra ngoài khoảng, nếu không buổi gốc sẽ hiện
  // lại như chưa hề bị dời. Nạp thêm theo đúng nhóm khuôn mẫu đang xét.
  const ids = activities.map((a) => a.id);
  const all = ids.length ? await db.listExceptionsForActivities(c.env.DB, householdId, ids) : [];
  const merged = new Map(all.map((e) => [e.id, e]));
  for (const e of exceptions) merged.set(e.id, e);

  return c.json({
    from,
    to,
    members,
    occurrences: expandOccurrences(activities, [...merged.values()], from, toExclusive),
  });
});

/* ============================================================= transactions */

const listQuerySchema = z.object({
  from: z.string().refine(isValidDate).optional(),
  to: z.string().refine(isValidDate).optional(),
  direction: z.enum(['income', 'expense']).optional(),
  recurrence: z.enum(['monthly', 'one_off']).optional(),
  categoryId: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  /** '1' để danh sách kèm cả giao dịch đã xoá mềm. */
  includeDeleted: z.literal('1').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});

app.get('/transactions', requireAuth, async (c) => {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);
  return c.json(
    await db.listTransactions(c.env.DB, c.get('householdId'), {
      ...parsed.data,
      includeDeleted: parsed.data.includeDeleted === '1',
    }),
  );
});

/**
 * Các khoản thu/chi vượt ngưỡng trong một tháng.
 * Đặt trước '/transactions/:id' để 'large' không bị hiểu là một id.
 */
app.get('/transactions/large', requireAuth, async (c) => {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = largeQuerySchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);

  const householdId = c.get('householdId');
  const month = parsed.data.month ?? currentMonthInVietnam();
  const threshold = parsed.data.min ?? db.DEFAULT_LARGE_THRESHOLD;
  const range = {
    fromInclusive: monthStart(month),
    toExclusive: monthEndExclusive(month),
    threshold,
    limit: parsed.data.limit,
  };

  const [expense, income, household] = await Promise.all([
    db.listLargeTransactions(c.env.DB, householdId, { ...range, direction: 'expense' }),
    db.listLargeTransactions(c.env.DB, householdId, { ...range, direction: 'income' }),
    db.findHouseholdById(c.env.DB, householdId),
  ]);
  return c.json({
    month,
    threshold,
    currency: household?.currency ?? 'VND',
    income,
    expense,
  });
});

/**
 * Nhắc gia hạn: các khoản đã quá hạn và các khoản hết hạn trong `days` ngày tới.
 *
 * Cũng phải đứng trước '/transactions/:id' để 'expiring' không bị hiểu là id.
 * `today` lấy theo giờ Việt Nam chứ không theo đồng hồ của trình duyệt: hai máy
 * trong nhà mở app cùng lúc phải thấy cùng một danh sách.
 */
app.get('/transactions/expiring', requireAuth, async (c) => {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = expiringQuerySchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);

  const { days, limit } = parsed.data;
  const today = todayInVietnam();
  const items = await db.listExpiringTransactions(
    c.env.DB,
    c.get('householdId'),
    addDays(today, days),
    limit,
  );

  // SQL đã lọc 'expires_on IS NOT NULL' nên mọi khoản ở đây chắc chắn có hạn.
  const withDays = items.map((transaction) => ({
    transaction,
    daysLeft: daysUntil(today, transaction.expiresOn as string),
  }));
  return c.json({
    today,
    days,
    overdue: withDays.filter((x) => x.daysLeft < 0),
    soon: withDays.filter((x) => x.daysLeft >= 0),
  });
});

app.get('/transactions/:id', requireAuth, async (c) => {
  const tx = await db.getTransaction(c.env.DB, c.get('householdId'), c.req.param('id'), true);
  if (!tx) return c.json({ error: 'Không tìm thấy giao dịch' }, 404);
  return c.json(tx);
});

/** Danh mục phải thuộc cùng hộ và đúng chiều thu/chi. */
async function validateCategory(
  env: Env,
  householdId: string,
  categoryId: string | null | undefined,
  direction: 'income' | 'expense' | undefined,
): Promise<string | null> {
  if (!categoryId) return null;
  const category = await db.getCategory(env.DB, householdId, categoryId, true);
  if (!category) return 'Danh mục không tồn tại';
  if (category.deletedAt !== null) return 'Danh mục đã bị xoá — khôi phục lại trước khi dùng';
  if (direction && category.kind !== direction) {
    return 'Danh mục không khớp với loại thu/chi của giao dịch';
  }
  return null;
}

app.post('/transactions', requireAuth, async (c) => {
  const parsed = parseBody(transactionCreateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const input = {
    ...parsed.data,
    categoryId: parsed.data.categoryId ?? null,
    paymentMethod: parsed.data.paymentMethod ?? null,
    expiresOn: parsed.data.expiresOn ?? null,
  };

  const categoryError = await validateCategory(c.env, householdId, input.categoryId, input.direction);
  if (categoryError) return c.json({ error: categoryError }, 400);

  const id = await db.insertTransaction(
    c.env.DB,
    householdId,
    c.get('user').id,
    input,
    Date.now(),
    aiEnabled(c.env) ? 'pending' : 'skipped',
  );
  if (aiEnabled(c.env)) background(c, embedTransactionById(c.env, householdId, id));
  return c.json(await db.getTransaction(c.env.DB, householdId, id), 201);
});

app.patch('/transactions/:id', requireAuth, async (c) => {
  const parsed = parseBody(transactionUpdateSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const id = c.req.param('id');

  const existing = await db.getTransaction(c.env.DB, householdId, id);
  if (!existing) return c.json({ error: 'Không tìm thấy giao dịch' }, 404);

  const patch = {
    ...parsed.data,
    categoryId: parsed.data.categoryId ?? undefined,
    expiresOn: parsed.data.expiresOn ?? undefined,
  };
  // categoryId gửi lên null nghĩa là gỡ danh mục — phân biệt với không gửi trường này.
  if ('categoryId' in parsed.data && parsed.data.categoryId === null) patch.categoryId = null as never;
  // expiresOn null cũng vậy: bỏ hạn, khác hẳn với việc không đụng tới hạn cũ.
  if ('expiresOn' in parsed.data && parsed.data.expiresOn === null) patch.expiresOn = null as never;

  // Thứ tự ngày phải đúng cả khi PATCH chỉ gửi một trong hai đầu: phần còn lại
  // lấy từ bản ghi đang có, nên schema một mình không kiểm được.
  const occurredOn = patch.occurredOn ?? existing.occurredOn;
  const expiresOn = 'expiresOn' in parsed.data ? parsed.data.expiresOn : existing.expiresOn;
  if (expiresOn && expiresOn < occurredOn) return c.json({ error: EXPIRY_ORDER_MESSAGE }, 400);

  const direction = patch.direction ?? existing.direction;
  const categoryError = await validateCategory(c.env, householdId, patch.categoryId, direction);
  if (categoryError) return c.json({ error: categoryError }, 400);

  await db.updateTransaction(
    c.env.DB,
    householdId,
    id,
    patch,
    Date.now(),
    aiEnabled(c.env) ? 'pending' : 'skipped',
  );
  if (aiEnabled(c.env)) background(c, embedTransactionById(c.env, householdId, id));
  return c.json(await db.getTransaction(c.env.DB, householdId, id));
});

/**
 * Xoá luôn là xoá mềm: bản ghi ở lại database với `deleted_at`, biến khỏi mọi
 * số liệu tổng hợp nhưng vẫn hiện trong danh sách ở dạng gạch ngang và khôi
 * phục lại được. Không có đường nào xoá hẳn một giao dịch.
 */
app.delete('/transactions/:id', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const ok = await db.softDeleteTransaction(c.env.DB, householdId, id, Date.now());
  if (!ok) return c.json({ error: 'Không tìm thấy giao dịch' }, 404);
  // Gỡ vector để giao dịch đã xoá không lọt vào tìm kiếm ngữ nghĩa và hỏi đáp.
  background(c, deleteTransactionVector(c.env, id));
  return c.json({ deleted: true });
});

app.post('/transactions/:id/restore', requireAuth, async (c) => {
  const householdId = c.get('householdId');
  const id = c.req.param('id');
  const ok = await db.restoreTransaction(
    c.env.DB,
    householdId,
    id,
    Date.now(),
    aiEnabled(c.env) ? 'pending' : 'skipped',
  );
  if (!ok) return c.json({ error: 'Không tìm thấy giao dịch đã xoá' }, 404);
  // Vector đã bị gỡ lúc xoá nên phải đẩy lại thì tìm kiếm mới thấy.
  if (aiEnabled(c.env)) background(c, embedTransactionById(c.env, householdId, id));
  return c.json(await db.getTransaction(c.env.DB, householdId, id));
});

/* ================================================================ dashboard */

app.get('/dashboard/summary', requireAuth, async (c) => {
  const monthRaw = c.req.query('month') ?? currentMonthInVietnam();
  const parsed = monthParam.safeParse(monthRaw);
  if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);
  return c.json(await buildDashboardSummary(c.env, c.get('householdId'), parsed.data));
});

/* ======================================================================= AI */

app.get('/search', requireAuth, async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ error: 'Từ khoá tìm kiếm quá ngắn' }, 400);
  return c.json(await semanticSearch(c.env, c.get('householdId'), q));
});

app.post('/ask', requireAuth, async (c) => {
  const parsed = parseBody(askSchema, await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  const householdId = c.get('householdId');
  const summary = await buildDashboardSummary(c.env, householdId, currentMonthInVietnam(), 0);
  return c.json(await askAboutSpending(c.env, householdId, parsed.data.question, summary));
});

/**
 * Nhặt lại các giao dịch chưa đẩy được lên Vectorize.
 * Pages Functions không có cron trigger nên endpoint này được gọi thủ công
 * (hoặc từ nút "Đồng bộ lại" trên trang Hỏi đáp).
 */
app.post('/admin/reindex', requireAuth, async (c) => {
  if (!aiEnabled(c.env)) return c.json({ error: 'Tính năng AI đang tắt' }, 400);
  const householdId = c.get('householdId');
  const pending = await db.listPendingEmbeds(c.env.DB, householdId, REINDEX_BATCH);
  const result = await upsertTransactionVectors(c.env, pending);
  return c.json({ processed: pending.length, ...result, hasMore: pending.length === REINDEX_BATCH });
});

export default app;

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
  askSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  formatZodError,
  joinSchema,
  largeQuerySchema,
  loginSchema,
  monthParam,
  registerSchema,
  transactionCreateSchema,
  transactionUpdateSchema,
} from './validators';
import { currentMonthInVietnam, isValidDate, monthEndExclusive, monthStart } from './dates';
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

  const patch = { ...parsed.data, categoryId: parsed.data.categoryId ?? undefined };
  // categoryId gửi lên null nghĩa là gỡ danh mục — phân biệt với không gửi trường này.
  if ('categoryId' in parsed.data && parsed.data.categoryId === null) patch.categoryId = null as never;

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

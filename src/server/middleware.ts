import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from './env';
import {
  SESSION_RENEW_THRESHOLD_MS,
  SESSION_TTL_MS,
  hashSessionToken,
  readSessionCookie,
  sessionCookie,
} from './auth';
import { findMembership } from './db/queries';

/**
 * Chặn CSRF: cookie đặt SameSite=Lax nên trình duyệt đã không gửi cookie kèm
 * request cross-site dạng POST, đây là lớp thứ hai cho các trình duyệt cũ.
 */
export const csrfGuard: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return c.json({ error: 'Origin không hợp lệ' }, 403);
      }
      // Host của chính URL request là mốc so sánh đáng tin hơn header Host,
      // vì runtime đã phân giải nó rồi.
      if (originHost !== new URL(c.req.url).host) {
        return c.json({ error: 'Origin không khớp' }, 403);
      }
    }
  }
  await next();
};

interface SessionRow {
  user_id: string;
  expires_at: number;
  email: string;
  display_name: string;
}

/**
 * Xác thực session và gắn user + household vào context.
 * Mọi route dữ liệu đều đi qua đây, nên `householdId` luôn có mặt phía sau.
 */
export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = readSessionCookie(c.req.header('cookie'));
  if (!token) return c.json({ error: 'Chưa đăng nhập' }, 401);

  const sessionId = await hashSessionToken(token);
  const row = await c.env.DB.prepare(
    `SELECT s.user_id, s.expires_at, u.email, u.display_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
  )
    .bind(sessionId)
    .first<SessionRow>();

  const now = Date.now();
  if (!row || row.expires_at <= now) {
    if (row) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return c.json({ error: 'Phiên đăng nhập đã hết hạn' }, 401);
  }

  const membership = await findMembership(c.env.DB, row.user_id);
  if (!membership) return c.json({ error: 'Tài khoản chưa thuộc hộ gia đình nào' }, 403);

  c.set('user', { id: row.user_id, email: row.email, displayName: row.display_name });
  c.set('householdId', membership.household_id);
  c.set('role', membership.role);

  await next();

  // Gia hạn trượt: chỉ ghi database khi session sắp hết hạn.
  if (row.expires_at - now < SESSION_RENEW_THRESHOLD_MS) {
    const expires = now + SESSION_TTL_MS;
    await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(expires, sessionId)
      .run();
    c.header('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), isSecure(c.req.url)), {
      append: true,
    });
  }
};

export const requireOwner: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (c.get('role') !== 'owner') {
    return c.json({ error: 'Chỉ chủ hộ mới thực hiện được thao tác này' }, 403);
  }
  await next();
};

/** http://localhost khi dev không đặt được cookie Secure. */
export function isSecure(url: string): boolean {
  return new URL(url).protocol === 'https:';
}

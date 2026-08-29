/**
 * Mật khẩu và session. Chỉ dùng Web Crypto — chạy nguyên bản trên Workers runtime.
 *
 * Mật khẩu: PBKDF2-SHA256, salt riêng từng user, số vòng lưu kèm để sau này
 * nâng cấp được mà không khoá người dùng cũ ra ngoài.
 * Session: cookie chứa token ngẫu nhiên 32 byte; database chỉ lưu SHA-256 của
 * token, nên rò rỉ database không dựng lại được cookie hợp lệ.
 */

const KDF_ITERATIONS = 100_000;
const KDF_KEY_BYTES = 32;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày
/** Còn dưới ngần này thì gia hạn trượt khi user hoạt động. */
export const SESSION_RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KDF_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** So sánh hằng thời gian — không thoát sớm khi gặp byte khác nhau. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface PasswordRecord {
  hash: string;
  salt: string;
  iterations: number;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(password, salt, KDF_ITERATIONS);
  return { hash: toBase64(derived), salt: toBase64(salt), iterations: KDF_ITERATIONS };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  let expected: Uint8Array;
  try {
    expected = fromBase64(record.hash);
  } catch {
    return false;
  }
  const derived = await pbkdf2(password, fromBase64(record.salt), record.iterations);
  return timingSafeEqual(derived, expected);
}

/**
 * Sinh cặp (token gửi cho trình duyệt, id lưu database).
 * Chỉ token đi ra ngoài; chỉ id đi vào database.
 */
export async function createSessionToken(): Promise<{ token: string; id: string }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  return { token, id: await hashSessionToken(token) };
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toBase64(new Uint8Array(digest));
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}

export function readSessionCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const chunk of header.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq === -1) continue;
    if (chunk.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = chunk.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

import { env } from 'cloudflare:test';
import app from '../src/server/app';
import type { Env } from '../src/server/env';

export interface Session {
  cookie: string;
  userId: string;
  householdId: string;
}

const BASE = 'https://test.local';

export async function call(path: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);
  headers.set('Origin', BASE);
  return app.fetch(new Request(`${BASE}${path}`, { ...init, headers }), env as unknown as Env);
}

export const json = (body: unknown) => JSON.stringify(body);

function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie');
  if (!raw) throw new Error('Phản hồi không có Set-Cookie');
  return raw.split(';')[0];
}

/** Tạo tài khoản + hộ mới, trả về session dùng cho các lời gọi sau. */
export async function registerOwner(
  email: string,
  householdName: string,
  displayName = 'Chủ hộ',
): Promise<Session> {
  const res = await call('/api/auth/register', {
    method: 'POST',
    body: json({ email, password: 'matkhau12345', displayName, householdName }),
  });
  if (res.status !== 201) throw new Error(`Đăng ký thất bại: ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string }; household: { id: string } };
  return { cookie: cookieFrom(res), userId: body.user.id, householdId: body.household.id };
}

export async function login(email: string, password: string): Promise<Response> {
  return call('/api/auth/login', { method: 'POST', body: json({ email, password }) });
}

interface TxOptions {
  occurredOn: string;
  amount: number;
  direction?: 'income' | 'expense';
  recurrence?: 'monthly' | 'one_off';
  note?: string;
  categoryId?: string | null;
  /** Ngày hết hạn; bỏ trống nghĩa là khoản không có hạn. */
  expiresOn?: string | null;
}

export async function addTransaction(session: Session, opts: TxOptions): Promise<string> {
  const res = await call(
    '/api/transactions',
    {
      method: 'POST',
      body: json({
        occurredOn: opts.occurredOn,
        amount: opts.amount,
        direction: opts.direction ?? 'expense',
        recurrence: opts.recurrence ?? 'one_off',
        note: opts.note ?? 'test',
        categoryId: opts.categoryId ?? null,
        expiresOn: opts.expiresOn ?? null,
      }),
    },
    session.cookie,
  );
  if (res.status !== 201) throw new Error(`Tạo giao dịch thất bại: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

interface MemberOptions {
  name: string;
  color?: string;
  relation?: string;
  nickname?: string;
  userId?: string | null;
  birthDate?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export async function addMember(session: Session, opts: MemberOptions): Promise<string> {
  const res = await call(
    '/api/family-members',
    { method: 'POST', body: json({ color: 'c1', ...opts }) },
    session.cookie,
  );
  if (res.status !== 201) throw new Error(`Tạo thành viên thất bại: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

interface ActivityOptions {
  memberId: string;
  title?: string;
  kind?: 'work' | 'teach' | 'study' | 'other';
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  location?: string;
  note?: string;
}

export async function addActivity(session: Session, opts: ActivityOptions): Promise<string> {
  const res = await call(
    '/api/activities',
    {
      method: 'POST',
      body: json({ title: 'Hoạt động', kind: 'work', ...opts }),
    },
    session.cookie,
  );
  if (res.status !== 201) throw new Error(`Tạo hoạt động thất bại: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

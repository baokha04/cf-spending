import { describe, expect, it } from 'vitest';
import { addTransaction, call, json, login, registerOwner } from './helpers';


describe('đăng ký và đăng nhập', () => {
  it('đăng ký tạo hộ mới kèm danh mục mặc định rồi trả về phiên đăng nhập', async () => {
    const session = await registerOwner('a@example.com', 'Nhà A');

    const me = await call('/api/auth/me', {}, session.cookie);
    expect(me.status).toBe(200);
    const body = (await me.json()) as {
      user: { email: string };
      household: { name: string; role: string; inviteCode: string };
    };
    expect(body.user.email).toBe('a@example.com');
    expect(body.household.name).toBe('Nhà A');
    expect(body.household.role).toBe('owner');
    expect(body.household.inviteCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const cats = await call('/api/categories', {}, session.cookie);
    const { categories } = (await cats.json()) as { categories: unknown[] };
    expect(categories.length).toBeGreaterThan(5);
  });

  it('từ chối email trùng', async () => {
    await registerOwner('a@example.com', 'Nhà A');
    const res = await call('/api/auth/register', {
      method: 'POST',
      body: json({
        email: 'a@example.com',
        password: 'matkhau12345',
        displayName: 'B',
        householdName: 'Nhà B',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('từ chối mật khẩu sai và không tiết lộ email có tồn tại hay không', async () => {
    await registerOwner('a@example.com', 'Nhà A');

    const wrongPassword = await login('a@example.com', 'saibetnhe');
    const unknownEmail = await login('khongco@example.com', 'matkhau12345');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPassword.clone().json()).toEqual(await unknownEmail.clone().json());
  });

  it('đăng nhập đúng mật khẩu thì cấp cookie dùng được', async () => {
    await registerOwner('a@example.com', 'Nhà A');
    const res = await login('a@example.com', 'matkhau12345');
    expect(res.status).toBe(200);

    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    const me = await call('/api/auth/me', {}, cookie);
    expect(me.status).toBe(200);
  });

  it('cookie đặt HttpOnly và SameSite=Lax', async () => {
    await registerOwner('a@example.com', 'Nhà A');
    const res = await login('a@example.com', 'matkhau12345');
    const header = res.headers.get('set-cookie')!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });

  it('từ chối token session bịa', async () => {
    const res = await call('/api/transactions', {}, 'sid=khong-phai-token-that');
    expect(res.status).toBe(401);
  });

  it('không có cookie thì mọi route dữ liệu trả 401', async () => {
    for (const path of ['/api/transactions', '/api/categories', '/api/dashboard/summary']) {
      expect((await call(path)).status).toBe(401);
    }
  });

  it('đăng xuất làm cookie cũ hết tác dụng', async () => {
    const session = await registerOwner('a@example.com', 'Nhà A');
    expect((await call('/api/auth/logout', { method: 'POST' }, session.cookie)).status).toBe(200);
    expect((await call('/api/auth/me', {}, session.cookie)).status).toBe(401);
  });
});

describe('cô lập dữ liệu giữa các hộ', () => {
  it('hộ này không đọc được giao dịch của hộ kia', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');

    await addTransaction(a, { occurredOn: '2026-08-10', amount: 500_000, note: 'bí mật nhà A' });

    const listB = await call('/api/transactions', {}, b.cookie);
    const { items } = (await listB.json()) as { items: unknown[] };
    expect(items).toHaveLength(0);

    const listA = await call('/api/transactions', {}, a.cookie);
    expect(((await listA.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it('không sửa hay xoá được giao dịch của hộ khác dù biết id', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const txId = await addTransaction(a, { occurredOn: '2026-08-10', amount: 500_000 });

    const patch = await call(
      `/api/transactions/${txId}`,
      { method: 'PATCH', body: json({ amount: 1 }) },
      b.cookie,
    );
    expect(patch.status).toBe(404);

    const del = await call(`/api/transactions/${txId}`, { method: 'DELETE' }, b.cookie);
    expect(del.status).toBe(404);

    // Giao dịch của hộ A vẫn nguyên vẹn.
    const check = await call('/api/transactions', {}, a.cookie);
    const { items } = (await check.json()) as { items: Array<{ amount: number }> };
    expect(items[0].amount).toBe(500_000);
  });

  it('dashboard của hộ này không cộng số liệu hộ kia', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    await addTransaction(a, { occurredOn: '2026-08-10', amount: 900_000 });

    const res = await call('/api/dashboard/summary?month=2026-08', {}, b.cookie);
    const body = (await res.json()) as { totals: { current: { expense: number } } };
    expect(body.totals.current.expense).toBe(0);
  });

  it('không gán được danh mục của hộ khác cho giao dịch', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');

    const catsA = (await (await call('/api/categories', {}, a.cookie)).json()) as {
      categories: Array<{ id: string; kind: string }>;
    };
    const foreignId = catsA.categories.find((c) => c.kind === 'expense')!.id;

    const res = await call(
      '/api/transactions',
      {
        method: 'POST',
        body: json({
          occurredOn: '2026-08-10',
          amount: 1000,
          direction: 'expense',
          recurrence: 'one_off',
          note: 'thử',
          categoryId: foreignId,
        }),
      },
      b.cookie,
    );
    expect(res.status).toBe(400);
  });
});

describe('mã mời', () => {
  it('đăng ký bằng mã mời thì vào chung hộ và thấy chung dữ liệu', async () => {
    const owner = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(owner, { occurredOn: '2026-08-10', amount: 250_000, note: 'đi chợ' });

    const me = (await (await call('/api/auth/me', {}, owner.cookie)).json()) as {
      household: { inviteCode: string };
    };

    const res = await call('/api/auth/register', {
      method: 'POST',
      body: json({
        email: 'vo@example.com',
        password: 'matkhau12345',
        displayName: 'Vợ',
        inviteCode: me.household.inviteCode,
      }),
    });
    expect(res.status).toBe(201);
    const joined = (await res.json()) as { household: { id: string; role: string } };
    expect(joined.household.id).toBe(owner.householdId);
    expect(joined.household.role).toBe('member');

    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    const list = (await (await call('/api/transactions', {}, cookie)).json()) as {
      items: Array<{ note: string }>;
    };
    expect(list.items).toHaveLength(1);
    expect(list.items[0].note).toBe('đi chợ');
  });

  it('mã mời sai bị từ chối', async () => {
    const res = await call('/api/auth/register', {
      method: 'POST',
      body: json({
        email: 'x@example.com',
        password: 'matkhau12345',
        displayName: 'X',
        inviteCode: 'ZZZZ-ZZZZ',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('phải chọn đúng một trong hai: tạo hộ mới hoặc mã mời', async () => {
    const both = await call('/api/auth/register', {
      method: 'POST',
      body: json({
        email: 'x@example.com',
        password: 'matkhau12345',
        displayName: 'X',
        householdName: 'Nhà X',
        inviteCode: 'ABCD-EFGH',
      }),
    });
    expect(both.status).toBe(400);

    const neither = await call('/api/auth/register', {
      method: 'POST',
      body: json({ email: 'y@example.com', password: 'matkhau12345', displayName: 'Y' }),
    });
    expect(neither.status).toBe(400);
  });

  it('chỉ chủ hộ mới đổi được mã mời', async () => {
    const owner = await registerOwner('a@example.com', 'Nhà A');
    const me = (await (await call('/api/auth/me', {}, owner.cookie)).json()) as {
      household: { inviteCode: string };
    };

    const joinRes = await call('/api/auth/register', {
      method: 'POST',
      body: json({
        email: 'vo@example.com',
        password: 'matkhau12345',
        displayName: 'Vợ',
        inviteCode: me.household.inviteCode,
      }),
    });
    const memberCookie = joinRes.headers.get('set-cookie')!.split(';')[0];

    expect(
      (await call('/api/household/invite-code/rotate', { method: 'POST' }, memberCookie)).status,
    ).toBe(403);
    expect(
      (await call('/api/household/invite-code/rotate', { method: 'POST' }, owner.cookie)).status,
    ).toBe(200);
  });
});

describe('CSRF', () => {
  it('từ chối POST có Origin lạ', async () => {
    const session = await registerOwner('a@example.com', 'Nhà A');
    const res = await app_fetch_with_foreign_origin(session.cookie);
    expect(res.status).toBe(403);
  });
});

async function app_fetch_with_foreign_origin(cookie: string): Promise<Response> {
  const { default: app } = await import('../src/server/app');
  const { env } = await import('cloudflare:test');
  return app.fetch(
    new Request('https://test.local/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://ke-tan-cong.example',
      },
      body: JSON.stringify({
        occurredOn: '2026-08-10',
        amount: 1000,
        direction: 'expense',
        recurrence: 'one_off',
      }),
    }),
    env as never,
  );
}

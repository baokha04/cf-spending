import { describe, expect, it } from 'vitest';
import { call, json, registerOwner } from './helpers';
import type { Session } from './helpers';

interface CreateOptions {
  occurredOn?: string;
  amount?: number;
  direction?: 'income' | 'expense';
  note?: string;
  detail?: string;
  payee?: string;
  paymentMethod?: string | null;
}

async function create(session: Session, opts: CreateOptions = {}): Promise<Response> {
  return call(
    '/api/transactions',
    {
      method: 'POST',
      body: json({
        occurredOn: opts.occurredOn ?? '2026-08-14',
        amount: opts.amount ?? 100_000,
        direction: opts.direction ?? 'expense',
        recurrence: 'one_off',
        note: opts.note ?? 'test',
        ...(opts.detail === undefined ? {} : { detail: opts.detail }),
        ...(opts.payee === undefined ? {} : { payee: opts.payee }),
        ...(opts.paymentMethod === undefined ? {} : { paymentMethod: opts.paymentMethod }),
      }),
    },
    session.cookie,
  );
}

describe('thông tin chi tiết của một khoản', () => {
  it('lưu và đọc lại chi tiết, bên nhận, hình thức thanh toán', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const res = await create(s, {
      amount: 12_000_000,
      note: 'Sửa mái nhà',
      detail: 'Thay 40 viên ngói, công thợ 3 ngày. Đã trả trước 5 triệu.',
      payee: 'Anh Tư thợ xây',
      paymentMethod: 'bank',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      detail: 'Thay 40 viên ngói, công thợ 3 ngày. Đã trả trước 5 triệu.',
      payee: 'Anh Tư thợ xây',
      paymentMethod: 'bank',
    });
  });

  it('mặc định để trống khi không gửi các trường chi tiết', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const tx = (await (await create(s)).json()) as Record<string, unknown>;
    expect(tx).toMatchObject({ detail: '', payee: '', paymentMethod: null });
  });

  it('bổ sung chi tiết cho khoản đã ghi từ trước', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const { id } = (await (await create(s, { amount: 5_000_000 })).json()) as { id: string };

    const res = await call(
      `/api/transactions/${id}`,
      {
        method: 'PATCH',
        body: json({ detail: 'Đóng học phí kỳ 1', payee: 'Trường Nguyễn Du', paymentMethod: 'cash' }),
      },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      detail: 'Đóng học phí kỳ 1',
      payee: 'Trường Nguyễn Du',
      paymentMethod: 'cash',
      amount: 5_000_000,
    });
  });

  it('gỡ hình thức thanh toán bằng cách gửi null', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const { id } = (await (await create(s, { paymentMethod: 'card' })).json()) as { id: string };

    const res = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ paymentMethod: null }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { paymentMethod: unknown }).toMatchObject({ paymentMethod: null });
  });

  it('từ chối hình thức thanh toán không nằm trong danh sách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    expect((await create(s, { paymentMethod: 'tien-ao' })).status).toBe(400);
  });

  it('từ chối phần chi tiết quá dài', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    expect((await create(s, { detail: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('tìm kiếm từ khoá bắt được cả phần chi tiết và bên nhận', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await create(s, { note: 'Viện phí', detail: 'Mổ ruột thừa cho bé Na' });
    await create(s, { note: 'Đi chợ', payee: 'Bách Hoá Xanh' });
    await create(s, { note: 'Xăng xe' });

    const byDetail = (await (
      await call('/api/transactions?q=ruột thừa', {}, s.cookie)
    ).json()) as { items: Array<{ note: string }> };
    expect(byDetail.items.map((i) => i.note)).toEqual(['Viện phí']);

    const byPayee = (await (
      await call('/api/transactions?q=Bách Hoá', {}, s.cookie)
    ).json()) as { items: Array<{ note: string }> };
    expect(byPayee.items.map((i) => i.note)).toEqual(['Đi chợ']);
  });

  it('đọc một giao dịch theo id, và không đọc được của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const { id } = (await (await create(a, { note: 'Riêng của nhà A' })).json()) as { id: string };

    expect((await call(`/api/transactions/${id}`, {}, a.cookie)).status).toBe(200);
    expect((await call(`/api/transactions/${id}`, {}, b.cookie)).status).toBe(404);
  });
});

describe('khoản thu chi lớn', () => {
  async function seed(s: Session) {
    await create(s, { occurredOn: '2026-08-02', amount: 300_000, note: 'Đi chợ' });
    await create(s, { occurredOn: '2026-08-05', amount: 2_000_000, note: 'Học phí', detail: 'Kỳ 1' });
    await create(s, { occurredOn: '2026-08-09', amount: 9_000_000, note: 'Sửa nhà' });
    await create(s, {
      occurredOn: '2026-08-20',
      amount: 25_000_000,
      direction: 'income',
      note: 'Lương + thưởng',
    });
    await create(s, { occurredOn: '2026-07-30', amount: 8_000_000, note: 'Mua tủ lạnh tháng trước' });
  }

  it('gom các khoản vượt ngưỡng của đúng tháng đang xem', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await seed(s);

    const res = await call('/api/transactions/large?month=2026-08&min=1000000', {}, s.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      threshold: number;
      expense: {
        items: Array<{ note: string; amount: number }>;
        total: number;
        monthTotal: number;
        count: number;
        monthCount: number;
        missingDetail: number;
      };
      income: { items: Array<{ note: string }>; total: number };
    };

    expect(body.threshold).toBe(1_000_000);
    // Sắp theo số tiền giảm dần, khoản tháng 7 không lọt vào.
    expect(body.expense.items.map((i) => i.note)).toEqual(['Sửa nhà', 'Học phí']);
    expect(body.expense.total).toBe(11_000_000);
    expect(body.expense.monthTotal).toBe(11_300_000);
    expect(body.expense.count).toBe(2);
    expect(body.expense.monthCount).toBe(3);
    // 'Sửa nhà' chưa ghi chi tiết, 'Học phí' thì có.
    expect(body.expense.missingDetail).toBe(1);
    expect(body.income.items.map((i) => i.note)).toEqual(['Lương + thưởng']);
    expect(body.income.total).toBe(25_000_000);
  });

  it('ngưỡng cao hơn thì lọc bớt khoản', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await seed(s);

    const body = (await (
      await call('/api/transactions/large?month=2026-08&min=5000000', {}, s.cookie)
    ).json()) as { expense: { items: Array<{ note: string }>; count: number } };
    expect(body.expense.items.map((i) => i.note)).toEqual(['Sửa nhà']);
    expect(body.expense.count).toBe(1);
  });

  it('limit chỉ cắt danh sách trả về, không làm sai tổng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await seed(s);

    const body = (await (
      await call('/api/transactions/large?month=2026-08&min=1000000&limit=1', {}, s.cookie)
    ).json()) as { expense: { items: unknown[]; count: number; total: number } };
    expect(body.expense.items).toHaveLength(1);
    expect(body.expense.count).toBe(2);
    expect(body.expense.total).toBe(11_000_000);
  });

  it('không trả về khoản của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    await seed(a);

    const body = (await (
      await call('/api/transactions/large?month=2026-08&min=1000000', {}, b.cookie)
    ).json()) as { expense: { items: unknown[]; monthTotal: number } };
    expect(body.expense.items).toHaveLength(0);
    expect(body.expense.monthTotal).toBe(0);
  });

  it('từ chối tháng sai định dạng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    expect((await call('/api/transactions/large?month=8-2026', {}, s.cookie)).status).toBe(400);
  });

  it('đòi đăng nhập', async () => {
    expect((await call('/api/transactions/large')).status).toBe(401);
  });
});

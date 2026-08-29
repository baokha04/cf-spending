import { describe, expect, it } from 'vitest';
import { addTransaction, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';

async function expenseCategory(session: Session): Promise<string> {
  const res = (await (await call('/api/categories', {}, session.cookie)).json()) as {
    categories: Array<{ id: string; kind: string; name: string }>;
  };
  return res.categories.find((c) => c.kind === 'expense')!.id;
}

describe('CRUD giao dịch', () => {
  it('tạo rồi đọc lại đầy đủ các trường', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const categoryId = await expenseCategory(s);

    const res = await call(
      '/api/transactions',
      {
        method: 'POST',
        body: json({
          occurredOn: '2026-08-14',
          note: 'Đi chợ Bách Hoá Xanh',
          amount: 250_000,
          direction: 'expense',
          recurrence: 'one_off',
          categoryId,
        }),
      },
      s.cookie,
    );
    expect(res.status).toBe(201);
    const tx = (await res.json()) as Record<string, unknown>;
    expect(tx).toMatchObject({
      occurredOn: '2026-08-14',
      note: 'Đi chợ Bách Hoá Xanh',
      amount: 250_000,
      direction: 'expense',
      recurrence: 'one_off',
      categoryId,
      createdByName: 'Chủ hộ',
    });
  });

  it('nhận số tiền người dùng gõ có dấu chấm phẩy phân cách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    for (const [input, expected] of [
      ['1.500.000', 1_500_000],
      ['1,500,000', 1_500_000],
      ['250 000', 250_000],
    ] as const) {
      const res = await call(
        '/api/transactions',
        {
          method: 'POST',
          body: json({
            occurredOn: '2026-08-14',
            amount: input,
            direction: 'expense',
            recurrence: 'one_off',
          }),
        },
        s.cookie,
      );
      expect(res.status).toBe(201);
      expect(((await res.json()) as { amount: number }).amount).toBe(expected);
    }
  });

  it('sửa giao dịch và cập nhật lại danh sách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });

    const res = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ amount: 175_000, note: 'sửa lại' }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ amount: 175_000, note: 'sửa lại' });
  });

  it('gỡ danh mục bằng cách gửi categoryId null', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const categoryId = await expenseCategory(s);
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000, categoryId });

    const res = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ categoryId: null }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { categoryId: unknown }).toMatchObject({ categoryId: null });
  });

  it('xoá mềm làm giao dịch biến khỏi danh sách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });

    expect((await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie)).status).toBe(200);

    const list = (await (await call('/api/transactions', {}, s.cookie)).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(0);

    // Xoá lần hai không tìm thấy nữa.
    expect((await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie)).status).toBe(404);
  });
});

describe('kiểm tra dữ liệu đầu vào', () => {
  const invalid: Array<[string, Record<string, unknown>]> = [
    ['số tiền bằng 0', { amount: 0 }],
    ['số tiền âm', { amount: -5000 }],
    ['số tiền không phải số', { amount: 'nhiều tiền' }],
    ['chiều thu chi sai', { direction: 'chuyen-khoan' }],
    ['tính chất sai', { recurrence: 'hang-tuan' }],
    ['ngày sai định dạng', { occurredOn: '14/08/2026' }],
    ['ngày không tồn tại', { occurredOn: '2026-02-30' }],
    ['tháng không tồn tại', { occurredOn: '2026-13-01' }],
  ];

  for (const [label, patch] of invalid) {
    it(`từ chối ${label}`, async () => {
      const s = await registerOwner('a@example.com', 'Nhà A');
      const res = await call(
        '/api/transactions',
        {
          method: 'POST',
          body: json({
            occurredOn: '2026-08-14',
            amount: 100_000,
            direction: 'expense',
            recurrence: 'one_off',
            ...patch,
          }),
        },
        s.cookie,
      );
      expect(res.status).toBe(400);
    });
  }

  it('từ chối danh mục thu gán cho giao dịch chi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const cats = (await (await call('/api/categories', {}, s.cookie)).json()) as {
      categories: Array<{ id: string; kind: string }>;
    };
    const incomeCategory = cats.categories.find((c) => c.kind === 'income')!.id;

    const res = await call(
      '/api/transactions',
      {
        method: 'POST',
        body: json({
          occurredOn: '2026-08-14',
          amount: 100_000,
          direction: 'expense',
          recurrence: 'one_off',
          categoryId: incomeCategory,
        }),
      },
      s.cookie,
    );
    expect(res.status).toBe(400);
  });
});

describe('lọc và phân trang', () => {
  it('lọc theo khoảng ngày, chiều thu chi và tính chất', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: '2026-07-20', amount: 1000, direction: 'expense' });
    await addTransaction(s, { occurredOn: '2026-08-05', amount: 2000, direction: 'expense', recurrence: 'monthly' });
    await addTransaction(s, { occurredOn: '2026-08-25', amount: 3000, direction: 'income' });

    const byMonth = (await (
      await call('/api/transactions?from=2026-08-01&to=2026-08-31', {}, s.cookie)
    ).json()) as { items: unknown[] };
    expect(byMonth.items).toHaveLength(2);

    const income = (await (await call('/api/transactions?direction=income', {}, s.cookie)).json()) as {
      items: Array<{ amount: number }>;
    };
    expect(income.items).toHaveLength(1);
    expect(income.items[0].amount).toBe(3000);

    const monthly = (await (
      await call('/api/transactions?recurrence=monthly', {}, s.cookie)
    ).json()) as { items: Array<{ amount: number }> };
    expect(monthly.items).toHaveLength(1);
    expect(monthly.items[0].amount).toBe(2000);
  });

  it('phân trang keyset trả về đủ và không lặp bản ghi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    for (let day = 1; day <= 7; day++) {
      await addTransaction(s, {
        occurredOn: `2026-08-${String(day).padStart(2, '0')}`,
        amount: day * 1000,
      });
    }

    const first = (await (await call('/api/transactions?limit=3', {}, s.cookie)).json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();

    const seen = new Set(first.items.map((i) => i.id));
    let cursor = first.nextCursor;
    while (cursor) {
      const page = (await (
        await call(`/api/transactions?limit=3&cursor=${encodeURIComponent(cursor)}`, {}, s.cookie)
      ).json()) as { items: Array<{ id: string }>; nextCursor: string | null };
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(7);
  });
});

describe('danh mục', () => {
  it('từ chối danh mục trùng tên trong cùng loại', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const body = json({ name: 'Cà phê', kind: 'expense' });
    expect((await call('/api/categories', { method: 'POST', body }, s.cookie)).status).toBe(201);
    expect((await call('/api/categories', { method: 'POST', body }, s.cookie)).status).toBe(409);
  });

  it('cho phép trùng tên nếu khác loại thu/chi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    expect(
      (await call('/api/categories', { method: 'POST', body: json({ name: 'Cho vay', kind: 'expense' }) }, s.cookie))
        .status,
    ).toBe(201);
    expect(
      (await call('/api/categories', { method: 'POST', body: json({ name: 'Cho vay', kind: 'income' }) }, s.cookie))
        .status,
    ).toBe(201);
  });

  it('xoá danh mục là xoá mềm, giao dịch cũ vẫn giữ nhãn', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const categoryId = await expenseCategory(s);
    const txId = await addTransaction(s, { occurredOn: '2026-08-10', amount: 1000, categoryId });

    const res = await call(`/api/categories/${categoryId}`, { method: 'DELETE' }, s.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: true, transactions: 1 });

    // Danh sách mặc định không còn thấy nó, kể cả khi xin luôn phần lưu trữ.
    const visible = (await (
      await call('/api/categories?includeArchived=1', {}, s.cookie)
    ).json()) as { categories: Array<{ id: string }> };
    expect(visible.categories.find((c) => c.id === categoryId)).toBeUndefined();

    const all = (await (
      await call('/api/categories?includeArchived=1&includeDeleted=1', {}, s.cookie)
    ).json()) as { categories: Array<{ id: string; deletedAt: number | null }> };
    expect(all.categories.find((c) => c.id === categoryId)?.deletedAt).toEqual(expect.any(Number));

    // Giao dịch cũ vẫn đọc được tên danh mục.
    const tx = (await (await call(`/api/transactions/${txId}`, {}, s.cookie)).json()) as {
      categoryId: string;
      categoryName: string | null;
    };
    expect(tx.categoryId).toBe(categoryId);
    expect(tx.categoryName).not.toBeNull();
  });

  it('danh mục chưa dùng cũng chỉ xoá mềm', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const created = (await (
      await call('/api/categories', { method: 'POST', body: json({ name: 'Tạm', kind: 'expense' }) }, s.cookie)
    ).json()) as { id: string };

    const res = await call(`/api/categories/${created.id}`, { method: 'DELETE' }, s.cookie);
    expect(await res.json()).toMatchObject({ deleted: true, transactions: 0 });

    const all = (await (
      await call('/api/categories?includeArchived=1&includeDeleted=1', {}, s.cookie)
    ).json()) as { categories: Array<{ id: string }> };
    expect(all.categories.find((c) => c.id === created.id)).toBeDefined();
  });
});

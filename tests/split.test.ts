import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { addTransaction, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';
import { splitTransaction } from '../src/server/db/queries';
import type { Transaction } from '../src/shared/types';

interface Tx {
  id: string;
  amount: number;
  note: string;
  detail: string;
  payee: string;
  paymentMethod: string | null;
  direction: string;
  recurrence: string;
  occurredOn: string;
  expiresOn: string | null;
  categoryId: string | null;
  createdByName: string;
}

async function categoryOf(session: Session, kind: 'income' | 'expense'): Promise<string> {
  const res = (await (await call('/api/categories', {}, session.cookie)).json()) as {
    categories: Array<{ id: string; kind: string }>;
  };
  return res.categories.find((c) => c.kind === kind)!.id;
}

async function split(session: Session, id: string, body: unknown): Promise<Response> {
  return call(`/api/transactions/${id}/split`, { method: 'POST', body: json(body) }, session.cookie);
}

async function get(session: Session, id: string): Promise<Tx> {
  return (await (await call(`/api/transactions/${id}`, {}, session.cookie)).json()) as Tx;
}

describe('tách giao dịch', () => {
  it('trừ khoản gốc và tạo khoản mới, tổng hai mảnh bằng số tiền ban đầu', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, {
      occurredOn: '2026-08-14',
      amount: 1_000_000,
      note: 'Hoá đơn siêu thị',
    });

    const res = await split(s, id, { amount: 400_000, note: 'Phần đồ gia dụng' });
    expect(res.status).toBe(201);
    const { source, created } = (await res.json()) as { source: Tx; created: Tx };

    expect(source.amount).toBe(600_000);
    expect(created.amount).toBe(400_000);
    expect(source.amount + created.amount).toBe(1_000_000);
    expect(created.note).toBe('Phần đồ gia dụng');
    expect(source.note).toBe('Hoá đơn siêu thị');
    // Đọc lại từ database chứ không chỉ tin phản hồi.
    expect((await get(s, id)).amount).toBe(600_000);
    expect((await get(s, created.id)).amount).toBe(400_000);
  });

  it('mảnh cắt ra thừa kế chiều thu/chi, tính chất, ngày và hạn của khoản gốc', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, {
      occurredOn: '2026-08-14',
      amount: 9_000_000,
      direction: 'income',
      recurrence: 'monthly',
      note: 'Lương tháng 8',
      expiresOn: '2027-08-14',
    });

    const { created } = (await (await split(s, id, { amount: 3_000_000 })).json()) as {
      created: Tx;
    };
    expect(created).toMatchObject({
      direction: 'income',
      recurrence: 'monthly',
      occurredOn: '2026-08-14',
      expiresOn: '2027-08-14',
      // Không gửi nội dung thì mảnh mới mang theo nội dung của khoản gốc.
      note: 'Lương tháng 8',
      createdByName: 'Chủ hộ',
    });
  });

  it('tách được cả khoản thu lẫn khoản chi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    for (const direction of ['income', 'expense'] as const) {
      const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 500_000, direction });
      const res = await split(s, id, { amount: 200_000 });
      expect(res.status).toBe(201);
      const { source, created } = (await res.json()) as { source: Tx; created: Tx };
      expect([source.amount, created.amount]).toEqual([300_000, 200_000]);
      expect(created.direction).toBe(direction);
    }
  });

  it('không cho khoản gốc tụt xuống 0 hay âm', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 100_000 });

    // Đúng bằng số tiền gốc: khoản gốc sẽ còn 0 đồng.
    expect((await split(s, id, { amount: 100_000 })).status).toBe(400);
    // Lớn hơn số tiền gốc: khoản gốc sẽ âm.
    expect((await split(s, id, { amount: 150_000 })).status).toBe(400);
    // Số tiền tách phải dương.
    expect((await split(s, id, { amount: 0 })).status).toBe(400);
    expect((await split(s, id, { amount: -50_000 })).status).toBe(400);

    // Không lần nào chạm được vào khoản gốc.
    expect((await get(s, id)).amount).toBe(100_000);
    const list = (await (await call('/api/transactions', {}, s.cookie)).json()) as { items: Tx[] };
    expect(list.items).toHaveLength(1);
  });

  it('cắt tới đồng cuối cùng vẫn được, miễn là còn lớn hơn 0', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 100_000 });

    const res = await split(s, id, { amount: 99_999 });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { source: Tx }).source.amount).toBe(1);
  });

  it('nhận số tiền người dùng gõ có dấu phân cách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 2_000_000 });

    const res = await split(s, id, { amount: '1.500.000' });
    expect(res.status).toBe(201);
    const { source, created } = (await res.json()) as { source: Tx; created: Tx };
    expect([source.amount, created.amount]).toEqual([500_000, 1_500_000]);
  });

  it('đặt được danh mục riêng cho mảnh cắt ra, nhưng phải đúng chiều thu/chi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const expenseCat = await categoryOf(s, 'expense');
    const incomeCat = await categoryOf(s, 'income');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 1_000_000 });

    const wrong = await split(s, id, { amount: 100_000, categoryId: incomeCat });
    expect(wrong.status).toBe(400);

    const ok = await split(s, id, { amount: 100_000, categoryId: expenseCat });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { created: Tx }).created.categoryId).toBe(expenseCat);
  });

  it('không tách được khoản đã xoá mềm', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 1_000_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);

    expect((await split(s, id, { amount: 100_000 })).status).toBe(404);
  });

  it('không tách được giao dịch của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const id = await addTransaction(a, { occurredOn: '2026-08-14', amount: 1_000_000 });

    expect((await split(b, id, { amount: 100_000 })).status).toBe(404);
    expect((await get(a, id)).amount).toBe(1_000_000);
  });

  it('đòi đăng nhập', async () => {
    const res = await call('/api/transactions/bat-ky/split', {
      method: 'POST',
      body: json({ amount: 1000 }),
    });
    expect(res.status).toBe(401);
  });

  /**
   * Route đã chặn số tiền quá lớn, nên nhánh này chỉ xảy ra khi có người sửa số
   * tiền gốc xen vào giữa lúc kiểm và lúc ghi. Gọi thẳng hàm dưới database để
   * dựng lại đúng tình huống đó và xác nhận nó không để lại nửa vời.
   */
  it('CHECK (amount > 0) làm hỏng cả batch, không tạo ra khoản mới mồ côi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 100_000 });
    const source = (await get(s, id)) as unknown as Transaction;

    await expect(
      splitTransaction(
        env.DB,
        s.householdId,
        source,
        s.userId,
        {
          amount: 100_000, // đúng bằng số tiền gốc → khoản gốc sẽ còn 0
          note: 'không được phép tồn tại',
          detail: '',
          payee: '',
          paymentMethod: null,
          categoryId: null,
        },
        Date.now(),
        'skipped',
      ),
    ).rejects.toThrow();

    // Khoản gốc nguyên vẹn và câu INSERT trong cùng batch đã quay lui theo.
    const list = (await (await call('/api/transactions', {}, s.cookie)).json()) as { items: Tx[] };
    expect(list.items).toHaveLength(1);
    expect(list.items[0].amount).toBe(100_000);
  });

  it('không làm đổi tổng của tháng trên dashboard', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-14', amount: 1_000_000 });

    const totals = async () =>
      (
        (await (await call('/api/dashboard/summary?month=2026-08', {}, s.cookie)).json()) as {
          totals: { current: { expense: number; count: number } };
        }
      ).totals.current;

    expect(await totals()).toMatchObject({ expense: 1_000_000, count: 1 });
    await split(s, id, { amount: 250_000 });
    // Tiền không đổi, chỉ số bản ghi tăng lên: đó đúng là ý nghĩa của việc tách.
    expect(await totals()).toMatchObject({ expense: 1_000_000, count: 2 });
  });
});

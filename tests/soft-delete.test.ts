import { describe, expect, it } from 'vitest';
import { addTransaction, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';

async function list(session: Session, query = ''): Promise<Array<{ id: string; deletedAt: number | null }>> {
  const res = await call(`/api/transactions${query}`, {}, session.cookie);
  return ((await res.json()) as { items: Array<{ id: string; deletedAt: number | null }> }).items;
}

describe('xoá mềm giao dịch', () => {
  it('giữ bản ghi lại và đánh dấu deletedAt', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);

    // Mặc định danh sách vẫn ẩn giao dịch đã xoá…
    expect(await list(s)).toHaveLength(0);

    // …còn includeDeleted=1 thì trả về kèm mốc xoá để hiển thị gạch ngang.
    const withDeleted = await list(s, '?includeDeleted=1');
    expect(withDeleted).toHaveLength(1);
    expect(withDeleted[0].id).toBe(id);
    expect(typeof withDeleted[0].deletedAt).toBe('number');
  });

  it('giao dịch chưa xoá có deletedAt bằng null', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    expect((await list(s))[0].deletedAt).toBeNull();
  });

  it('đọc lại được một giao dịch đã xoá theo id', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(`/api/transactions/${id}`, {}, s.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deletedAt: number | null }).deletedAt).not.toBeNull();
  });

  it('không sửa được giao dịch đang ở trạng thái đã xoá', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ amount: 999_000 }) },
      s.cookie,
    );
    expect(res.status).toBe(404);
  });

  it('khôi phục đưa giao dịch trở lại danh sách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(`/api/transactions/${id}/restore`, { method: 'POST' }, s.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deletedAt: unknown }).deletedAt).toBeNull();

    const items = await list(s);
    expect(items).toHaveLength(1);
    expect(items[0].deletedAt).toBeNull();
  });

  it('khôi phục một giao dịch chưa xoá trả về 404', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    expect((await call(`/api/transactions/${id}/restore`, { method: 'POST' }, s.cookie)).status).toBe(
      404,
    );
  });

  it('không khôi phục được giao dịch của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const id = await addTransaction(a, { occurredOn: '2026-08-10', amount: 100_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, a.cookie);

    expect((await call(`/api/transactions/${id}/restore`, { method: 'POST' }, b.cookie)).status).toBe(
      404,
    );
    // Bản ghi vẫn ở trạng thái đã xoá sau khi hộ khác thử khôi phục.
    expect((await list(a, '?includeDeleted=1'))[0].deletedAt).not.toBeNull();
  });

  it('giao dịch đã xoá không vào tổng hợp dashboard lẫn báo cáo khoản lớn', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: '2026-08-05', amount: 2_000_000 });
    const removed = await addTransaction(s, { occurredOn: '2026-08-06', amount: 9_000_000 });
    await call(`/api/transactions/${removed}`, { method: 'DELETE' }, s.cookie);

    const summary = (await (
      await call('/api/dashboard/summary?month=2026-08', {}, s.cookie)
    ).json()) as { totals: { current: { expense: number; count: number } } };
    expect(summary.totals.current.expense).toBe(2_000_000);
    expect(summary.totals.current.count).toBe(1);

    const large = (await (
      await call('/api/transactions/large?month=2026-08&min=1000000', {}, s.cookie)
    ).json()) as { expense: { count: number; total: number; monthTotal: number } };
    expect(large.expense.count).toBe(1);
    expect(large.expense.total).toBe(2_000_000);
    expect(large.expense.monthTotal).toBe(2_000_000);

    // Khôi phục xong thì số liệu trở lại như cũ.
    await call(`/api/transactions/${removed}/restore`, { method: 'POST' }, s.cookie);
    const after = (await (
      await call('/api/dashboard/summary?month=2026-08', {}, s.cookie)
    ).json()) as { totals: { current: { expense: number } } };
    expect(after.totals.current.expense).toBe(11_000_000);
  });

  it('bộ lọc vẫn áp cho cả giao dịch đã xoá', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, {
      occurredOn: '2026-08-10',
      amount: 100_000,
      direction: 'income',
      note: 'Thưởng lễ',
    });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);

    expect(await list(s, '?includeDeleted=1&direction=expense')).toHaveLength(0);
    expect(await list(s, '?includeDeleted=1&direction=income')).toHaveLength(1);
    expect(await list(s, '?includeDeleted=1&q=Thưởng')).toHaveLength(1);
  });

  it('đòi đăng nhập để khôi phục', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 100_000 });
    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);
    expect((await call(`/api/transactions/${id}/restore`, { method: 'POST' })).status).toBe(401);
  });
});

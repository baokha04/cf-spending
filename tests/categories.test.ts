import { describe, expect, it } from 'vitest';
import { addTransaction, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';

async function listCategories(
  session: Session,
  includeArchived = false,
): Promise<Array<{ id: string; name: string; kind: string; icon: string | null; isArchived: boolean }>> {
  const res = await call(
    `/api/categories${includeArchived ? '?includeArchived=1' : ''}`,
    {},
    session.cookie,
  );
  return ((await res.json()) as { categories: never[] }).categories;
}

describe('chỉnh sửa danh mục', () => {
  it('đổi tên và biểu tượng của một danh mục', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const created = (await (
      await call(
        '/api/categories',
        { method: 'POST', body: json({ name: 'Cà phê', kind: 'expense', icon: '☕' }) },
        s.cookie,
      )
    ).json()) as { id: string };

    const res = await call(
      `/api/categories/${created.id}`,
      { method: 'PATCH', body: json({ name: 'Cà phê sáng', icon: '🥐' }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Cà phê sáng', icon: '🥐', kind: 'expense' });

    const names = (await listCategories(s)).map((c) => c.name);
    expect(names).toContain('Cà phê sáng');
    expect(names).not.toContain('Cà phê');
  });

  it('giữ nguyên giao dịch đang gắn với danh mục sau khi đổi tên', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    const id = await addTransaction(s, {
      occurredOn: '2026-08-10',
      amount: 100_000,
      categoryId: category.id,
    });

    await call(
      `/api/categories/${category.id}`,
      { method: 'PATCH', body: json({ name: 'Ăn uống ngoài' }) },
      s.cookie,
    );

    const tx = (await (await call(`/api/transactions/${id}`, {}, s.cookie)).json()) as {
      categoryId: string;
      categoryName: string;
    };
    expect(tx).toMatchObject({ categoryId: category.id, categoryName: 'Ăn uống ngoài' });
  });

  it('từ chối đổi sang tên đã có trong cùng loại', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const expenses = (await listCategories(s)).filter((c) => c.kind === 'expense');

    const res = await call(
      `/api/categories/${expenses[0].id}`,
      { method: 'PATCH', body: json({ name: expenses[1].name }) },
      s.cookie,
    );
    expect(res.status).toBe(409);
  });

  it('cho phép trùng tên khi khác loại thu/chi', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const cats = await listCategories(s);
    const expense = cats.find((c) => c.kind === 'expense')!;
    const income = cats.find((c) => c.kind === 'income')!;

    const res = await call(
      `/api/categories/${income.id}`,
      { method: 'PATCH', body: json({ name: expense.name }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
  });

  it('gỡ biểu tượng bằng cách gửi icon null', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;

    const res = await call(
      `/api/categories/${category.id}`,
      { method: 'PATCH', body: json({ icon: null }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { icon: unknown }).toMatchObject({ icon: null });
  });

  it('không sửa được danh mục của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const category = (await listCategories(a)).find((c) => c.kind === 'expense')!;

    const res = await call(
      `/api/categories/${category.id}`,
      { method: 'PATCH', body: json({ name: 'Đổi trộm' }) },
      b.cookie,
    );
    expect(res.status).toBe(404);
  });
});

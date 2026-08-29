import { describe, expect, it } from 'vitest';
import { addTransaction, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';

interface CategoryShape {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
  isArchived: boolean;
  deletedAt: number | null;
}

async function listCategories(session: Session, query = ''): Promise<CategoryShape[]> {
  const res = await call(`/api/categories${query}`, {}, session.cookie);
  return ((await res.json()) as { categories: CategoryShape[] }).categories;
}

const ALL = '?includeArchived=1&includeDeleted=1';

async function createCategory(
  session: Session,
  body: { name: string; kind: string; icon?: string | null },
): Promise<Response> {
  return call('/api/categories', { method: 'POST', body: json(body) }, session.cookie);
}

describe('chỉnh sửa danh mục', () => {
  it('đổi tên và biểu tượng của một danh mục', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const created = (await (
      await createCategory(s, { name: 'Cà phê', kind: 'expense', icon: '☕' })
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

describe('xoá mềm danh mục', () => {
  it('danh mục đã xoá biến khỏi danh sách chọn nhưng vẫn nằm trong bảng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;

    expect((await call(`/api/categories/${category.id}`, { method: 'DELETE' }, s.cookie)).status).toBe(
      200,
    );

    expect((await listCategories(s)).find((c) => c.id === category.id)).toBeUndefined();
    const deleted = (await listCategories(s, ALL)).find((c) => c.id === category.id);
    expect(deleted?.deletedAt).toEqual(expect.any(Number));
  });

  it('không gán được giao dịch vào danh mục đã xoá', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    await call(`/api/categories/${category.id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(
      '/api/transactions',
      {
        method: 'POST',
        body: json({
          occurredOn: '2026-08-14',
          amount: 100_000,
          direction: 'expense',
          recurrence: 'one_off',
          categoryId: category.id,
        }),
      },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('đã bị xoá');
  });

  it('không sửa hay lưu trữ được danh mục đã xoá', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    await call(`/api/categories/${category.id}`, { method: 'DELETE' }, s.cookie);

    for (const body of [{ name: 'Tên mới' }, { isArchived: true }]) {
      const res = await call(
        `/api/categories/${category.id}`,
        { method: 'PATCH', body: json(body) },
        s.cookie,
      );
      expect(res.status).toBe(404);
    }
  });

  it('khôi phục đưa danh mục trở lại danh sách chọn', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    await call(`/api/categories/${category.id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(`/api/categories/${category.id}/restore`, { method: 'POST' }, s.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deletedAt: unknown }).deletedAt).toBeNull();
    expect((await listCategories(s)).find((c) => c.id === category.id)).toBeDefined();
  });

  it('khôi phục danh mục chưa xoá trả về 404', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    expect(
      (await call(`/api/categories/${category.id}/restore`, { method: 'POST' }, s.cookie)).status,
    ).toBe(404);
  });

  it('không xoá hay khôi phục được danh mục của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const category = (await listCategories(a)).find((c) => c.kind === 'expense')!;

    expect((await call(`/api/categories/${category.id}`, { method: 'DELETE' }, b.cookie)).status).toBe(
      404,
    );
    await call(`/api/categories/${category.id}`, { method: 'DELETE' }, a.cookie);
    expect(
      (await call(`/api/categories/${category.id}/restore`, { method: 'POST' }, b.cookie)).status,
    ).toBe(404);
  });

  it('tạo lại tên đã xoá thì khôi phục chính danh mục cũ', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    await call(`/api/categories/${category.id}`, { method: 'DELETE' }, s.cookie);

    const res = await createCategory(s, { name: category.name, kind: 'expense', icon: '🥗' });
    expect(res.status).toBe(200);
    // Vẫn là hàng cũ (giao dịch cũ giữ nguyên nhãn), chỉ đổi biểu tượng.
    expect(await res.json()).toMatchObject({
      id: category.id,
      name: category.name,
      icon: '🥗',
      isArchived: false,
      deletedAt: null,
      restored: true,
    });
  });

  it('tên trùng một danh mục đang dùng vẫn bị từ chối', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    expect((await createCategory(s, { name: category.name, kind: 'expense' })).status).toBe(409);
  });

  it('dashboard vẫn hiện tên danh mục đã xoá cho giao dịch cũ', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const category = (await listCategories(s)).find((c) => c.kind === 'expense')!;
    await addTransaction(s, { occurredOn: '2026-08-10', amount: 250_000, categoryId: category.id });
    await call(`/api/categories/${category.id}`, { method: 'DELETE' }, s.cookie);

    const summary = (await (
      await call('/api/dashboard/summary?month=2026-08', {}, s.cookie)
    ).json()) as { byCategory: Array<{ categoryId: string | null; name: string; current: number }> };
    const row = summary.byCategory.find((r) => r.categoryId === category.id);
    expect(row).toMatchObject({ name: category.name, current: 250_000 });
  });

  it('đòi đăng nhập để khôi phục', async () => {
    expect((await call('/api/categories/bat-ky/restore', { method: 'POST' })).status).toBe(401);
  });
});

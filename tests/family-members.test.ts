import { describe, expect, it } from 'vitest';
import { addActivity, addMember, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';
import type { FamilyMember } from '../src/shared/types';

async function listMembers(session: Session, query = ''): Promise<FamilyMember[]> {
  const res = await call(`/api/family-members${query}`, {}, session.cookie);
  return ((await res.json()) as { members: FamilyMember[] }).members;
}

describe('danh mục thành viên trong nhà', () => {
  it('hộ mới chưa có thành viên nào', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    expect(await listMembers(s)).toEqual([]);
  });

  it('thêm được người không có tài khoản đăng nhập', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const res = await call(
      '/api/family-members',
      {
        method: 'POST',
        body: json({
          name: 'Bé Na',
          nickname: 'Na',
          relation: 'con',
          color: 'c3',
          icon: '🧒',
          birthDate: '2018-05-04',
        }),
      },
      s.cookie,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      name: 'Bé Na',
      nickname: 'Na',
      relation: 'con',
      color: 'c3',
      icon: '🧒',
      birthDate: '2018-05-04',
      userId: null,
      deletedAt: null,
    });
  });

  it('gắn được với tài khoản đang ở trong hộ', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A', 'Bố Nam');
    const res = await call(
      '/api/family-members',
      { method: 'POST', body: json({ name: 'Bố Nam', color: 'c1', relation: 'bo', userId: s.userId }) },
      s.cookie,
    );
    expect(res.status).toBe(201);
    expect((await res.json()) as FamilyMember).toMatchObject({ userId: s.userId });
  });

  it('không gắn được tài khoản của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const res = await call(
      '/api/family-members',
      { method: 'POST', body: json({ name: 'Người lạ', color: 'c1', userId: b.userId }) },
      a.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('không ở trong hộ');
  });

  it('một tài khoản chỉ gắn được cho một thành viên', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addMember(s, { name: 'Bố Nam', userId: s.userId });
    const res = await call(
      '/api/family-members',
      { method: 'POST', body: json({ name: 'Nam khác', color: 'c2', userId: s.userId }) },
      s.cookie,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('đã gắn');
  });

  it('trùng tên trong cùng hộ bị từ chối, khác hộ thì không', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    await addMember(a, { name: 'Mẹ Lan' });

    const dup = await call(
      '/api/family-members',
      { method: 'POST', body: json({ name: 'Mẹ Lan', color: 'c2' }) },
      a.cookie,
    );
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toContain('tên này');

    const other = await call(
      '/api/family-members',
      { method: 'POST', body: json({ name: 'Mẹ Lan', color: 'c2' }) },
      b.cookie,
    );
    expect(other.status).toBe(201);
  });

  it('sửa được tên, màu và biểu tượng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan', color: 'c2' });
    const res = await call(
      `/api/family-members/${id}`,
      { method: 'PATCH', body: json({ name: 'Mẹ Lan Anh', color: 'c5', icon: '👩' }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Mẹ Lan Anh', color: 'c5', icon: '👩' });
  });

  it('gỡ được biểu tượng và ngày sinh bằng cách gửi null', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Ông Tư', icon: '👴', birthDate: '1950-01-02' });
    const res = await call(
      `/api/family-members/${id}`,
      { method: 'PATCH', body: json({ icon: null, birthDate: null }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ icon: null, birthDate: null });
  });

  it('đổi sang tên đã có của người khác bị từ chối', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addMember(s, { name: 'Mẹ Lan' });
    const id = await addMember(s, { name: 'Bố Nam', color: 'c2' });
    const res = await call(
      `/api/family-members/${id}`,
      { method: 'PATCH', body: json({ name: 'Mẹ Lan' }) },
      s.cookie,
    );
    expect(res.status).toBe(409);
  });

  it('giữ nguyên tên của chính mình khi sửa trường khác', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan' });
    const res = await call(
      `/api/family-members/${id}`,
      { method: 'PATCH', body: json({ name: 'Mẹ Lan', nickname: 'Lan' }) },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Mẹ Lan', nickname: 'Lan' });
  });

  it('không đụng được thành viên của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    const id = await addMember(a, { name: 'Mẹ Lan' });

    for (const init of [
      { method: 'PATCH', body: json({ name: 'Đổi trộm' }) },
      { method: 'DELETE' },
    ]) {
      expect((await call(`/api/family-members/${id}`, init, b.cookie)).status).toBe(404);
    }
    expect(await listMembers(b)).toEqual([]);
  });

  it('đòi đăng nhập', async () => {
    expect((await call('/api/family-members')).status).toBe(401);
    expect((await call('/api/family-members/bat-ky/restore', { method: 'POST' })).status).toBe(401);
  });
});

describe('xoá mềm thành viên', () => {
  it('người đã xoá biến khỏi danh sách nhưng vẫn xem được kèm includeDeleted', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan' });

    const res = await call(`/api/family-members/${id}`, { method: 'DELETE' }, s.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, activities: 0 });

    expect(await listMembers(s)).toEqual([]);
    const all = await listMembers(s, '?includeDeleted=1');
    expect(all).toHaveLength(1);
    expect(all[0].deletedAt).toEqual(expect.any(Number));
  });

  it('báo số hoạt động sẽ bị ảnh hưởng khi xoá', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan' });
    for (const title of ['Dạy Toán', 'Dạy Lý']) {
      await addActivity(s, {
        memberId: id,
        title,
        daysOfWeek: [1],
        startTime: '18:00',
        endTime: '20:00',
        effectiveFrom: '2026-09-01',
      });
    }
    const res = await call(`/api/family-members/${id}`, { method: 'DELETE' }, s.cookie);
    expect(await res.json()).toEqual({ deleted: true, activities: 2 });
  });

  it('không sửa được người đã xoá', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan' });
    await call(`/api/family-members/${id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(
      `/api/family-members/${id}`,
      { method: 'PATCH', body: json({ nickname: 'Lan' }) },
      s.cookie,
    );
    expect(res.status).toBe(404);
  });

  it('khôi phục đưa người đó trở lại danh sách', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan' });
    await call(`/api/family-members/${id}`, { method: 'DELETE' }, s.cookie);

    const res = await call(`/api/family-members/${id}/restore`, { method: 'POST' }, s.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as FamilyMember).deletedAt).toBeNull();
    expect(await listMembers(s)).toHaveLength(1);
  });

  it('khôi phục người chưa xoá trả về 404', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addMember(s, { name: 'Mẹ Lan' });
    expect((await call(`/api/family-members/${id}/restore`, { method: 'POST' }, s.cookie)).status).toBe(
      404,
    );
  });

  it('xoá xong tạo lại đúng tên cũ là tạo MỚI, không phải khôi phục', async () => {
    // Khác hẳn /categories: ràng buộc ở đây là partial index WHERE deleted_at IS NULL.
    const s = await registerOwner('a@example.com', 'Nhà A');
    const old = await addMember(s, { name: 'Mẹ Lan' });
    await call(`/api/family-members/${old}`, { method: 'DELETE' }, s.cookie);

    const fresh = await addMember(s, { name: 'Mẹ Lan', color: 'c4' });
    expect(fresh).not.toBe(old);
    const all = await listMembers(s, '?includeDeleted=1');
    expect(all).toHaveLength(2);
    expect(all.filter((m) => m.deletedAt === null)).toHaveLength(1);
  });

  it('tài khoản của người đã xoá gắn lại được cho người mới', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const old = await addMember(s, { name: 'Bố Nam', userId: s.userId });
    await call(`/api/family-members/${old}`, { method: 'DELETE' }, s.cookie);

    const res = await call(
      '/api/family-members',
      { method: 'POST', body: json({ name: 'Nam', color: 'c2', userId: s.userId }) },
      s.cookie,
    );
    expect(res.status).toBe(201);
  });
});

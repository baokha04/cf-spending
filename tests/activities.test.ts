import { describe, expect, it } from 'vitest';
import { addActivity, addMember, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';
import type { Activity } from '../src/shared/types';

/** Khai đầy đủ để dùng thẳng cho call() — helper addActivity mới tự điền title/kind. */
const BASE = {
  title: 'Hoạt động',
  kind: 'work' as const,
  daysOfWeek: [1, 3, 5],
  startTime: '18:00',
  endTime: '20:00',
  effectiveFrom: '2026-09-01',
};

async function listActivities(session: Session, query = ''): Promise<Activity[]> {
  const res = await call(`/api/activities${query}`, {}, session.cookie);
  return ((await res.json()) as { activities: Activity[] }).activities;
}

async function setup(): Promise<{ s: Session; memberId: string }> {
  const s = await registerOwner('a@example.com', 'Nhà A');
  return { s, memberId: await addMember(s, { name: 'Mẹ Lan', color: 'c2' }) };
}

describe('khai lịch hoạt động', () => {
  it('tạo được khuôn mẫu lặp hàng tuần', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      {
        method: 'POST',
        body: json({ ...BASE, memberId, title: 'Dạy Toán', kind: 'teach', location: 'Nhà văn hoá' }),
      },
      s.cookie,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      title: 'Dạy Toán',
      kind: 'teach',
      location: 'Nhà văn hoá',
      memberId,
      memberName: 'Mẹ Lan',
      daysOfWeek: [1, 3, 5],
      startTime: '18:00',
      endTime: '20:00',
      durationMin: 120,
      overnight: false,
      effectiveTo: null,
    });
  });

  it('khử trùng và sắp xếp các thứ trong tuần', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      { method: 'POST', body: json({ ...BASE, memberId, daysOfWeek: [5, 1, 3, 1, 5] }) },
      s.cookie,
    );
    expect(((await res.json()) as Activity).daysOfWeek).toEqual([1, 3, 5]);
  });

  it('kết thúc sớm hơn bắt đầu nghĩa là ca qua đêm', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      {
        method: 'POST',
        body: json({ ...BASE, memberId, title: 'Ca đêm', startTime: '22:00', endTime: '06:00' }),
      },
      s.cookie,
    );
    expect(await res.json()).toMatchObject({
      startTime: '22:00',
      endTime: '06:00',
      durationMin: 480,
      overnight: true,
    });
  });

  it('buổi kết thúc đúng nửa đêm vẫn tính là trong ngày', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      { method: 'POST', body: json({ ...BASE, memberId, startTime: '23:00', endTime: '00:00' }) },
      s.cookie,
    );
    expect(await res.json()).toMatchObject({ durationMin: 60, overnight: false });
  });

  it('giờ kết thúc trùng giờ bắt đầu bị từ chối', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      { method: 'POST', body: json({ ...BASE, memberId, startTime: '09:00', endTime: '09:00' }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('khác giờ bắt đầu');
  });

  it('không chọn thứ nào bị từ chối', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      { method: 'POST', body: json({ ...BASE, memberId, daysOfWeek: [] }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('ít nhất một thứ');
  });

  it('ngày kết thúc trước ngày bắt đầu bị từ chối', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      {
        method: 'POST',
        body: json({ ...BASE, memberId, effectiveFrom: '2026-09-10', effectiveTo: '2026-09-01' }),
      },
      s.cookie,
    );
    expect(res.status).toBe(400);
  });

  it('buổi lẻ: ngày bắt đầu bằng ngày kết thúc là hợp lệ', async () => {
    const { s, memberId } = await setup();
    const res = await call(
      '/api/activities',
      {
        method: 'POST',
        body: json({ ...BASE, memberId, daysOfWeek: [3], effectiveFrom: '2026-09-02', effectiveTo: '2026-09-02' }),
      },
      s.cookie,
    );
    expect(res.status).toBe(201);
  });

  it('thành viên của hộ khác bị từ chối', async () => {
    const { s } = await setup();
    const b = await registerOwner('b@example.com', 'Nhà B');
    const other = await addMember(b, { name: 'Người nhà B' });
    const res = await call(
      '/api/activities',
      { method: 'POST', body: json({ ...BASE, memberId: other }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('không tồn tại');
  });

  it('thành viên đã xoá bị từ chối', async () => {
    const { s, memberId } = await setup();
    await call(`/api/family-members/${memberId}`, { method: 'DELETE' }, s.cookie);
    const res = await call(
      '/api/activities',
      { method: 'POST', body: json({ ...BASE, memberId }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('đã bị xoá');
  });

  it('sửa được giờ, các thứ và khoảng hiệu lực', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const res = await call(
      `/api/activities/${id}`,
      {
        method: 'PATCH',
        body: json({ daysOfWeek: [2, 4], startTime: '07:30', endTime: '11:00', effectiveTo: '2026-12-31' }),
      },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      daysOfWeek: [2, 4],
      startTime: '07:30',
      endTime: '11:00',
      durationMin: 210,
      effectiveTo: '2026-12-31',
    });
  });

  it('sửa mỗi một giờ mà không gửi giờ kia bị từ chối', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const res = await call(
      `/api/activities/${id}`,
      { method: 'PATCH', body: json({ startTime: '07:30' }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('cả giờ bắt đầu');
  });

  it('sửa effectiveTo lùi trước effectiveFrom đã lưu bị từ chối', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId, effectiveFrom: '2026-09-10' });
    const res = await call(
      `/api/activities/${id}`,
      { method: 'PATCH', body: json({ effectiveTo: '2026-09-01' }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
  });

  it('lọc theo thành viên và theo loại', async () => {
    const { s, memberId } = await setup();
    const other = await addMember(s, { name: 'Bố Nam', color: 'c1' });
    await addActivity(s, { ...BASE, memberId, title: 'Dạy Toán', kind: 'teach' });
    await addActivity(s, { ...BASE, memberId: other, title: 'Đi làm', kind: 'work' });

    expect((await listActivities(s)).map((a) => a.title).sort()).toEqual(['Dạy Toán', 'Đi làm']);
    expect((await listActivities(s, `?memberId=${memberId}`)).map((a) => a.title)).toEqual(['Dạy Toán']);
    expect((await listActivities(s, '?kind=work')).map((a) => a.title)).toEqual(['Đi làm']);
    expect((await call('/api/activities?kind=xyz', {}, s.cookie)).status).toBe(400);
  });

  it('xoá mềm rồi khôi phục', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });

    expect((await call(`/api/activities/${id}`, { method: 'DELETE' }, s.cookie)).status).toBe(200);
    expect(await listActivities(s)).toEqual([]);
    const deleted = await listActivities(s, '?includeDeleted=1');
    expect(deleted[0].deletedAt).toEqual(expect.any(Number));

    const res = await call(`/api/activities/${id}/restore`, { method: 'POST' }, s.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Activity).deletedAt).toBeNull();
    expect(await listActivities(s)).toHaveLength(1);
  });

  it('không đụng được hoạt động của hộ khác', async () => {
    const { s, memberId } = await setup();
    const b = await registerOwner('b@example.com', 'Nhà B');
    const id = await addActivity(s, { ...BASE, memberId });

    expect(
      (await call(`/api/activities/${id}`, { method: 'PATCH', body: json({ title: 'X' }) }, b.cookie))
        .status,
    ).toBe(404);
    expect((await call(`/api/activities/${id}`, { method: 'DELETE' }, b.cookie)).status).toBe(404);
    expect(await listActivities(b)).toEqual([]);
  });

  it('đòi đăng nhập', async () => {
    expect((await call('/api/activities')).status).toBe(401);
  });
});

describe('ngoại lệ từng buổi', () => {
  it('nghỉ một buổi', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const res = await call(
      `/api/activities/${id}/exceptions`,
      { method: 'POST', body: json({ occursOn: '2026-09-02', status: 'cancelled', note: 'Ốm' }) },
      s.cookie,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      occursOn: '2026-09-02',
      status: 'cancelled',
      newDate: null,
      note: 'Ốm',
    });
  });

  it('dời một buổi sang ngày và giờ khác', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const res = await call(
      `/api/activities/${id}/exceptions`,
      {
        method: 'POST',
        body: json({
          occursOn: '2026-09-04',
          status: 'moved',
          newDate: '2026-09-03',
          newStartTime: '19:00',
          newEndTime: '21:00',
        }),
      },
      s.cookie,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      status: 'moved',
      newDate: '2026-09-03',
      newStartTime: '19:00',
      newDurationMin: 120,
    });
  });

  it('ngày không có buổi nào thì không đặt được ngoại lệ', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId }); // T2/T4/T6
    // 2026-09-01 là Thứ 3 — khuôn mẫu không sinh buổi nào.
    const res = await call(
      `/api/activities/${id}/exceptions`,
      { method: 'POST', body: json({ occursOn: '2026-09-01', status: 'cancelled' }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('không có buổi nào');
  });

  it('ngày ngoài khoảng hiệu lực cũng bị từ chối', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId, effectiveTo: '2026-09-10' });
    const res = await call(
      `/api/activities/${id}/exceptions`,
      { method: 'POST', body: json({ occursOn: '2026-09-16', status: 'cancelled' }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
  });

  it('mỗi buổi chỉ mang được một ngoại lệ', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const body = json({ occursOn: '2026-09-02', status: 'cancelled' });
    await call(`/api/activities/${id}/exceptions`, { method: 'POST', body }, s.cookie);
    const again = await call(`/api/activities/${id}/exceptions`, { method: 'POST', body }, s.cookie);
    expect(again.status).toBe(409);
  });

  it('nghỉ buổi mà kèm ngày mới là mâu thuẫn', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const res = await call(
      `/api/activities/${id}/exceptions`,
      {
        method: 'POST',
        body: json({ occursOn: '2026-09-02', status: 'cancelled', newDate: '2026-09-03' }),
      },
      s.cookie,
    );
    expect(res.status).toBe(400);
  });

  it('dời buổi mà không đổi gì cả bị từ chối', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    const res = await call(
      `/api/activities/${id}/exceptions`,
      { method: 'POST', body: json({ occursOn: '2026-09-02', status: 'moved' }) },
      s.cookie,
    );
    expect(res.status).toBe(400);
  });

  it('xoá ngoại lệ trả buổi về khuôn mẫu', async () => {
    const { s, memberId } = await setup();
    const id = await addActivity(s, { ...BASE, memberId });
    await call(
      `/api/activities/${id}/exceptions`,
      { method: 'POST', body: json({ occursOn: '2026-09-02', status: 'cancelled' }) },
      s.cookie,
    );
    expect(
      (await call(`/api/activities/${id}/exceptions/2026-09-02`, { method: 'DELETE' }, s.cookie))
        .status,
    ).toBe(200);
    expect(
      (await call(`/api/activities/${id}/exceptions/2026-09-02`, { method: 'DELETE' }, s.cookie))
        .status,
    ).toBe(404);
  });

  it('ngoại lệ của hộ khác không đọc hay xoá được', async () => {
    const { s, memberId } = await setup();
    const b = await registerOwner('b@example.com', 'Nhà B');
    const id = await addActivity(s, { ...BASE, memberId });
    await call(
      `/api/activities/${id}/exceptions`,
      { method: 'POST', body: json({ occursOn: '2026-09-02', status: 'cancelled' }) },
      s.cookie,
    );
    expect((await call(`/api/activities/${id}/exceptions`, {}, b.cookie)).status).toBe(404);
    expect(
      (await call(`/api/activities/${id}/exceptions/2026-09-02`, { method: 'DELETE' }, b.cookie))
        .status,
    ).toBe(404);
  });
});

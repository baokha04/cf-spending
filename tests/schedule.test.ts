import { describe, expect, it } from 'vitest';
import { addActivity, addMember, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';
import type { Occurrence, ScheduleResponse } from '../src/shared/types';

/*
 * Mốc thời gian dùng chung: 2026-08-31 là Thứ 2, nên tuần khảo sát là
 * 2026-08-31 (T2) … 2026-09-06 (CN).
 */
const WEEK = { from: '2026-08-31', to: '2026-09-06' };

async function schedule(
  session: Session,
  query: { from: string; to: string; memberId?: string; kind?: string } = WEEK,
): Promise<ScheduleResponse> {
  const qs = new URLSearchParams(query as Record<string, string>).toString();
  const res = await call(`/api/schedule?${qs}`, {}, session.cookie);
  if (!res.ok) throw new Error(`Lịch lỗi ${res.status}: ${await res.text()}`);
  return (await res.json()) as ScheduleResponse;
}

async function dates(session: Session, query = WEEK): Promise<string[]> {
  return (await schedule(session, query)).occurrences.map((o) => o.date);
}

async function setup(): Promise<{ s: Session; memberId: string }> {
  const s = await registerOwner('a@example.com', 'Nhà A');
  return { s, memberId: await addMember(s, { name: 'Mẹ Lan', color: 'c2' }) };
}

/** Khuôn mẫu T2/T4/T6 18:00–20:00, không có ngày kết thúc. */
async function weeklyActivity(s: Session, memberId: string, extra = {}): Promise<string> {
  return addActivity(s, {
    memberId,
    title: 'Dạy Toán',
    kind: 'teach',
    daysOfWeek: [1, 3, 5],
    startTime: '18:00',
    endTime: '20:00',
    effectiveFrom: '2026-08-01',
    ...extra,
  });
}

async function addException(
  s: Session,
  activityId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return call(`/api/activities/${activityId}/exceptions`, { method: 'POST', body: json(body) }, s.cookie);
}

describe('trải lịch theo khoảng ngày', () => {
  it('khuôn mẫu T2/T4/T6 sinh đúng ba buổi trong một tuần', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId);
    expect(await dates(s)).toEqual(['2026-08-31', '2026-09-02', '2026-09-04']);
  });

  it('buổi mang đủ giờ, thành viên và ngày gốc', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    const [first] = (await schedule(s)).occurrences;
    expect(first).toMatchObject({
      activityId: id,
      memberId,
      title: 'Dạy Toán',
      kind: 'teach',
      date: '2026-08-31',
      startTime: '18:00',
      endTime: '20:00',
      startMinute: 1080,
      durationMin: 120,
      overnight: false,
      sourceDate: '2026-08-31',
      moved: false,
    });
  });

  it('effectiveFrom cắt các buổi trước ngày bắt đầu', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId, { effectiveFrom: '2026-09-02' });
    expect(await dates(s)).toEqual(['2026-09-02', '2026-09-04']);
  });

  it('effectiveTo là mốc BAO GỒM', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId, { effectiveTo: '2026-09-02' });
    expect(await dates(s)).toEqual(['2026-08-31', '2026-09-02']);
  });

  it('buổi lẻ: effectiveFrom bằng effectiveTo cho đúng một buổi', async () => {
    const { s, memberId } = await setup();
    await addActivity(s, {
      memberId,
      title: 'Dạy bù',
      kind: 'teach',
      daysOfWeek: [3],
      startTime: '09:00',
      endTime: '11:00',
      effectiveFrom: '2026-09-02',
      effectiveTo: '2026-09-02',
    });
    expect(await dates(s)).toEqual(['2026-09-02']);
  });

  it('thứ không nằm trong khuôn mẫu thì không bao giờ sinh buổi', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId, { daysOfWeek: [7] }); // chỉ Chủ nhật
    expect(await dates(s)).toEqual(['2026-09-06']);
  });

  it('sắp theo ngày rồi theo giờ', async () => {
    const { s, memberId } = await setup();
    await addActivity(s, {
      memberId,
      title: 'Chiều',
      daysOfWeek: [1],
      startTime: '15:00',
      endTime: '16:00',
      effectiveFrom: '2026-08-01',
    });
    await addActivity(s, {
      memberId,
      title: 'Sáng',
      daysOfWeek: [1],
      startTime: '08:00',
      endTime: '09:00',
      effectiveFrom: '2026-08-01',
    });
    const occ = (await schedule(s)).occurrences;
    expect(occ.map((o) => o.title)).toEqual(['Sáng', 'Chiều']);
  });
});

describe('ngoại lệ khi trải lịch', () => {
  it('nghỉ một buổi chỉ bỏ đúng buổi đó', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await addException(s, id, { occursOn: '2026-09-02', status: 'cancelled' });
    expect(await dates(s)).toEqual(['2026-08-31', '2026-09-04']);
  });

  it('dời giờ giữ nguyên ngày', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await addException(s, id, {
      occursOn: '2026-09-02',
      status: 'moved',
      newStartTime: '20:30',
      newEndTime: '22:00',
    });
    const moved = (await schedule(s)).occurrences.find((o) => o.sourceDate === '2026-09-02')!;
    expect(moved).toMatchObject({
      date: '2026-09-02',
      startTime: '20:30',
      endTime: '22:00',
      durationMin: 90,
      moved: true,
    });
  });

  it('dời sang ngày khác trong cùng tuần', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await addException(s, id, { occursOn: '2026-09-04', status: 'moved', newDate: '2026-09-05' });
    expect(await dates(s)).toEqual(['2026-08-31', '2026-09-02', '2026-09-05']);
  });

  it('buổi bị dời TỪ NGOÀI khoảng VÀO TRONG khoảng vẫn hiện ra', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    // Buổi gốc Thứ 6 tuần trước (2026-08-28), dời sang Thứ 3 của tuần đang xem.
    await addException(s, id, { occursOn: '2026-08-28', status: 'moved', newDate: '2026-09-01' });
    const occ = await schedule(s);
    expect(occ.occurrences.map((o) => o.date)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-04',
    ]);
    const movedIn = occ.occurrences.find((o) => o.date === '2026-09-01')!;
    expect(movedIn).toMatchObject({ sourceDate: '2026-08-28', moved: true });
  });

  it('buổi bị dời RA NGOÀI khoảng biến mất khỏi khoảng', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await addException(s, id, { occursOn: '2026-09-04', status: 'moved', newDate: '2026-09-11' });
    expect(await dates(s)).toEqual(['2026-08-31', '2026-09-02']);
  });

  it('buổi dời vào không bị đếm hai lần khi cả ngày gốc lẫn ngày mới cùng trong khoảng', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await addException(s, id, { occursOn: '2026-09-02', status: 'moved', newDate: '2026-09-03' });
    const occ = (await schedule(s)).occurrences;
    expect(occ.map((o) => o.date)).toEqual(['2026-08-31', '2026-09-03', '2026-09-04']);
    expect(occ.filter((o) => o.sourceDate === '2026-09-02')).toHaveLength(1);
  });

  it('xoá ngoại lệ trả buổi về đúng khuôn mẫu', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await addException(s, id, { occursOn: '2026-09-02', status: 'cancelled' });
    await call(`/api/activities/${id}/exceptions/2026-09-02`, { method: 'DELETE' }, s.cookie);
    expect(await dates(s)).toEqual(['2026-08-31', '2026-09-02', '2026-09-04']);
  });
});

describe('ca qua đêm', () => {
  /** Ca 22:00–06:00, chỉ Thứ 7 (2026-09-05 trong tuần khảo sát). */
  async function nightShift(s: Session, memberId: string, days = [6]): Promise<string> {
    return addActivity(s, {
      memberId,
      title: 'Ca đêm',
      kind: 'work',
      daysOfWeek: days,
      startTime: '22:00',
      endTime: '06:00',
      effectiveFrom: '2026-08-01',
    });
  }

  it('trả về một bản ghi logic, không tách đôi', async () => {
    const { s, memberId } = await setup();
    await nightShift(s, memberId);
    const occ = (await schedule(s)).occurrences;
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({
      date: '2026-09-05',
      startTime: '22:00',
      endTime: '06:00',
      durationMin: 480,
      overnight: true,
    });
  });

  it('ca bắt đầu hôm trước khoảng vẫn tràn vào ngày đầu khoảng', async () => {
    const { s, memberId } = await setup();
    // Chủ nhật 2026-08-30 nằm ngay trước tuần khảo sát; ca chạy tới 06:00 Thứ 2.
    await nightShift(s, memberId, [7]);
    const occ = (await schedule(s)).occurrences;
    expect(occ.map((o) => o.date)).toEqual(['2026-08-30', '2026-09-06']);
  });

  it('ca ở ngày cuối khoảng chỉ trả về một lần', async () => {
    const { s, memberId } = await setup();
    await nightShift(s, memberId, [7]); // Chủ nhật 2026-09-06 là ngày cuối khoảng
    const occ = (await schedule(s)).occurrences.filter((o) => o.date === '2026-09-06');
    expect(occ).toHaveLength(1);
  });

  it('ca đêm không bị lôi vào khoảng mà nó không chạm tới', async () => {
    const { s, memberId } = await setup();
    await nightShift(s, memberId, [6]); // Thứ 7
    // Khoảng chỉ gồm Thứ 2 tới Thứ 5 — ca Thứ 7 không dính dáng.
    expect(await dates(s, { from: '2026-08-31', to: '2026-09-03' })).toEqual([]);
  });
});

describe('phạm vi và bộ lọc của lịch', () => {
  it('lọc theo thành viên và theo loại hoạt động', async () => {
    const { s, memberId } = await setup();
    const other = await addMember(s, { name: 'Bố Nam', color: 'c1' });
    await weeklyActivity(s, memberId);
    await addActivity(s, {
      memberId: other,
      title: 'Đi làm',
      kind: 'work',
      daysOfWeek: [1],
      startTime: '08:00',
      endTime: '17:00',
      effectiveFrom: '2026-08-01',
    });

    expect((await schedule(s)).occurrences).toHaveLength(4);
    expect((await schedule(s, { ...WEEK, memberId })).occurrences.every((o) => o.memberId === memberId)).toBe(
      true,
    );
    const work = await schedule(s, { ...WEEK, kind: 'work' });
    expect(work.occurrences.map((o) => o.title)).toEqual(['Đi làm']);
    // Danh sách thành viên luôn đầy đủ để giao diện dựng được legend và bộ lọc.
    expect(work.members).toHaveLength(2);
  });

  it('hoạt động đã xoá mềm biến mất rồi quay lại khi khôi phục', async () => {
    const { s, memberId } = await setup();
    const id = await weeklyActivity(s, memberId);
    await call(`/api/activities/${id}`, { method: 'DELETE' }, s.cookie);
    expect(await dates(s)).toEqual([]);

    await call(`/api/activities/${id}/restore`, { method: 'POST' }, s.cookie);
    expect(await dates(s)).toHaveLength(3);
  });

  it('xoá thành viên làm lịch của họ biến mất, khôi phục thì quay lại nguyên vẹn', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId);
    await call(`/api/family-members/${memberId}`, { method: 'DELETE' }, s.cookie);
    const gone = await schedule(s);
    expect(gone.occurrences).toEqual([]);
    expect(gone.members).toEqual([]);

    await call(`/api/family-members/${memberId}/restore`, { method: 'POST' }, s.cookie);
    const back = await schedule(s);
    expect(back.occurrences).toHaveLength(3);
    expect(back.members).toHaveLength(1);
  });

  it('dữ liệu hộ khác không bao giờ lọt sang', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId);
    const b = await registerOwner('b@example.com', 'Nhà B');
    const other = await schedule(b);
    expect(other.occurrences).toEqual([]);
    expect(other.members).toEqual([]);
  });

  it('một ngày duy nhất là khoảng hợp lệ', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId);
    expect(await dates(s, { from: '2026-09-02', to: '2026-09-02' })).toEqual(['2026-09-02']);
  });

  it('lưới tháng 42 ô vẫn nằm trong hạn cho phép', async () => {
    const { s, memberId } = await setup();
    await weeklyActivity(s, memberId);
    const occ = await dates(s, { from: '2026-08-31', to: '2026-10-11' });
    expect(occ.length).toBeGreaterThan(15);
  });

  it('từ chối khoảng ngược, khoảng quá dài và ngày sai định dạng', async () => {
    const { s } = await setup();
    const bad = [
      '?from=2026-09-10&to=2026-09-01',
      '?from=2026-01-01&to=2026-12-31',
      '?from=2026-13-01&to=2026-13-05',
      '?from=2026-09-01',
    ];
    for (const query of bad) {
      expect((await call(`/api/schedule${query}`, {}, s.cookie)).status).toBe(400);
    }
  });

  it('đòi đăng nhập', async () => {
    expect((await call(`/api/schedule?from=${WEEK.from}&to=${WEEK.to}`)).status).toBe(401);
  });
});

describe('lịch nhiều thành viên chồng giờ', () => {
  it('hai người bận cùng khung giờ đều được trả về', async () => {
    const { s, memberId } = await setup();
    const con = await addMember(s, { name: 'Bé Na', color: 'c3' });
    await weeklyActivity(s, memberId, { daysOfWeek: [3] }); // 18:00-20:00 Thứ 4
    await addActivity(s, {
      memberId: con,
      title: 'Học thêm Anh',
      kind: 'study',
      daysOfWeek: [3],
      startTime: '18:30',
      endTime: '20:00',
      effectiveFrom: '2026-08-01',
    });

    const sameDay: Occurrence[] = (await schedule(s)).occurrences.filter(
      (o) => o.date === '2026-09-02',
    );
    expect(sameDay).toHaveLength(2);
    expect(sameDay.map((o) => o.startTime)).toEqual(['18:00', '18:30']);
  });
});

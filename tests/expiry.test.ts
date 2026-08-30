import { describe, expect, it } from 'vitest';
import { addTransaction, call, json, registerOwner } from './helpers';
import type { Session } from './helpers';
import { addDays, todayInVietnam } from '../src/server/dates';
import {
  EXPIRY_WINDOW_DAYS,
  addMonths,
  daysUntil,
  expiryStatus,
  needsRenewal,
  renewBaseDate,
} from '../src/shared/expiry';

/** Mọi mốc trong test tính từ hôm nay theo giờ Việt Nam — đúng mốc server dùng. */
const today = todayInVietnam();
const at = (delta: number) => addDays(today, delta);

interface ExpiringBody {
  today: string;
  days: number;
  overdue: Array<{ transaction: { id: string; note: string; expiresOn: string }; daysLeft: number }>;
  soon: Array<{ transaction: { id: string; note: string; expiresOn: string }; daysLeft: number }>;
}

async function expiring(session: Session, query = ''): Promise<ExpiringBody> {
  const res = await call(`/api/transactions/expiring${query}`, {}, session.cookie);
  if (res.status !== 200) throw new Error(`Hỏi danh sách hết hạn thất bại: ${await res.text()}`);
  return (await res.json()) as ExpiringBody;
}

const notes = (rows: ExpiringBody['overdue']) => rows.map((r) => r.transaction.note);

describe('toán ngày cho hạn gia hạn', () => {
  it('đếm số ngày còn lại, âm khi đã quá hạn', () => {
    expect(daysUntil('2026-08-30', '2026-09-06')).toBe(7);
    expect(daysUntil('2026-08-30', '2026-08-30')).toBe(0);
    expect(daysUntil('2026-08-30', '2026-08-27')).toBe(-3);
    // Qua mốc năm vẫn đúng vì phép trừ chạy ở UTC.
    expect(daysUntil('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('phân loại hạn theo cửa sổ nhắc một tuần', () => {
    expect(expiryStatus(-1)).toBe('overdue');
    expect(expiryStatus(0)).toBe('today');
    expect(expiryStatus(EXPIRY_WINDOW_DAYS)).toBe('soon');
    expect(expiryStatus(EXPIRY_WINDOW_DAYS + 1)).toBe('later');
    // Chỉ 'later' là không phải nhắc.
    expect([-1, 0, 3, 7].every((d) => needsRenewal(d))).toBe(true);
    expect(needsRenewal(8)).toBe(false);
  });

  it('cộng tháng và kẹp lại khi tháng đích ngắn hơn', () => {
    expect(addMonths('2026-08-30', 1)).toBe('2026-09-30');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // năm nhuận
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonths('2026-08-30', 12)).toBe('2027-08-30');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('gia hạn nối tiếp từ hạn cũ, trừ khi hạn cũ đã trôi qua', () => {
    // Hạn còn hiệu lực: nối tiếp để chu kỳ không trôi dần mỗi lần gia hạn muộn.
    expect(renewBaseDate('2026-09-10', '2026-09-01')).toBe('2026-09-10');
    // Hạn đã qua: tính từ hôm nay, nếu không hạn mới có thể vẫn còn quá hạn.
    expect(renewBaseDate('2026-06-01', '2026-09-01')).toBe('2026-09-01');
    expect(renewBaseDate('2026-09-01', '2026-09-01')).toBe('2026-09-01');
  });
});

describe('ngày hết hạn của giao dịch', () => {
  it('ghi và đọc lại được hạn, mặc định là không có hạn', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const withExpiry = await addTransaction(s, {
      occurredOn: '2026-08-14',
      amount: 5_000_000,
      note: 'Bảo hiểm xe',
      expiresOn: '2027-08-14',
    });
    const without = await addTransaction(s, { occurredOn: '2026-08-14', amount: 250_000 });

    const read = async (id: string) =>
      (await (await call(`/api/transactions/${id}`, {}, s.cookie)).json()) as {
        expiresOn: string | null;
      };
    expect((await read(withExpiry)).expiresOn).toBe('2027-08-14');
    expect((await read(without)).expiresOn).toBeNull();
  });

  it('từ chối hạn nằm trước ngày phát sinh, kể cả khi PATCH chỉ gửi một đầu', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');

    const created = await call(
      '/api/transactions',
      {
        method: 'POST',
        body: json({
          occurredOn: '2026-08-14',
          amount: 100_000,
          direction: 'expense',
          recurrence: 'one_off',
          expiresOn: '2026-08-13',
        }),
      },
      s.cookie,
    );
    expect(created.status).toBe(400);

    const id = await addTransaction(s, {
      occurredOn: '2026-08-14',
      amount: 100_000,
      expiresOn: '2026-09-14',
    });

    // Sửa mỗi hạn: so với ngày phát sinh đang lưu trong database.
    const badExpiry = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ expiresOn: '2026-08-01' }) },
      s.cookie,
    );
    expect(badExpiry.status).toBe(400);

    // Đẩy ngày phát sinh vượt qua hạn cũ cũng phải bị chặn.
    const badOccurred = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ occurredOn: '2026-10-01' }) },
      s.cookie,
    );
    expect(badOccurred.status).toBe(400);

    // Hạn trùng ngày phát sinh vẫn hợp lệ.
    const sameDay = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ expiresOn: '2026-08-14' }) },
      s.cookie,
    );
    expect(sameDay.status).toBe(200);
  });

  it('gia hạn bằng PATCH, và gửi null để bỏ hạn', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, {
      occurredOn: '2026-08-14',
      amount: 100_000,
      expiresOn: '2026-09-14',
    });

    const renewed = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ expiresOn: addMonths('2026-09-14', 3) }) },
      s.cookie,
    );
    expect(((await renewed.json()) as { expiresOn: string }).expiresOn).toBe('2026-12-14');

    const cleared = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ expiresOn: null }) },
      s.cookie,
    );
    expect(((await cleared.json()) as { expiresOn: string | null }).expiresOn).toBeNull();

    // Không gửi trường này thì hạn (đang là null) không bị đụng tới.
    const untouched = await call(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: json({ note: 'đổi nội dung' }) },
      s.cookie,
    );
    expect(((await untouched.json()) as { expiresOn: string | null }).expiresOn).toBeNull();
  });
});

describe('nhắc gia hạn các khoản sắp hết hạn', () => {
  it('gom khoản quá hạn và khoản hết hạn trong một tuần, bỏ qua phần còn lại', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const old = at(-60);
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'quá hạn 3 ngày', expiresOn: at(-3) });
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'hết hạn hôm nay', expiresOn: today });
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'còn 7 ngày', expiresOn: at(7) });
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'còn 8 ngày', expiresOn: at(8) });
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'không có hạn' });

    const body = await expiring(s);
    expect(body.today).toBe(today);
    expect(body.days).toBe(EXPIRY_WINDOW_DAYS);
    expect(notes(body.overdue)).toEqual(['quá hạn 3 ngày']);
    expect(body.overdue[0].daysLeft).toBe(-3);
    // Hôm nay là 0 ngày còn lại nên nằm ở nhóm 'soon', không phải 'overdue'.
    expect(notes(body.soon)).toEqual(['hết hạn hôm nay', 'còn 7 ngày']);
    expect(body.soon.map((r) => r.daysLeft)).toEqual([0, 7]);
  });

  it('sắp theo hạn tăng dần: khoản gấp nhất đứng trước', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const old = at(-90);
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'c', expiresOn: at(5) });
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'a', expiresOn: at(-30) });
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'b', expiresOn: at(-1) });

    const body = await expiring(s);
    expect(notes(body.overdue)).toEqual(['a', 'b']);
    expect(notes(body.soon)).toEqual(['c']);
  });

  it('nới hoặc thu cửa sổ nhắc bằng ?days=', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const old = at(-30);
    await addTransaction(s, { occurredOn: old, amount: 1, note: 'hôm nay', expiresOn: today });
    await addTransaction(s, { occurredOn: old, amount: 1, note: '30 ngày nữa', expiresOn: at(30) });

    // days=0: chỉ những gì đã tới hạn.
    const tight = await expiring(s, '?days=0');
    expect(notes(tight.soon)).toEqual(['hôm nay']);

    const wide = await expiring(s, '?days=30');
    expect(wide.days).toBe(30);
    expect(notes(wide.soon)).toEqual(['hôm nay', '30 ngày nữa']);

    // Quá chặn trên thì từ chối chứ không lặng lẽ cắt bớt.
    const tooWide = await call('/api/transactions/expiring?days=365', {}, s.cookie);
    expect(tooWide.status).toBe(400);
  });

  it('bỏ qua giao dịch đã xoá mềm, và khoản đó quay lại sau khi khôi phục', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, {
      occurredOn: at(-30),
      amount: 1,
      note: 'sắp hết hạn',
      expiresOn: at(2),
    });

    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);
    expect((await expiring(s)).soon).toHaveLength(0);

    await call(`/api/transactions/${id}/restore`, { method: 'POST' }, s.cookie);
    expect(notes((await expiring(s)).soon)).toEqual(['sắp hết hạn']);
  });

  it('không nhìn thấy hạn của hộ khác', async () => {
    const a = await registerOwner('a@example.com', 'Nhà A');
    const b = await registerOwner('b@example.com', 'Nhà B');
    await addTransaction(a, { occurredOn: at(-30), amount: 1, note: 'của nhà A', expiresOn: at(1) });

    expect(notes((await expiring(a)).soon)).toEqual(['của nhà A']);
    expect((await expiring(b)).soon).toHaveLength(0);
  });

  it('đòi đăng nhập', async () => {
    const res = await call('/api/transactions/expiring');
    expect(res.status).toBe(401);
  });
});

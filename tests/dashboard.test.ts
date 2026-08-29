import { describe, expect, it } from 'vitest';
import { addTransaction, call, registerOwner } from './helpers';
import type { Session } from './helpers';
import type { DashboardSummary } from '../src/shared/types';
import { buildDailySeries } from '../src/server/dashboard';
import { currentMonthInVietnam, previousMonth, todayInVietnam } from '../src/server/dates';

async function summary(session: Session, month: string): Promise<DashboardSummary> {
  const res = await call(`/api/dashboard/summary?month=${month}`, {}, session.cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as DashboardSummary;
}

/**
 * Bộ dữ liệu cố định trải hai tháng, đủ bốn tổ hợp thu/chi × hàng tháng/phát sinh.
 * Mọi con số dưới đây được cộng tay để kiểm chứng kết quả tổng hợp.
 */
async function seedTwoMonths(s: Session): Promise<void> {
  // Tháng 8/2026 — thu 20.000.000 + 2.000.000 = 22.000.000
  await addTransaction(s, { occurredOn: '2026-08-01', amount: 20_000_000, direction: 'income', recurrence: 'monthly', note: 'lương' });
  await addTransaction(s, { occurredOn: '2026-08-20', amount: 2_000_000, direction: 'income', recurrence: 'one_off', note: 'thưởng' });
  // Tháng 8/2026 — chi cố định 5.000.000 + 1.200.000 = 6.200.000; phát sinh 800.000 + 450.000 = 1.250.000
  await addTransaction(s, { occurredOn: '2026-08-01', amount: 5_000_000, recurrence: 'monthly', note: 'tiền nhà' });
  await addTransaction(s, { occurredOn: '2026-08-05', amount: 1_200_000, recurrence: 'monthly', note: 'tiền điện' });
  await addTransaction(s, { occurredOn: '2026-08-12', amount: 800_000, recurrence: 'one_off', note: 'sửa xe' });
  await addTransaction(s, { occurredOn: '2026-08-31', amount: 450_000, recurrence: 'one_off', note: 'ăn ngoài' });

  // Tháng 7/2026 — thu 20.000.000; chi cố định 5.000.000; phát sinh 3.000.000
  await addTransaction(s, { occurredOn: '2026-07-01', amount: 20_000_000, direction: 'income', recurrence: 'monthly', note: 'lương' });
  await addTransaction(s, { occurredOn: '2026-07-01', amount: 5_000_000, recurrence: 'monthly', note: 'tiền nhà' });
  await addTransaction(s, { occurredOn: '2026-07-15', amount: 3_000_000, recurrence: 'one_off', note: 'du lịch' });

  // Tháng 6/2026 — nằm ngoài khoảng, không được lọt vào kết quả.
  await addTransaction(s, { occurredOn: '2026-06-30', amount: 9_999_999, note: 'tháng cũ' });
}

describe('tổng hợp dashboard', () => {
  it('cộng đúng thu, chi, chênh lệch và tách được chi cố định với phát sinh', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await seedTwoMonths(s);

    const data = await summary(s, '2026-08');

    expect(data.months).toEqual({ current: '2026-08', previous: '2026-07' });
    expect(data.currency).toBe('VND');

    expect(data.totals.current).toMatchObject({
      income: 22_000_000,
      expense: 7_450_000,
      net: 14_550_000,
      monthlyExpense: 6_200_000,
      oneOffExpense: 1_250_000,
      monthlyIncome: 20_000_000,
      oneOffIncome: 2_000_000,
      count: 6,
    });

    expect(data.totals.previous).toMatchObject({
      income: 20_000_000,
      expense: 8_000_000,
      net: 12_000_000,
      monthlyExpense: 5_000_000,
      oneOffExpense: 3_000_000,
      count: 3,
    });
  });

  it('không kéo dữ liệu ngoài khoảng hai tháng vào tổng hợp', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await seedTwoMonths(s);

    const data = await summary(s, '2026-08');
    const everything = data.totals.current.expense + data.totals.previous.expense;
    expect(everything).toBe(7_450_000 + 8_000_000); // giao dịch tháng 6 nằm ngoài
  });

  it('giao dịch ngày đầu và ngày cuối tháng vẫn nằm đúng tháng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    // Tháng 8 có 31 ngày; hai mốc biên là chỗ dễ lệch nhất khi tính khoảng.
    await addTransaction(s, { occurredOn: '2026-08-01', amount: 111 });
    await addTransaction(s, { occurredOn: '2026-08-31', amount: 222 });
    await addTransaction(s, { occurredOn: '2026-07-31', amount: 333 });
    await addTransaction(s, { occurredOn: '2026-09-01', amount: 444 });

    const data = await summary(s, '2026-08');
    expect(data.totals.current.expense).toBe(111 + 222);
    expect(data.totals.previous.expense).toBe(333);
  });

  it('tháng 2 năm nhuận và ranh giới cuối năm được tính đúng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: '2028-02-29', amount: 500 });
    const feb = await summary(s, '2028-02');
    expect(feb.totals.current.expense).toBe(500);

    await addTransaction(s, { occurredOn: '2025-12-31', amount: 700 });
    const jan = await summary(s, '2026-01');
    expect(jan.months.previous).toBe('2025-12');
    expect(jan.totals.previous.expense).toBe(700);
  });

  it('tháng trước rỗng không sinh NaN hay Infinity', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: '2026-08-10', amount: 1_000_000 });

    const data = await summary(s, '2026-08');
    expect(data.totals.previous).toMatchObject({ income: 0, expense: 0, net: 0, count: 0 });
    for (const value of Object.values(data.totals.previous)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('hộ chưa có giao dịch nào vẫn trả về khung đầy đủ', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const data = await summary(s, '2026-08');
    expect(data.totals.current.expense).toBe(0);
    expect(data.byCategory).toEqual([]);
    expect(data.recent).toEqual([]);
    expect(data.dailyExpense).toHaveLength(31);
  });

  it('bỏ giao dịch đã xoá mềm ra khỏi tổng hợp', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const id = await addTransaction(s, { occurredOn: '2026-08-10', amount: 1_000_000 });
    await addTransaction(s, { occurredOn: '2026-08-11', amount: 500_000 });

    await call(`/api/transactions/${id}`, { method: 'DELETE' }, s.cookie);
    const data = await summary(s, '2026-08');
    expect(data.totals.current.expense).toBe(500_000);
    expect(data.totals.current.count).toBe(1);
  });

  it('mặc định lấy tháng hiện tại khi không truyền tham số', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: todayInVietnam(), amount: 123_000 });

    const res = await call('/api/dashboard/summary', {}, s.cookie);
    const data = (await res.json()) as DashboardSummary;
    expect(data.months.current).toBe(currentMonthInVietnam());
    expect(data.months.previous).toBe(previousMonth(currentMonthInVietnam()));
    expect(data.totals.current.expense).toBe(123_000);
  });

  it('từ chối tham số tháng sai định dạng', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    for (const bad of ['2026-13', 'thang-8', '2026/08', '26-08']) {
      const res = await call(`/api/dashboard/summary?month=${encodeURIComponent(bad)}`, {}, s.cookie);
      expect(res.status).toBe(400);
    }
  });
});

describe('phân tích theo danh mục', () => {
  it('ghép đúng số hai tháng và tính chênh lệch cho từng danh mục', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    const cats = (await (await call('/api/categories', {}, s.cookie)).json()) as {
      categories: Array<{ id: string; name: string; kind: string }>;
    };
    const food = cats.categories.find((c) => c.name === 'Ăn uống')!.id;

    await addTransaction(s, { occurredOn: '2026-08-05', amount: 3_000_000, categoryId: food });
    await addTransaction(s, { occurredOn: '2026-07-05', amount: 2_000_000, categoryId: food });
    await addTransaction(s, { occurredOn: '2026-08-06', amount: 500_000 }); // chưa phân loại

    const data = await summary(s, '2026-08');
    const foodRow = data.byCategory.find((r) => r.categoryId === food)!;
    expect(foodRow).toMatchObject({
      name: 'Ăn uống',
      kind: 'expense',
      current: 3_000_000,
      previous: 2_000_000,
      delta: 1_000_000,
    });

    const uncategorized = data.byCategory.find((r) => r.categoryId === null)!;
    expect(uncategorized).toMatchObject({ name: 'Chưa phân loại', current: 500_000, previous: 0 });

    // Xếp giảm dần theo mức chi tháng này.
    expect(data.byCategory[0].current).toBeGreaterThanOrEqual(data.byCategory[1].current);
  });
});

describe('chuỗi chi tiêu theo ngày', () => {
  it('gom đúng ngày vào đúng tháng', async () => {
    const points = buildDailySeries(
      [
        { occurred_on: '2026-08-01', total: 100 },
        { occurred_on: '2026-08-15', total: 200 },
        { occurred_on: '2026-07-15', total: 900 },
      ],
      '2026-08',
      '2026-07',
    );
    expect(points[0]).toEqual({ day: 1, current: 100, previous: 0 });
    expect(points[14]).toEqual({ day: 15, current: 200, previous: 900 });
    expect(points).toHaveLength(31);
  });

  it('dùng độ dài của tháng dài hơn để ngày 31 không bị cắt', async () => {
    // Tháng 2/2026 có 28 ngày, tháng 1 có 31 — chuỗi phải giữ đủ 31 điểm.
    const points = buildDailySeries([{ occurred_on: '2026-01-31', total: 50 }], '2026-02', '2026-01');
    expect(points).toHaveLength(31);
    expect(points[30]).toEqual({ day: 31, current: 0, previous: 50 });
  });

  it('chỉ tính khoản chi, không tính khoản thu', async () => {
    const s = await registerOwner('a@example.com', 'Nhà A');
    await addTransaction(s, { occurredOn: '2026-08-10', amount: 1_000_000, direction: 'income' });
    await addTransaction(s, { occurredOn: '2026-08-10', amount: 400_000, direction: 'expense' });

    const data = await summary(s, '2026-08');
    expect(data.dailyExpense[9]).toEqual({ day: 10, current: 400_000, previous: 0 });
  });
});

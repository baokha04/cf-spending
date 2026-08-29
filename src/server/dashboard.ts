/**
 * Dựng payload dashboard: tháng hiện tại và tháng trước trong một lần đọc.
 *
 * Chỉ hai truy vấn gộp phủ cả hai tháng (một cho tổng hợp, một cho chuỗi ngày),
 * phần pivot làm ở đây thay vì bắt SQLite làm pivot.
 */
import type {
  CategoryBreakdownRow,
  DailyPoint,
  DashboardSummary,
  MonthTotals,
} from '../shared/types';
import type { Env } from './env';
import { aggregateRange, dailyExpenses, recentTransactions, findHouseholdById } from './db/queries';
import { daysInMonth, monthEndExclusive, monthStart, previousMonth, splitMonth } from './dates';

const UNCATEGORIZED = 'Chưa phân loại';

function emptyTotals(): MonthTotals {
  return {
    income: 0,
    expense: 0,
    net: 0,
    monthlyExpense: 0,
    oneOffExpense: 0,
    monthlyIncome: 0,
    oneOffIncome: 0,
    count: 0,
  };
}

export async function buildDashboardSummary(
  env: Env,
  householdId: string,
  month: string,
  recentLimit = 10,
): Promise<DashboardSummary> {
  const prev = previousMonth(month);
  // Khoảng phủ cả hai tháng: [01 tháng trước, 01 tháng sau tháng hiện tại)
  const from = monthStart(prev);
  const to = monthEndExclusive(month);

  const [rows, daily, recent, household] = await Promise.all([
    aggregateRange(env.DB, householdId, from, to),
    dailyExpenses(env.DB, householdId, from, to),
    recentTransactions(env.DB, householdId, recentLimit),
    findHouseholdById(env.DB, householdId),
  ]);

  const totals = { current: emptyTotals(), previous: emptyTotals() };
  const categoryMap = new Map<string, CategoryBreakdownRow>();

  for (const row of rows) {
    const bucket = row.month === month ? totals.current : row.month === prev ? totals.previous : null;
    if (!bucket) continue;

    bucket.count += row.n;
    if (row.direction === 'income') {
      bucket.income += row.total;
      if (row.recurrence === 'monthly') bucket.monthlyIncome += row.total;
      else bucket.oneOffIncome += row.total;
    } else {
      bucket.expense += row.total;
      if (row.recurrence === 'monthly') bucket.monthlyExpense += row.total;
      else bucket.oneOffExpense += row.total;
    }

    const key = `${row.direction}:${row.category_id ?? ''}`;
    let entry = categoryMap.get(key);
    if (!entry) {
      entry = {
        categoryId: row.category_id,
        name: row.category_name ?? UNCATEGORIZED,
        kind: row.direction,
        current: 0,
        previous: 0,
        delta: 0,
      };
      categoryMap.set(key, entry);
    }
    if (row.month === month) entry.current += row.total;
    else entry.previous += row.total;
  }

  totals.current.net = totals.current.income - totals.current.expense;
  totals.previous.net = totals.previous.income - totals.previous.expense;

  const byCategory = [...categoryMap.values()]
    .map((c) => ({ ...c, delta: c.current - c.previous }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous);

  return {
    months: { current: month, previous: prev },
    currency: household?.currency ?? 'VND',
    totals,
    byCategory,
    dailyExpense: buildDailySeries(daily, month, prev),
    recent,
  };
}

/**
 * Chuỗi chi tiêu theo ngày, hai tháng xếp chồng theo số thứ tự ngày.
 * Độ dài lấy theo tháng dài hơn để tháng 31 ngày không bị cắt cụt.
 */
export function buildDailySeries(
  rows: Array<{ occurred_on: string; total: number }>,
  month: string,
  prev: string,
): DailyPoint[] {
  const cur = splitMonth(month);
  const pre = splitMonth(prev);
  const length = Math.max(daysInMonth(cur.year, cur.month), daysInMonth(pre.year, pre.month));

  const points: DailyPoint[] = Array.from({ length }, (_, i) => ({
    day: i + 1,
    current: 0,
    previous: 0,
  }));

  for (const row of rows) {
    const bucketMonth = row.occurred_on.slice(0, 7);
    const day = Number(row.occurred_on.slice(8, 10));
    const point = points[day - 1];
    if (!point) continue;
    if (bucketMonth === month) point.current += row.total;
    else if (bucketMonth === prev) point.previous += row.total;
  }
  return points;
}

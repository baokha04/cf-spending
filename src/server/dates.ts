/**
 * Toán tháng trên chuỗi, không đi qua Date với múi giờ local.
 * Workers chạy UTC còn người dùng ở UTC+7, nên `new Date()` sẽ lệch ngày ở
 * hai đầu tháng. Mọi thứ ở đây thao tác trực tiếp trên 'YYYY-MM' / 'YYYY-MM-DD'.
 */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

/** Kiểm tra ngày có thật (bắt được 2025-02-30). */
export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  return daysInMonth(y, m) >= d;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function splitMonth(month: string): { year: number; month: number } {
  const [year, m] = month.split('-').map(Number);
  return { year, month: m };
}

export function formatMonth(year: number, month1to12: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1to12).padStart(2, '0')}`;
}

export function previousMonth(month: string): string {
  const { year, month: m } = splitMonth(month);
  return m === 1 ? formatMonth(year - 1, 12) : formatMonth(year, m - 1);
}

export function nextMonth(month: string): string {
  const { year, month: m } = splitMonth(month);
  return m === 12 ? formatMonth(year + 1, 1) : formatMonth(year, m + 1);
}

/** Ngày đầu tiên của tháng, dùng làm cận dưới (bao gồm) khi so sánh chuỗi. */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** Ngày đầu tháng kế tiếp, dùng làm cận trên (loại trừ). */
export function monthEndExclusive(month: string): string {
  return `${nextMonth(month)}-01`;
}

/** Tháng chứa một ngày: '2026-08-14' → '2026-08'. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Tháng hiện tại theo giờ Việt Nam (UTC+7), vì Workers chạy UTC. */
export function currentMonthInVietnam(now: number = Date.now()): string {
  const shifted = new Date(now + 7 * 60 * 60 * 1000);
  return formatMonth(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayInVietnam(now: number = Date.now()): string {
  const shifted = new Date(now + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

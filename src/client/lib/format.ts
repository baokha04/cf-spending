const vnd = new Intl.NumberFormat('vi-VN');

/** '1.500.000 đ' — VND không có đơn vị lẻ nên luôn hiển thị số nguyên. */
export function money(n: number): string {
  return `${vnd.format(Math.round(n))} đ`;
}

/** Rút gọn cho nhãn trục: 1,5 tr / 850 ng. */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} tr`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)} ng`;
  return String(n);
}

/**
 * Gọn hơn moneyShort cho trục dọc hẹp trên điện thoại: '60tr', '1,5tr', '850ng'.
 * Cột nhãn chỉ còn 44pt; để nguyên khoảng trắng thì Recharts ngắt xuống hai
 * dòng và dòng trên bị cắt mất khỏi khung biểu đồ.
 */
export function moneyAxisTight(n: number): string {
  return moneyShort(n).replace(/,0(?= )/, '').replace(' ', '');
}

export function signedMoney(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;
}

/**
 * Phần trăm thay đổi. Trả về null khi tháng trước bằng 0 — không có mốc so sánh
 * thì hiển thị '—' chứ không phải một con số vô nghĩa.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatPercent(p: number): string {
  const rounded = Math.abs(p) >= 100 ? Math.round(p) : Math.round(p * 10) / 10;
  return `${Math.abs(rounded).toString().replace('.', ',')}%`;
}

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

/** '2026-08' → 'Tháng 8/2026' */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}/${year}`;
}

/** '2026-08-14' → '14/08' */
export function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** '2026-08-14' → '14/08/2026' */
export function fullDateLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function todayISO(): string {
  // Giờ Việt Nam (UTC+7) để nút "hôm nay" không lệch ngày vào buổi tối.
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Mốc epoch ms → '14/08/2026 21:05' theo giờ Việt Nam. */
export function dateTimeLabel(ms: number): string {
  return dateTimeFormat.format(new Date(ms));
}

export const PAYMENT_METHOD_LABEL = {
  cash: 'Tiền mặt',
  bank: 'Chuyển khoản',
  card: 'Thẻ',
  ewallet: 'Ví điện tử',
  other: 'Khác',
} as const;

/** Thứ tự hiển thị trong ô chọn hình thức thanh toán. */
export const PAYMENT_METHODS = ['cash', 'bank', 'card', 'ewallet', 'other'] as const;

/** Tỷ trọng của một phần trên tổng; trả '—' khi chưa có tổng để so. */
export function shareLabel(part: number, total: number): string {
  if (total <= 0) return '—';
  return formatPercent((part / total) * 100);
}

export const DIRECTION_LABEL = { income: 'Thu', expense: 'Chi' } as const;
export const RECURRENCE_LABEL = { monthly: 'Hàng tháng', one_off: 'Phát sinh' } as const;

/* ----------------------------------------------------- lịch hoạt động */

const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAY_LONG = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ nhật',
];

/** ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. */
export function weekdayLabel(weekday: number): string {
  return WEEKDAY_SHORT[weekday - 1] ?? '';
}

export function weekdayLongLabel(weekday: number): string {
  return WEEKDAY_LONG[weekday - 1] ?? '';
}

/** Thứ của một ngày cụ thể. UTC để không lệch múi giờ như phần còn lại của app. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDaysISO(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Thứ 2 của tuần chứa ngày này. */
export function startOfWeekISO(date: string): string {
  return addDaysISO(date, 1 - weekdayOf(date));
}

/** '31/08 – 06/09/2026'; kèm cả năm ở đầu khi tuần vắt qua hai năm. */
export function weekRangeLabel(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? dayLabel(from) : fullDateLabel(from)} – ${fullDateLabel(to)}`;
}

/** '18:00 – 20:00', ca qua đêm thêm dấu +1 cho khỏi nhầm. */
export function timeRangeLabel(startTime: string, endTime: string, overnight: boolean): string {
  return `${startTime} – ${endTime}${overnight ? ' (+1)' : ''}`;
}

export const ACTIVITY_KIND_LABEL = {
  work: 'Đi làm',
  teach: 'Đi dạy',
  study: 'Đi học',
  other: 'Khác',
} as const;

/** Thứ tự hiển thị trong ô chọn loại hoạt động. */
export const ACTIVITY_KIND_ORDER = ['work', 'teach', 'study', 'other'] as const;

export const FAMILY_RELATION_LABEL = {
  bo: 'Bố',
  me: 'Mẹ',
  con: 'Con',
  ong: 'Ông',
  ba: 'Bà',
  khac: 'Khác',
} as const;

export const FAMILY_RELATION_ORDER = ['bo', 'me', 'con', 'ong', 'ba', 'khac'] as const;

/** Tám khoá màu thành viên; giá trị thật nằm trong styles.css cho từng nền sáng/tối. */
export const MEMBER_COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const;

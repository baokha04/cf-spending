/**
 * Ngày hết hạn của khoản thu/chi và luật nhắc gia hạn.
 *
 * Dùng chung giữa Pages Functions và React client để hai bên không bao giờ tính
 * "còn mấy ngày" theo hai cách lệch nhau. Mọi ngày ở đây là chuỗi 'YYYY-MM-DD'
 * theo giờ Việt Nam, nên so sánh chuỗi cũng chính là so sánh ngày.
 */

/** Cửa sổ nhắc mặc định: hết hạn trong vòng một tuần là phải nhắc gia hạn. */
export const EXPIRY_WINDOW_DAYS = 7;

/** Chặn trên cho tham số ?days= — nhắc xa hơn một quý thì không còn là "sắp hết hạn". */
export const MAX_EXPIRY_WINDOW_DAYS = 90;

/** Các mốc gia hạn dựng sẵn, tính bằng tháng. */
export const RENEW_MONTH_OPTIONS = [1, 3, 6, 12] as const;

export type ExpiryStatus = 'overdue' | 'today' | 'soon' | 'later';

/**
 * Số ngày từ `today` tới `target`; âm nghĩa là đã qua.
 * Đi qua Date.parse ở UTC chứ không phải Date local: Workers chạy UTC còn người
 * dùng ở UTC+7, và cả hai múi giờ đều không có DST nên phép trừ là chính xác.
 */
export function daysUntil(today: string, target: string): number {
  const ms = Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Phân loại một hạn theo số ngày còn lại. */
export function expiryStatus(daysLeft: number, windowDays = EXPIRY_WINDOW_DAYS): ExpiryStatus {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  return daysLeft <= windowDays ? 'soon' : 'later';
}

/** Có cần nhắc gia hạn không: đã quá hạn, hoặc hết hạn trong cửa sổ nhắc. */
export function needsRenewal(daysLeft: number, windowDays = EXPIRY_WINDOW_DAYS): boolean {
  return expiryStatus(daysLeft, windowDays) !== 'later';
}

/**
 * Cộng tháng vào một ngày, kẹp lại khi tháng đích ngắn hơn: 31/01 + 1 tháng ra
 * 28/02 (29/02 năm nhuận) chứ không tràn sang 03/03 như `Date` tự cộng. Gia hạn
 * "thêm một tháng" phải rơi đúng vào tháng kế tiếp, không phải tháng sau nữa.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  const day = Math.min(d, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Mốc để tính hạn mới khi gia hạn.
 *
 * Gia hạn nối tiếp từ hạn cũ, nếu không mỗi lần trễ vài ngày là chu kỳ trôi dần.
 * Nhưng khi hạn cũ đã lùi vào quá khứ thì nối tiếp từ đó có thể ra một hạn mới
 * vẫn còn quá hạn — lúc ấy tính từ hôm nay.
 */
export function renewBaseDate(expiresOn: string, today: string): string {
  return expiresOn >= today ? expiresOn : today;
}

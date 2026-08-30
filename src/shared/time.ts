/**
 * Giờ trong ngày, dùng chung giữa Pages Functions và React client.
 *
 * Lưu trữ dùng "số phút từ 0h" + "độ dài phút"; ngoài API và trên giao diện thì
 * dùng chuỗi 'HH:MM' cho khớp <input type="time">. Hai chiều đổi nằm cả ở đây để
 * không nơi nào tự chế lại.
 */

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MINUTES_PER_DAY = 1440;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** '18:30' → 1110. Gọi sau khi đã qua isValidTime. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 1110 → '18:30'. Chia dư 1440 nên phút vượt nửa đêm ra đúng giờ hôm sau. */
export function toTimeLabel(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Độ dài một buổi từ cặp giờ người dùng nhập.
 *
 * Quy ước duy nhất phải nhớ: **kết thúc sớm hơn bắt đầu nghĩa là ca qua đêm**.
 * Bằng nhau là buổi dài 0 phút — trả null để nơi gọi báo lỗi.
 */
export function durationBetween(startMinute: number, endMinute: number): number | null {
  if (startMinute === endMinute) return null;
  return endMinute > startMinute
    ? endMinute - startMinute
    : MINUTES_PER_DAY - startMinute + endMinute;
}

/** Buổi kết thúc sang ngày hôm sau. */
export function isOvernight(startMinute: number, durationMin: number): boolean {
  return startMinute + durationMin > MINUTES_PER_DAY;
}

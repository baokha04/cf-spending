/**
 * Trải khuôn mẫu lặp hàng tuần thành các buổi cụ thể trong một khoảng ngày.
 *
 * Hàm thuần: không chạm D1, không gọi Date.now(). Mọi ngày là giờ Việt Nam
 * (UTC+7); Việt Nam không có DST nên cộng ngày trên chuỗi là chính xác tuyệt đối.
 */
import type { Occurrence } from '../shared/types';
import { isOvernight, toTimeLabel } from '../shared/time';
import { addDays, isoWeekday } from './dates';
import { parseDaysOfWeek } from './db/queries';
import type { ActivityRow, ExceptionRow } from './db/queries';

/** Ngày mà buổi này kết thúc — khác `date` khi ca chạy qua nửa đêm. */
function endDate(date: string, startMinute: number, durationMin: number): string {
  return isOvernight(startMinute, durationMin) ? addDays(date, 1) : date;
}

function buildOccurrence(
  activity: ActivityRow,
  sourceDate: string,
  exception: ExceptionRow | undefined,
): Occurrence {
  const date = exception?.new_date ?? sourceDate;
  const startMinute = exception?.new_start_minute ?? activity.start_minute;
  const durationMin = exception?.new_duration_min ?? activity.duration_min;
  return {
    activityId: activity.id,
    memberId: activity.member_id,
    title: activity.title,
    kind: activity.kind,
    location: activity.location,
    date,
    startTime: toTimeLabel(startMinute),
    endTime: toTimeLabel(startMinute + durationMin),
    startMinute,
    durationMin,
    overnight: isOvernight(startMinute, durationMin),
    sourceDate,
    moved: exception !== undefined,
  };
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

/**
 * @param fromInclusive ngày đầu khoảng, 'YYYY-MM-DD'
 * @param toExclusive   ngày ngay sau khoảng
 */
export function expandOccurrences(
  activities: ActivityRow[],
  exceptions: ExceptionRow[],
  fromInclusive: string,
  toExclusive: string,
): Occurrence[] {
  const byActivity = new Map<string, Map<string, ExceptionRow>>();
  for (const ex of exceptions) {
    let forActivity = byActivity.get(ex.activity_id);
    if (!forActivity) {
      forActivity = new Map();
      byActivity.set(ex.activity_id, forActivity);
    }
    forActivity.set(ex.occurs_on, ex);
  }

  const out: Occurrence[] = [];
  /** Ngoại lệ đã được vòng quét chính xử lý, để vòng "dời vào" không dựng trùng. */
  const consumed = new Set<string>();

  for (const activity of activities) {
    const days = new Set<number>(parseDaysOfWeek(activity.days_of_week));
    if (days.size === 0) continue;
    const forActivity = byActivity.get(activity.id);

    // Lùi cận dưới một ngày để bắt ca đêm bắt đầu từ hôm trước tràn vào khoảng.
    const lo = maxDate(addDays(fromInclusive, -1), activity.effective_from);
    const hi = activity.effective_to
      ? minDate(toExclusive, addDays(activity.effective_to, 1))
      : toExclusive;

    for (let d = lo; d < hi; d = addDays(d, 1)) {
      if (!days.has(isoWeekday(d))) continue;
      const exception = forActivity?.get(d);
      if (exception) consumed.add(`${activity.id} ${d}`);
      if (exception?.status === 'cancelled') continue;
      out.push(buildOccurrence(activity, d, exception));
    }
  }

  // Buổi bị dời TỪ ngoài khoảng VÀO trong khoảng: vòng trên quét theo ngày gốc
  // nên không chạm tới nó.
  const byId = new Map(activities.map((a) => [a.id, a]));
  for (const ex of exceptions) {
    if (ex.status !== 'moved' || !ex.new_date) continue;
    if (consumed.has(`${ex.activity_id} ${ex.occurs_on}`)) continue;
    const activity = byId.get(ex.activity_id);
    if (!activity) continue;
    // Ngoại lệ chỉ có nghĩa nếu ngày gốc thật sự có buổi theo khuôn mẫu.
    const days = new Set<number>(parseDaysOfWeek(activity.days_of_week));
    if (!days.has(isoWeekday(ex.occurs_on))) continue;
    if (ex.occurs_on < activity.effective_from) continue;
    if (activity.effective_to && ex.occurs_on > activity.effective_to) continue;
    out.push(buildOccurrence(activity, ex.occurs_on, ex));
  }

  return out
    .filter(
      (o) =>
        o.date < toExclusive &&
        endDate(o.date, o.startMinute, o.durationMin) >= fromInclusive,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startMinute - b.startMinute ||
        a.title.localeCompare(b.title, 'vi'),
    );
}

import { useEffect, useMemo, useRef } from 'react';
import type { FamilyMember, Occurrence } from '../../shared/types';
import { addDaysISO, timeRangeLabel, weekdayLabel, weekdayLongLabel } from '../lib/format';
import { hourWindow, layoutOverlaps, memberColorVar, splitOvernight } from '../lib/schedule';
import type { PlacedSegment } from '../lib/schedule';
import { toTimeLabel } from '../../shared/time';

interface Props {
  /** Thứ 2 của tuần đang xem. */
  weekStart: string;
  occurrences: Occurrence[];
  membersById: Map<string, FamilyMember>;
  today: string;
  onPick: (occurrence: Occurrence) => void;
  /**
   * Bỏ tên người khỏi mặt khối — chỉ dùng khi cả lưới là của đúng một người
   * (màn hình lịch riêng), lúc đó tên đã nằm ở tiêu đề trang nên in lại vào khối
   * là thừa mà còn ăn mất một dòng. Lịch cả nhà thì luôn phải có tên: màu không
   * bao giờ là tín hiệu duy nhất.
   */
  hideMember?: boolean;
}

/**
 * Lưới tuần trục giờ: cột là ngày, trục dọc là giờ.
 *
 * Đường kẻ giờ vẽ bằng gradient trên nền cột chứ không dựng 24 hàng DOM. Mỗi
 * buổi là một khối định vị tuyệt đối theo tỷ lệ phần trăm của cửa sổ giờ, nên
 * lưới co giãn theo chiều cao mà không phải tính lại gì.
 */
export function WeekGrid({
  weekStart,
  occurrences,
  membersById,
  today,
  onPick,
  hideMember = false,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)),
    [weekStart],
  );

  // Ca qua đêm được bẻ đôi ở đây: đuôi rơi sang cột hôm sau, nhưng vẫn là một buổi.
  const segments = useMemo(() => occurrences.flatMap(splitOvernight), [occurrences]);

  const window = useMemo(
    () => hourWindow(segments.filter((s) => days.includes(s.date))),
    [segments, days],
  );
  const span = window.endMinute - window.startMinute;

  const byDay = useMemo(() => {
    const map = new Map<string, PlacedSegment[]>();
    for (const day of days) {
      map.set(
        day,
        layoutOverlaps(segments.filter((s) => s.date === day)),
      );
    }
    return map;
  }, [segments, days]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = window.startMinute; m <= window.endMinute; m += 60) marks.push(m);
    return marks;
  }, [window]);

  /**
   * Một ca đêm duy nhất cũng kéo cửa sổ giờ mở tới 00:00, đẩy các buổi ban ngày
   * xuống tận đáy. Cửa sổ vẫn phải đủ rộng để không cắt mất cái đuôi, nên thay
   * vì thu hẹp nó thì cuộn thẳng tới buổi sớm nhất trong ngày.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const firstHeadStart = useMemo(() => {
    const heads = segments.filter((s) => !s.isTail && days.includes(s.date));
    return heads.length > 0 ? Math.min(...heads.map((s) => s.startMinute)) : null;
  }, [segments, days]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || firstHeadStart === null) return;
    const body = el.scrollHeight - el.clientHeight;
    if (body <= 0) return;
    // Chừa nửa tiếng phía trên để buổi đầu tiên không dính sát mép.
    const offset = (firstHeadStart - 30 - window.startMinute) / span;
    el.scrollTop = Math.max(0, Math.min(body, offset * el.scrollHeight));
  }, [firstHeadStart, window.startMinute, span, weekStart]);

  return (
    <div className="week-scroll" ref={scroller}>
      <div className="week-grid" style={{ ['--hour-count' as string]: hourMarks.length - 1 }}>
        <div className="week-corner" aria-hidden="true" />
        {/* weekStart luôn là Thứ 2 nên chỉ số i chính là thứ ISO trừ 1. */}
        {days.map((day, i) => (
          <div key={day} className={`week-head${day === today ? ' today' : ''}`}>
            <span className="week-dow">{weekdayLabel(i + 1)}</span>
            <span className="week-date">
              {day.slice(8, 10)}/{day.slice(5, 7)}
            </span>
          </div>
        ))}

        <div className="week-gutter">
          {hourMarks.slice(0, -1).map((minute) => (
            <div className="week-hour" key={minute}>
              <span>{toTimeLabel(minute)}</span>
            </div>
          ))}
        </div>

        {days.map((day, i) => (
          <div
            key={day}
            className={`week-col${day === today ? ' today' : ''}`}
            role="list"
            aria-label={`${weekdayLongLabel(i + 1)} ${day.slice(8, 10)}/${day.slice(5, 7)}`}
          >
            {(byDay.get(day) ?? []).map((placed) => {
              const { occurrence: occ } = placed;
              const member = membersById.get(occ.memberId);
              const top = ((placed.startMinute - window.startMinute) / span) * 100;
              const height = ((placed.endMinute - placed.startMinute) / span) * 100;
              const width = 100 / placed.columns;
              const label = [
                member?.nickname || member?.name,
                occ.title,
                timeRangeLabel(occ.startTime, occ.endTime, occ.overnight),
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <button
                  type="button"
                  role="listitem"
                  key={`${occ.activityId}-${occ.sourceDate}-${placed.isTail ? 'tail' : 'head'}`}
                  className={`occ${placed.isTail ? ' tail' : ''}${occ.moved ? ' moved' : ''}`}
                  style={{
                    top: `${top}%`,
                    height: `${Math.max(height, 3)}%`,
                    left: `${placed.column * width}%`,
                    width: `${width}%`,
                    background: member ? memberColorVar(member.color, 'soft') : 'var(--surface-2)',
                    borderLeftColor: member ? memberColorVar(member.color) : 'var(--axis)',
                  }}
                  aria-label={label}
                  title={label}
                  onClick={() => onPick(occ)}
                >
                  {/* Trên lịch cả nhà, tên người luôn có mặt: màu không bao giờ
                      là tín hiệu duy nhất. aria-label thì giữ tên ở cả hai chế độ. */}
                  {!hideMember && (
                    <span className="occ-who">
                      {member?.icon ? `${member.icon} ` : ''}
                      {member?.nickname || member?.name || '—'}
                    </span>
                  )}
                  <span className={hideMember ? 'occ-who' : 'occ-title'}>{occ.title}</span>
                  <span className="occ-time">
                    {placed.isTail ? `→ ${occ.endTime}` : toTimeLabel(placed.startMinute)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import type { FamilyMember, Occurrence } from '../../shared/types';
import { addDaysISO, weekdayLabel } from '../lib/format';
import { memberColorVar } from '../lib/schedule';

interface Props {
  /** Tháng đang xem, 'YYYY-MM'. */
  month: string;
  /** Thứ 2 của ô đầu tiên trên lưới — có thể lấn sang tháng trước. */
  gridStart: string;
  occurrences: Occurrence[];
  membersById: Map<string, FamilyMember>;
  today: string;
  /** Bấm vào một ngày để nhảy sang lưới tuần chứa ngày đó. */
  onPickDay: (date: string) => void;
}

/** Số chip hiện trong một ô trước khi gom phần còn lại thành "+n". */
const MAX_CHIPS = 3;

/** Lưới tháng 6×7: nhìn tổng thể cả tháng, chi tiết theo giờ thì sang tab Tuần. */
export function MonthGrid({
  month,
  gridStart,
  occurrences,
  membersById,
  today,
  onPickDay,
}: Props) {
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDaysISO(gridStart, i)),
    [gridStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const occ of occurrences) {
      const list = map.get(occ.date);
      if (list) list.push(occ);
      else map.set(occ.date, [occ]);
    }
    return map;
  }, [occurrences]);

  return (
    <div className="month-grid" role="grid" aria-label={`Lịch tháng ${month}`}>
      {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
        <div className="month-dow" key={weekday} role="columnheader">
          {weekdayLabel(weekday)}
        </div>
      ))}
      {cells.map((date) => {
        const items = byDay.get(date) ?? [];
        const outside = date.slice(0, 7) !== month;
        return (
          <button
            type="button"
            role="gridcell"
            key={date}
            className={`month-cell${outside ? ' outside' : ''}${date === today ? ' today' : ''}`}
            aria-label={`${date} — ${items.length} buổi`}
            onClick={() => onPickDay(date)}
          >
            <span className="month-day">{Number(date.slice(8, 10))}</span>
            <span className="month-chips">
              {items.slice(0, MAX_CHIPS).map((occ) => {
                const member = membersById.get(occ.memberId);
                return (
                  <span
                    className="month-chip"
                    key={`${occ.activityId}-${occ.sourceDate}`}
                    style={{
                      background: member ? memberColorVar(member.color, 'soft') : 'var(--surface-2)',
                      borderLeftColor: member ? memberColorVar(member.color) : 'var(--axis)',
                    }}
                  >
                    <span className="month-chip-time">{occ.startTime}</span>
                    {member?.icon ? `${member.icon} ` : ''}
                    {occ.title}
                  </span>
                );
              })}
              {items.length > MAX_CHIPS && (
                <span className="month-more">+{items.length - MAX_CHIPS} buổi nữa</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

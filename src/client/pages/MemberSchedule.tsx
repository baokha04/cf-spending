import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Activity, FamilyMember, Occurrence, ScheduleResponse } from '../../shared/types';
import { api } from '../lib/api';
import type { ActivityInput } from '../lib/api';
import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_KIND_ORDER,
  FAMILY_RELATION_LABEL,
  addDaysISO,
  fullDateLabel,
  startOfWeekISO,
  todayISO,
  weekNumberLabel,
  weekRangeLabel,
} from '../lib/format';
import { memberColorVar } from '../lib/schedule';
import { WeekGrid } from '../components/WeekGrid';
import { ActivityList } from '../components/ActivityList';
import { OccurrenceSheet } from '../components/OccurrenceSheet';

/** '9 giờ 30' — tổng thời lượng đọc theo lối nói thường ngày. */
function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m}`;
}

/**
 * Lịch riêng của một người: tuần của họ, thống kê tuần đó, và toàn bộ hoạt động
 * đang khai cho họ — gom một chỗ để sửa lịch của một người mà không phải lọc
 * giữa cả nhà.
 */
export function MemberSchedule() {
  const { memberId = '' } = useParams();
  const navigate = useNavigate();
  const today = todayISO();

  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(today));

  // Như trang lịch cả nhà: nút mang số tuần, và nút "về tuần này" giấu đi khi nó
  // trùng đúng nút lùi hoặc nút tiến.
  const thisWeek = startOfWeekISO(today);
  const prevWeek = addDaysISO(weekStart, -7);
  const nextWeek = addDaysISO(weekStart, 7);
  const showTodayWeek = thisWeek !== prevWeek && thisWeek !== nextWeek;
  /**
   * Dữ liệu đi kèm id của người nó thuộc về. Đổi người xong mà chưa tải xong thì
   * `loaded.memberId` còn là người cũ — không có mốc này, thống kê và lưới của
   * người trước sẽ hiện dưới tên người mới trong một nhịp.
   */
  const [loaded, setLoaded] = useState<{
    memberId: string;
    schedule: ScheduleResponse;
    activities: Activity[];
  } | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [picked, setPicked] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [copying, setCopying] = useState<Activity | null>(null);
  const [adding, setAdding] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const range = useMemo(
    () => ({ from: weekStart, to: addDaysISO(weekStart, 6) }),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedule, list, all] = await Promise.all([
        api.schedule({ ...range, memberId }),
        api.activities({ memberId }),
        api.familyMembers(),
      ]);
      setLoaded({ memberId, schedule, activities: list.activities });
      setMembers(all.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch của người này');
    } finally {
      setLoading(false);
    }
  }, [range, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const member = members.find((m) => m.id === memberId);
  // Dữ liệu của người khác thì coi như chưa có, đừng vẽ nhầm.
  const fresh = loaded?.memberId === memberId ? loaded : null;
  const occurrences = fresh?.schedule.occurrences ?? [];
  const activities = fresh?.activities ?? [];
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  /** Thống kê của đúng tuần đang xem — con số hữu ích nhất khi soi một người. */
  const stats = useMemo(() => {
    const totalMin = occurrences.reduce((sum, o) => sum + o.durationMin, 0);
    const byKind = new Map<string, number>();
    for (const o of occurrences) {
      byKind.set(o.kind, (byKind.get(o.kind) ?? 0) + o.durationMin);
    }
    const busiest = new Map<string, number>();
    for (const o of occurrences) busiest.set(o.date, (busiest.get(o.date) ?? 0) + o.durationMin);
    let peakDay: string | null = null;
    for (const [date, min] of busiest) {
      if (peakDay === null || min > (busiest.get(peakDay) ?? 0)) peakDay = date;
    }
    return { count: occurrences.length, totalMin, byKind, peakDay, peakMin: peakDay ? busiest.get(peakDay)! : 0 };
  }, [occurrences]);

  async function guard(work: () => Promise<void>, fallback: string) {
    setError(null);
    setNotice(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  async function saveActivity(body: ActivityInput) {
    await guard(async () => {
      if (editing) await api.updateActivity(editing.id, body);
      else await api.createActivity(body);
      setEditing(null);
      setAdding(false);
      if (copying) setNotice(`Đã tạo bản sao từ "${copying.title}".`);
      setCopying(null);
    }, 'Không lưu được hoạt động');
  }

  async function removeActivity(activity: Activity) {
    if (!confirm(`Xoá hoạt động "${activity.title}"? Vẫn khôi phục lại được.`)) return;
    await guard(async () => {
      await api.deleteActivity(activity.id);
      setNotice(`Đã xoá "${activity.title}".`);
    }, 'Không xoá được hoạt động');
  }

  async function cancelSession(occurrence: Occurrence, note: string) {
    await guard(async () => {
      if (occurrence.moved) await api.removeException(occurrence.activityId, occurrence.sourceDate);
      await api.addException(occurrence.activityId, {
        occursOn: occurrence.sourceDate,
        status: 'cancelled',
        note,
      });
      setPicked(null);
      setNotice(`Đã cho nghỉ buổi ${fullDateLabel(occurrence.date)}.`);
    }, 'Không cho nghỉ buổi này được');
  }

  async function moveSession(
    occurrence: Occurrence,
    patch: { newDate?: string; newStartTime?: string; newEndTime?: string },
  ) {
    await guard(async () => {
      if (occurrence.moved) await api.removeException(occurrence.activityId, occurrence.sourceDate);
      await api.addException(occurrence.activityId, {
        occursOn: occurrence.sourceDate,
        status: 'moved',
        ...patch,
      });
      setPicked(null);
      setNotice('Đã dời buổi.');
    }, 'Không dời được buổi này');
  }

  async function resetSession(occurrence: Occurrence) {
    await guard(async () => {
      await api.removeException(occurrence.activityId, occurrence.sourceDate);
      setPicked(null);
      setNotice('Đã trả buổi về lịch gốc.');
    }, 'Không trả về lịch gốc được');
  }

  // Người đã bị xoá mềm không nằm trong danh sách nữa — nói rõ thay vì hiện trang rỗng.
  if (!loading && !member) {
    return (
      <>
        <div className="page-head">
          <h1>Không tìm thấy thành viên</h1>
        </div>
        <div className="card empty">
          Người này không còn trong danh sách — có thể đã bị xoá.{' '}
          <Link to="/ho-gia-dinh">Xem lại danh sách thành viên</Link> hoặc{' '}
          <Link to="/lich">quay về lịch cả nhà</Link>.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {member?.icon ? `${member.icon} ` : ''}
            {member?.name ?? 'Đang tải…'}
          </h1>
          <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {member && `${FAMILY_RELATION_LABEL[member.relation]} · `}
            {weekNumberLabel(weekStart)} · {weekRangeLabel(range.from, range.to)}
          </p>
        </div>
        <Link className="navlink" to="/lich">
          ← Lịch cả nhà
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      {/* Chuyển nhanh sang người khác, khỏi phải quay ra rồi vào lại. */}
      {members.length > 1 && (
        <section className="card">
          <h2 className="card-title">Xem lịch của</h2>
          <p className="card-sub">Chạm vào một người để mở lịch riêng của họ.</p>
          <div className="member-switch" role="tablist" aria-label="Chọn thành viên">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === memberId}
                className={`member-chip${m.id === memberId ? ' on' : ''}`}
                style={{
                  borderColor: m.id === memberId ? memberColorVar(m.color) : undefined,
                  background: m.id === memberId ? memberColorVar(m.color, 'soft') : undefined,
                }}
                onClick={() => navigate(`/lich/${m.id}`)}
              >
                <span
                  className="swatch"
                  style={{ background: memberColorVar(m.color) }}
                  aria-hidden="true"
                />
                {m.icon ? `${m.icon} ` : ''}
                {m.nickname || m.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented">
            <button type="button" onClick={() => setWeekStart(prevWeek)}>
              {weekNumberLabel(prevWeek, weekStart)}
            </button>
            {showTodayWeek && (
              <button
                type="button"
                aria-pressed={weekStart === thisWeek}
                title="Về tuần chứa hôm nay"
                onClick={() => setWeekStart(thisWeek)}
              >
                {weekNumberLabel(today, weekStart)}
              </button>
            )}
            <button type="button" onClick={() => setWeekStart(nextWeek)}>
              {weekNumberLabel(nextWeek, weekStart)}
            </button>
          </div>
        </div>

        <dl className="member-stats">
          <div>
            <dt>Số buổi trong tuần</dt>
            <dd>{fresh ? stats.count : '—'}</dd>
          </div>
          <div>
            <dt>Tổng thời lượng</dt>
            <dd>{fresh ? hoursLabel(stats.totalMin) : '—'}</dd>
          </div>
          <div>
            <dt>Ngày bận nhất</dt>
            <dd>
              {stats.peakDay
                ? `${fullDateLabel(stats.peakDay).slice(0, 5)} · ${hoursLabel(stats.peakMin)}`
                : '—'}
            </dd>
          </div>
          {ACTIVITY_KIND_ORDER.filter((k) => stats.byKind.has(k)).map((k) => (
            <div key={k}>
              <dt>{ACTIVITY_KIND_LABEL[k]}</dt>
              <dd>{hoursLabel(stats.byKind.get(k)!)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        {!fresh ? (
          <p className="empty">Đang tải…</p>
        ) : occurrences.length === 0 ? (
          <p className="empty">
            {member?.nickname || member?.name} không có buổi nào trong tuần này.
          </p>
        ) : (
          <WeekGrid
            weekStart={weekStart}
            occurrences={occurrences}
            membersById={membersById}
            today={today}
            hideMember
            onPick={setPicked}
          />
        )}
      </section>

      {member && fresh && (
        <ActivityList
          activities={activities}
          // Form vẫn cho đổi người, nhưng mặc định là người đang xem.
          members={member ? [member, ...members.filter((m) => m.id !== member.id)] : members}
          membersById={membersById}
          adding={adding}
          editing={editing}
          copying={copying}
          hideMember
          title={`Hoạt động của ${member.nickname || member.name}`}
          subtitle="Khai một lần, lịch tự sinh buổi. Nghỉ hay dời từng buổi thì bấm vào buổi đó trên lưới tuần."
          emptyText={`Chưa khai hoạt động nào cho ${member.nickname || member.name}.`}
          onAdd={() => {
            setAdding(true);
            setEditing(null);
            setCopying(null);
          }}
          onEdit={(a) => {
            setEditing(a);
            setAdding(false);
            setCopying(null);
          }}
          onCopy={(a) => {
            setCopying(a);
            setEditing(null);
            setAdding(false);
          }}
          onCancelForm={() => {
            setAdding(false);
            setEditing(null);
            setCopying(null);
          }}
          onSubmit={saveActivity}
          onRemove={removeActivity}
        />
      )}

      {picked && (
        <OccurrenceSheet
          occurrence={picked}
          member={membersById.get(picked.memberId)}
          onCancelSession={(note) => cancelSession(picked, note)}
          onMoveSession={(patch) => moveSession(picked, patch)}
          onResetSession={() => resetSession(picked)}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
}

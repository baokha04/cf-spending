import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Activity,
  ActivityKind,
  FamilyMember,
  Occurrence,
  ScheduleResponse,
} from '../../shared/types';
import { api } from '../lib/api';
import type { ActivityInput } from '../lib/api';
import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_KIND_ORDER,
  addDaysISO,
  currentMonthISO,
  fullDateLabel,
  monthLabel,
  shiftMonth,
  startOfWeekISO,
  timeRangeLabel,
  todayISO,
  weekRangeLabel,
  weekdayLabel,
} from '../lib/format';
import { memberColorVar } from '../lib/schedule';
import { WeekGrid } from '../components/WeekGrid';
import { MonthGrid } from '../components/MonthGrid';
import { ActivityForm } from '../components/ActivityForm';
import { OccurrenceSheet } from '../components/OccurrenceSheet';

type View = 'week' | 'month' | 'activities';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
  { id: 'activities', label: 'Hoạt động' },
];

/** Ô đầu tiên của lưới tháng: Thứ 2 của tuần chứa ngày mùng 1. */
function monthGridStart(month: string): string {
  return startOfWeekISO(`${month}-01`);
}

export function Schedule() {
  const today = todayISO();
  const [view, setView] = useState<View>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(today));
  const [month, setMonth] = useState(currentMonthISO());
  const [memberId, setMemberId] = useState('');
  const [kind, setKind] = useState<ActivityKind | ''>('');

  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allMembers, setAllMembers] = useState<FamilyMember[]>([]);
  const [picked, setPicked] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [adding, setAdding] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Lưới tháng phủ trọn 6 tuần nên luôn 42 ngày, dưới hạn 62 ngày của API.
  const range = useMemo(() => {
    if (view === 'month') {
      const from = monthGridStart(month);
      return { from, to: addDaysISO(from, 41) };
    }
    return { from: weekStart, to: addDaysISO(weekStart, 6) };
  }, [view, month, weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedule, list, members] = await Promise.all([
        api.schedule({ ...range, memberId: memberId || undefined, kind: kind || undefined }),
        api.activities(),
        api.familyMembers(),
      ]);
      setData(schedule);
      setActivities(list.activities);
      setAllMembers(members.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch');
    } finally {
      setLoading(false);
    }
  }, [range, memberId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const membersById = useMemo(
    () => new Map((data?.members ?? allMembers).map((m) => [m.id, m])),
    [data, allMembers],
  );
  const occurrences = data?.occurrences ?? [];

  /** Thành viên thật sự có buổi trong khoảng này — legend chỉ nêu người đang bận. */
  const legend = useMemo(() => {
    const ids = new Set(occurrences.map((o) => o.memberId));
    return (data?.members ?? []).filter((m) => ids.has(m.id));
  }, [occurrences, data]);

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
      // Buổi đã có ngoại lệ (đang dời) thì phải gỡ cái cũ rồi mới ghi cái mới.
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

  const noMembers = allMembers.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lịch hoạt động</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {view === 'month'
              ? monthLabel(month)
              : view === 'week'
                ? weekRangeLabel(range.from, range.to)
                : `${activities.length} hoạt động đang khai`}
          </p>
        </div>
        <div className="segmented">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      {noMembers && !loading && (
        <div className="alert info">
          Chưa có ai trong danh sách thành viên. Vào trang <strong>Hộ gia đình</strong> thêm người
          nhà trước, rồi quay lại đây khai lịch.
        </div>
      )}

      {view !== 'activities' && (
        <section className="card">
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <div className="segmented">
              {view === 'week' ? (
                <>
                  <button type="button" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>
                    ← Tuần trước
                  </button>
                  <button type="button" onClick={() => setWeekStart(startOfWeekISO(today))}>
                    Tuần này
                  </button>
                  <button type="button" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>
                    Tuần sau →
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}>
                    ← Tháng trước
                  </button>
                  <button type="button" onClick={() => setMonth(currentMonthISO())}>
                    Tháng này
                  </button>
                  <button type="button" onClick={() => setMonth(shiftMonth(month, 1))}>
                    Tháng sau →
                  </button>
                </>
              )}
            </div>
            <div className="field" style={{ width: 190 }}>
              <label htmlFor="sc-member">Thành viên</label>
              <select id="sc-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Tất cả</option>
                {allMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 150 }}>
              <label htmlFor="sc-kind">Loại</label>
              <select
                id="sc-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ActivityKind | '')}
              >
                <option value="">Tất cả</option>
                {ACTIVITY_KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {ACTIVITY_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {legend.length > 0 && (
            <div className="legend schedule-legend">
              {legend.map((m) => (
                <span className="item" key={m.id}>
                  <span
                    className="swatch"
                    style={{ background: memberColorVar(m.color) }}
                    aria-hidden="true"
                  />
                  {m.icon ? `${m.icon} ` : ''}
                  {m.nickname || m.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {loading && !data ? (
        <div className="card empty">Đang tải…</div>
      ) : view === 'week' ? (
        <section className="card">
          {occurrences.length === 0 ? (
            <p className="empty">Tuần này chưa có buổi nào.</p>
          ) : (
            <WeekGrid
              weekStart={weekStart}
              occurrences={occurrences}
              membersById={membersById}
              today={today}
              onPick={setPicked}
            />
          )}
        </section>
      ) : view === 'month' ? (
        <section className="card">
          <MonthGrid
            month={month}
            gridStart={range.from}
            occurrences={occurrences}
            membersById={membersById}
            today={today}
            onPickDay={(date) => {
              setWeekStart(startOfWeekISO(date));
              setView('week');
            }}
          />
        </section>
      ) : (
        <ActivityList
          activities={activities}
          members={allMembers}
          membersById={membersById}
          adding={adding}
          editing={editing}
          onAdd={() => {
            setAdding(true);
            setEditing(null);
          }}
          onEdit={(a) => {
            setEditing(a);
            setAdding(false);
          }}
          onCancelForm={() => {
            setAdding(false);
            setEditing(null);
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

interface ListProps {
  activities: Activity[];
  members: FamilyMember[];
  membersById: Map<string, FamilyMember>;
  adding: boolean;
  editing: Activity | null;
  onAdd: () => void;
  onEdit: (activity: Activity) => void;
  onCancelForm: () => void;
  onSubmit: (body: ActivityInput) => Promise<void>;
  onRemove: (activity: Activity) => Promise<void>;
}

/** Tab "Hoạt động": khai và sửa khuôn mẫu lặp hàng tuần. */
function ActivityList({
  activities,
  members,
  membersById,
  adding,
  editing,
  onAdd,
  onEdit,
  onCancelForm,
  onSubmit,
  onRemove,
}: ListProps) {
  const showForm = adding || editing !== null;
  return (
    <section className="card">
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="card-title">Khuôn mẫu lặp hàng tuần</h2>
          <p className="card-sub" style={{ marginBottom: 0 }}>
            Khai một lần, lịch tự sinh buổi. Nghỉ hay dời từng buổi thì bấm vào buổi đó ở tab Tuần.
          </p>
        </div>
        {!showForm && members.length > 0 && (
          <button type="button" className="primary" onClick={onAdd}>
            Thêm hoạt động
          </button>
        )}
      </div>

      {showForm && (
        <ActivityForm
          key={editing?.id ?? 'new'}
          members={members}
          activity={editing}
          onSubmit={onSubmit}
          onCancel={onCancelForm}
        />
      )}

      {activities.length === 0 ? (
        <p className="empty">Chưa khai hoạt động nào.</p>
      ) : (
        <ul className="activity-list">
          {activities.map((a) => {
            const member = membersById.get(a.memberId);
            return (
              <li className="activity-row" key={a.id}>
                <span
                  className="member-stripe"
                  style={{ background: member ? memberColorVar(member.color) : 'var(--axis)' }}
                  aria-hidden="true"
                />
                <div className="activity-body">
                  <div className="activity-title">
                    {a.title}
                    <span className="pill">{ACTIVITY_KIND_LABEL[a.kind]}</span>
                  </div>
                  <div className="activity-meta">
                    <span>{member?.name ?? '—'}</span>
                    <span className="dot" aria-hidden="true">·</span>
                    <span>{a.daysOfWeek.map(weekdayLabel).join(' ')}</span>
                    <span className="dot" aria-hidden="true">·</span>
                    <span>{timeRangeLabel(a.startTime, a.endTime, a.overnight)}</span>
                    {a.location && (
                      <>
                        <span className="dot" aria-hidden="true">·</span>
                        <span>{a.location}</span>
                      </>
                    )}
                  </div>
                  <div className="activity-meta">
                    <span>
                      Từ {fullDateLabel(a.effectiveFrom)}
                      {a.effectiveTo ? ` đến ${fullDateLabel(a.effectiveTo)}` : ' — chưa có ngày kết thúc'}
                    </span>
                  </div>
                </div>
                <div className="member-actions">
                  <button type="button" className="ghost" onClick={() => onEdit(a)}>
                    Sửa
                  </button>
                  <button type="button" className="ghost danger" onClick={() => void onRemove(a)}>
                    Xoá
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { useState } from 'react';
import type { Activity, ActivityKind, FamilyMember, Weekday } from '../../shared/types';
import type { ActivityInput } from '../lib/api';
import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_KIND_ORDER,
  todayISO,
  weekdayLabel,
  weekdayLongLabel,
} from '../lib/format';

const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

interface Draft {
  memberId: string;
  title: string;
  kind: ActivityKind;
  location: string;
  note: string;
  daysOfWeek: Weekday[];
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
}

function fromActivity(a: Activity, memberId: string, title: string): Draft {
  return {
    memberId,
    title,
    kind: a.kind,
    location: a.location,
    note: a.note,
    daysOfWeek: a.daysOfWeek,
    startTime: a.startTime,
    endTime: a.endTime,
    effectiveFrom: a.effectiveFrom,
    effectiveTo: a.effectiveTo ?? '',
  };
}

function toDraft(
  activity: Activity | null,
  copying: Activity | null,
  defaultMemberId: string,
): Draft {
  // Bản sao giữ nguyên mọi thứ, chỉ gắn thêm '(bản sao)' vào tên để hai dòng
  // trong danh sách không giống hệt nhau. Người nhận mặc định vẫn là người cũ —
  // ô chọn nằm ngay đó nếu muốn chép sang người khác.
  if (copying) return fromActivity(copying, copying.memberId, `${copying.title} (bản sao)`);
  if (!activity) {
    return {
      memberId: defaultMemberId,
      title: '',
      kind: 'work',
      location: '',
      note: '',
      daysOfWeek: [],
      startTime: '08:00',
      endTime: '17:00',
      effectiveFrom: todayISO(),
      effectiveTo: '',
    };
  }
  return fromActivity(activity, activity.memberId, activity.title);
}

interface Props {
  members: FamilyMember[];
  /** null nghĩa là đang khai hoạt động mới. */
  activity: Activity | null;
  /** Điền sẵn theo một hoạt động có sẵn rồi lưu thành hoạt động mới. */
  copying?: Activity | null;
  onSubmit: (body: ActivityInput) => Promise<void>;
  onCancel: () => void;
}

/** Khai một khuôn mẫu lặp hàng tuần: ai, việc gì, những thứ nào, mấy giờ, từ ngày nào. */
export function ActivityForm({ members, activity, copying = null, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(activity, copying, members[0]?.id ?? ''),
  );
  const [saving, setSaving] = useState(false);

  // Kết thúc sớm hơn bắt đầu là ca qua đêm — nói ra để người dùng khỏi tưởng nhập nhầm.
  const overnight = draft.endTime !== '' && draft.endTime <= draft.startTime;
  const sameTime = draft.startTime === draft.endTime;

  function toggleDay(day: Weekday) {
    setDraft((d) => ({
      ...d,
      daysOfWeek: d.daysOfWeek.includes(day)
        ? d.daysOfWeek.filter((x) => x !== day)
        : [...d.daysOfWeek, day].sort((a, b) => a - b),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        memberId: draft.memberId,
        title: draft.title,
        kind: draft.kind,
        location: draft.location,
        note: draft.note,
        daysOfWeek: draft.daysOfWeek,
        startTime: draft.startTime,
        endTime: draft.endTime,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="activity-form">
      <div className="field">
        <label htmlFor="ac-member">Của ai</label>
        <select
          id="ac-member"
          required
          value={draft.memberId}
          onChange={(e) => setDraft({ ...draft, memberId: e.target.value })}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.icon ? `${m.icon} ` : ''}
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="ac-title">Tên hoạt động</label>
        <input
          id="ac-title"
          required
          maxLength={80}
          placeholder="Dạy Toán lớp 9"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="ac-kind">Loại</label>
        <select
          id="ac-kind"
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as ActivityKind })}
        >
          {ACTIVITY_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="ac-location">Ở đâu</label>
        <input
          id="ac-location"
          maxLength={120}
          placeholder="không bắt buộc"
          value={draft.location}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })}
        />
      </div>

      <div className="field field-wide">
        <span className="pseudo-label">Những thứ nào trong tuần</span>
        <div className="dow-toggle" role="group" aria-label="Các thứ trong tuần">
          {ALL_WEEKDAYS.map((day) => {
            const on = draft.daysOfWeek.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={weekdayLongLabel(day)}
                className={on ? 'on' : undefined}
                onClick={() => toggleDay(day)}
              >
                {weekdayLabel(day)}
              </button>
            );
          })}
        </div>
        {draft.daysOfWeek.length === 0 && (
          <p className="field-hint warn">Chọn ít nhất một thứ trong tuần.</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="ac-start">Từ mấy giờ</label>
        <input
          id="ac-start"
          type="time"
          required
          value={draft.startTime}
          onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="ac-end">Đến mấy giờ</label>
        <input
          id="ac-end"
          type="time"
          required
          value={draft.endTime}
          onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
        />
        {sameTime ? (
          <p className="field-hint warn">Giờ kết thúc phải khác giờ bắt đầu.</p>
        ) : overnight ? (
          <p className="field-hint">Ca qua đêm: kết thúc lúc {draft.endTime} hôm sau.</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="ac-from">Áp dụng từ ngày</label>
        <input
          id="ac-from"
          type="date"
          required
          value={draft.effectiveFrom}
          onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="ac-to">Đến hết ngày</label>
        <input
          id="ac-to"
          type="date"
          min={draft.effectiveFrom}
          value={draft.effectiveTo}
          onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })}
        />
        <p className="field-hint">Bỏ trống nghĩa là lặp mãi. Bằng ngày bắt đầu là một buổi lẻ.</p>
      </div>

      <div className="field field-wide">
        <label htmlFor="ac-note">Ghi chú</label>
        <input
          id="ac-note"
          maxLength={500}
          placeholder="không bắt buộc"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </div>

      <div className="activity-form-actions">
        <button
          type="submit"
          className="primary"
          disabled={saving || sameTime || draft.daysOfWeek.length === 0 || !draft.memberId}
        >
          {saving ? 'Đang lưu…' : activity ? 'Lưu' : copying ? 'Lưu bản sao' : 'Thêm hoạt động'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { FamilyMember, Occurrence } from '../../shared/types';
import {
  ACTIVITY_KIND_LABEL,
  FAMILY_RELATION_LABEL,
  fullDateLabel,
  timeRangeLabel,
} from '../lib/format';
import { memberColorVar } from '../lib/schedule';
import { IconButton } from './icons';

interface Props {
  occurrence: Occurrence;
  member: FamilyMember | undefined;
  /** Nghỉ hẳn buổi này. */
  onCancelSession: (note: string) => Promise<void>;
  /** Dời buổi này sang ngày/giờ khác; bỏ trống trường nào là giữ nguyên trường đó. */
  onMoveSession: (patch: { newDate?: string; newStartTime?: string; newEndTime?: string }) => Promise<void>;
  /** Trả buổi về đúng khuôn mẫu (xoá ngoại lệ đang có). */
  onResetSession: () => Promise<void>;
  onClose: () => void;
}

/**
 * Bảng thao tác cho đúng một buổi. Mọi thay đổi ở đây là ngoại lệ của buổi đó,
 * khuôn mẫu gốc không suy suyển.
 */
export function OccurrenceSheet({
  occurrence,
  member,
  onCancelSession,
  onMoveSession,
  onResetSession,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'menu' | 'move'>('menu');
  const [newDate, setNewDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  const sameTime = startTime === endTime;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Buổi ${occurrence.title}`}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span
            className="member-stripe"
            style={{ background: member ? memberColorVar(member.color) : 'var(--axis)' }}
            aria-hidden="true"
          />
          <div>
            <h2 className="card-title">{occurrence.title}</h2>
            <p className="card-sub" style={{ marginBottom: 0 }}>
              {member ? `${member.icon ? `${member.icon} ` : ''}${member.name}` : 'Không rõ người'}
              {member && ` (${FAMILY_RELATION_LABEL[member.relation]})`}
              {' · '}
              {ACTIVITY_KIND_LABEL[occurrence.kind]}
            </p>
          </div>
          <IconButton label="Đóng" icon="close" onClick={onClose} />
        </div>

        <dl className="sheet-facts">
          <div>
            <dt>Ngày</dt>
            <dd>{fullDateLabel(occurrence.date)}</dd>
          </div>
          <div>
            <dt>Giờ</dt>
            <dd>{timeRangeLabel(occurrence.startTime, occurrence.endTime, occurrence.overnight)}</dd>
          </div>
          {occurrence.location && (
            <div>
              <dt>Ở đâu</dt>
              <dd>{occurrence.location}</dd>
            </div>
          )}
          {occurrence.moved && (
            <div>
              <dt>Đã đổi</dt>
              <dd>Buổi gốc ngày {fullDateLabel(occurrence.sourceDate)}</dd>
            </div>
          )}
        </dl>

        {mode === 'menu' ? (
          <div className="sheet-actions">
            {occurrence.moved ? (
              <button type="button" disabled={busy} onClick={() => void run(onResetSession)}>
                Trả về lịch gốc
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => setMode('move')}>
              Dời buổi này
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void run(() => onCancelSession(note))}
            >
              Nghỉ buổi này
            </button>
          </div>
        ) : (
          <form
            className="sheet-move"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => onMoveSession({ newDate, newStartTime: startTime, newEndTime: endTime }));
            }}
          >
            <div className="field">
              <label htmlFor="occ-date">Ngày mới</label>
              <input
                id="occ-date"
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="occ-start">Từ</label>
              <input
                id="occ-start"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="occ-end">Đến</label>
              <input
                id="occ-end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
              {sameTime && <p className="field-hint warn">Giờ kết thúc phải khác giờ bắt đầu.</p>}
            </div>
            <div className="sheet-actions">
              <button type="submit" className="primary" disabled={busy || sameTime}>
                {busy ? 'Đang lưu…' : 'Dời buổi'}
              </button>
              <button type="button" disabled={busy} onClick={() => setMode('menu')}>
                Quay lại
              </button>
            </div>
          </form>
        )}

        {mode === 'menu' && (
          <div className="field">
            <label htmlFor="occ-note">Lý do (không bắt buộc)</label>
            <input
              id="occ-note"
              maxLength={200}
              placeholder="Ốm, nghỉ lễ…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}

        <p className="sheet-foot">
          Thay đổi ở đây chỉ áp cho buổi này. Khuôn mẫu lặp hàng tuần giữ nguyên.
        </p>
      </div>
    </div>
  );
}

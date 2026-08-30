import type { Activity, FamilyMember } from '../../shared/types';
import type { ActivityInput } from '../lib/api';
import {
  ACTIVITY_KIND_LABEL,
  fullDateLabel,
  timeRangeLabel,
  weekdayLabel,
} from '../lib/format';
import { memberColorVar } from '../lib/schedule';
import { ActivityForm } from './ActivityForm';

export interface ActivityListProps {
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
  title?: string;
  subtitle?: string;
  emptyText?: string;
  /** Ẩn tên người trong mỗi dòng — thừa khi cả danh sách là của đúng một người. */
  hideMember?: boolean;
}

/**
 * Danh sách khuôn mẫu lặp hàng tuần, kèm form thêm/sửa.
 *
 * Dùng chung cho tab "Hoạt động" của lịch cả nhà và cho màn hình lịch riêng của
 * một người; hai bên chỉ khác nhau ở tập `activities` truyền vào và ở tiêu đề.
 */
export function ActivityList({
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
  title = 'Khuôn mẫu lặp hàng tuần',
  subtitle = 'Khai một lần, lịch tự sinh buổi. Nghỉ hay dời từng buổi thì bấm vào buổi đó ở tab Tuần.',
  emptyText = 'Chưa khai hoạt động nào.',
  hideMember = false,
}: ActivityListProps) {
  const showForm = adding || editing !== null;
  return (
    <section className="card">
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-sub" style={{ marginBottom: 0 }}>
            {subtitle}
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
        <p className="empty">{emptyText}</p>
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
                    {!hideMember && (
                      <>
                        <span>{member?.name ?? '—'}</span>
                        <span className="dot" aria-hidden="true">·</span>
                      </>
                    )}
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

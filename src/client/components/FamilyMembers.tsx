import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FamilyMember, FamilyRelation, Member, MemberColor } from '../../shared/types';
import { api } from '../lib/api';
import {
  FAMILY_RELATION_LABEL,
  FAMILY_RELATION_ORDER,
  MEMBER_COLOR_KEYS,
  fullDateLabel,
} from '../lib/format';
import { memberColorVar } from '../lib/schedule';
import { IconPicker } from './IconPicker';

/** Trạng thái của form thêm mới hoặc sửa tại chỗ. */
interface Draft {
  /** Rỗng nghĩa là đang thêm người mới. */
  id: string;
  name: string;
  nickname: string;
  relation: FamilyRelation;
  color: MemberColor;
  icon: string;
  birthDate: string;
  userId: string;
}

function emptyDraft(color: MemberColor): Draft {
  return {
    id: '',
    name: '',
    nickname: '',
    relation: 'khac',
    color,
    icon: '',
    birthDate: '',
    userId: '',
  };
}

function toDraft(member: FamilyMember): Draft {
  return {
    id: member.id,
    name: member.name,
    nickname: member.nickname,
    relation: member.relation,
    color: member.color,
    icon: member.icon ?? '',
    birthDate: member.birthDate ?? '',
    userId: member.userId ?? '',
  };
}

/** Ô chọn màu: tám ô vuông, ô đang chọn có viền đậm và dấu tick cho khỏi chỉ dựa vào màu. */
function ColorPicker({
  value,
  onChange,
}: {
  value: MemberColor;
  onChange: (color: MemberColor) => void;
}) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Màu của thành viên">
      {MEMBER_COLOR_KEYS.map((key, index) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={`Màu ${index + 1}`}
          className={`color-swatch${value === key ? ' selected' : ''}`}
          style={{ background: memberColorVar(key) }}
          onClick={() => onChange(key)}
        >
          {value === key ? '✓' : ''}
        </button>
      ))}
    </div>
  );
}

interface Props {
  /** Tài khoản đăng nhập của hộ, để gắn thành viên với người dùng. */
  accounts: Member[];
}

/**
 * Danh mục người trong nhà — tách hẳn khỏi danh sách tài khoản đăng nhập ở dưới,
 * vì con nhỏ và ông bà cũng có lịch nhưng không có tài khoản.
 */
export function FamilyMembers({ accounts }: Props) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft('c1'));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Trang này là chỗ duy nhất nhìn thấy cả người đã xoá để khôi phục lại.
      setMembers((await api.familyMembers({ includeDeleted: true })).members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách thành viên');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const living = members.filter((m) => m.deletedAt === null);

  /** Màu gợi ý cho người tiếp theo: cái chưa ai dùng, hết thì quay vòng. */
  function suggestColor(): MemberColor {
    const used = new Set(living.map((m) => m.color));
    return MEMBER_COLOR_KEYS.find((c) => !used.has(c)) ?? MEMBER_COLOR_KEYS[living.length % 8];
  }

  function startAdd() {
    setDraft(emptyDraft(suggestColor()));
    setEditing(true);
    setError(null);
    setNotice(null);
  }

  function startEdit(member: FamilyMember) {
    setDraft(toDraft(member));
    setEditing(true);
    setError(null);
    setNotice(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    const body = {
      name: draft.name,
      nickname: draft.nickname,
      relation: draft.relation,
      color: draft.color,
      icon: draft.icon || null,
      birthDate: draft.birthDate || null,
      userId: draft.userId || null,
    };
    try {
      if (draft.id) await api.updateFamilyMember(draft.id, body);
      else await api.createFamilyMember(body);
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được thành viên');
    } finally {
      setSaving(false);
    }
  }

  async function remove(member: FamilyMember) {
    if (!confirm(`Xoá "${member.name}" khỏi danh sách? Vẫn khôi phục lại được.`)) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api.deleteFamilyMember(member.id);
      setNotice(
        res.activities > 0
          ? `Đã xoá "${member.name}". ${res.activities} hoạt động của người này tạm ẩn khỏi lịch, khôi phục là hiện lại.`
          : `Đã xoá "${member.name}".`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xoá được thành viên');
    }
  }

  async function restore(member: FamilyMember) {
    setError(null);
    setNotice(null);
    try {
      await api.restoreFamilyMember(member.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khôi phục được thành viên');
    }
  }

  /** Tài khoản chưa gắn cho ai, cộng thêm tài khoản của chính người đang sửa. */
  const availableAccounts = accounts.filter(
    (a) => a.userId === draft.userId || !living.some((m) => m.userId === a.userId),
  );

  return (
    <section className="card">
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="card-title">Thành viên trong nhà</h2>
          <p className="card-sub" style={{ marginBottom: 0 }}>
            {living.length} người · thêm được cả người không có tài khoản đăng nhập
            {members.length > living.length && ` · ${members.length - living.length} đã xoá`}
          </p>
        </div>
        {!editing && (
          <button type="button" className="primary" onClick={startAdd}>
            Thêm người
          </button>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      {editing && (
        <form onSubmit={save} className="member-form">
          <div className="field">
            <label htmlFor="fm-name">Tên</label>
            <input
              id="fm-name"
              required
              autoFocus
              maxLength={60}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="fm-nickname">Tên gọi ở nhà</label>
            <input
              id="fm-nickname"
              maxLength={30}
              placeholder="không bắt buộc"
              value={draft.nickname}
              onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="fm-relation">Quan hệ</label>
            <select
              id="fm-relation"
              value={draft.relation}
              onChange={(e) => setDraft({ ...draft, relation: e.target.value as FamilyRelation })}
            >
              {FAMILY_RELATION_ORDER.map((r) => (
                <option key={r} value={r}>
                  {FAMILY_RELATION_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fm-icon">Biểu tượng</label>
            <IconPicker
              id="fm-icon"
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
            />
          </div>
          <div className="field">
            <label htmlFor="fm-birth">Ngày sinh</label>
            <input
              id="fm-birth"
              type="date"
              value={draft.birthDate}
              onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="fm-user">Tài khoản đăng nhập</label>
            <select
              id="fm-user"
              value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
            >
              <option value="">Không có tài khoản</option>
              {availableAccounts.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.displayName} ({a.email})
                </option>
              ))}
            </select>
          </div>
          <div className="field member-form-color">
            <span className="pseudo-label">Màu trong lịch</span>
            <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </div>
          <div className="member-form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Đang lưu…' : draft.id ? 'Lưu' : 'Thêm'}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={saving}>
              Huỷ
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="empty">Đang tải…</p>
      ) : members.length === 0 ? (
        <p className="empty">Chưa có ai. Thêm người nhà để bắt đầu khai lịch hoạt động.</p>
      ) : (
        <ul className="member-cards">
          {members.map((m) => (
            <li className={`member-card${m.deletedAt !== null ? ' deleted' : ''}`} key={m.id}>
              <span
                className="member-stripe"
                style={{ background: memberColorVar(m.color) }}
                aria-hidden="true"
              />
              <div className="member-body">
                <div className="member-name">
                  {m.icon ? `${m.icon} ` : ''}
                  {m.name}
                  {m.nickname && <span className="member-nickname"> ({m.nickname})</span>}
                </div>
                <div className="member-meta">
                  <span>{FAMILY_RELATION_LABEL[m.relation]}</span>
                  {m.birthDate && (
                    <>
                      <span className="dot" aria-hidden="true">·</span>
                      <span>Sinh {fullDateLabel(m.birthDate)}</span>
                    </>
                  )}
                  <span className="dot" aria-hidden="true">·</span>
                  <span>
                    {m.userId
                      ? `Tài khoản ${accounts.find((a) => a.userId === m.userId)?.displayName ?? '—'}`
                      : 'Không có tài khoản'}
                  </span>
                </div>
              </div>
              <div className="member-actions">
                {m.deletedAt !== null ? (
                  <button type="button" className="ghost" onClick={() => void restore(m)}>
                    Khôi phục
                  </button>
                ) : (
                  <>
                    <Link className="navlink" to={`/lich/${m.id}`}>
                      Lịch riêng
                    </Link>
                    <button type="button" className="ghost" onClick={() => startEdit(m)}>
                      Sửa
                    </button>
                    <button type="button" className="ghost danger" onClick={() => void remove(m)}>
                      Xoá
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

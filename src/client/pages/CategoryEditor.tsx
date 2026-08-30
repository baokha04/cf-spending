import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Category, Direction } from '../../shared/types';
import { api } from '../lib/api';
import { useReturnTo } from '../lib/navigation';
import { IconPicker } from '../components/IconPicker';

export type CategoryEditorMode = 'create' | 'edit';

/**
 * Màn hình nhập một danh mục — thêm mới hoặc sửa tên và biểu tượng.
 *
 * Tách khỏi trang danh sách như bên giao dịch, và còn một lý do riêng: bảng chọn
 * biểu tượng là một popover khá to, nhét vào một dòng của bảng thì nó tràn ra
 * ngoài khung cuộn ngang và bị cắt mất.
 *
 * Loại thu/chi chỉ đặt được lúc tạo: đổi loại của một danh mục đang dùng sẽ làm
 * mọi giao dịch cũ gắn với nó lệch chiều.
 */
export function CategoryEditor({ mode }: { mode: CategoryEditorMode }) {
  const { id } = useParams();
  const { to, goBack } = useReturnTo('/danh-muc');

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<Direction>('expense');
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Không nạp được danh mục cần sửa: hiện lỗi thay cho form, đừng cho gõ vào khoảng không. */
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let cancelled = false;
    setLoading(true);
    // Không có endpoint đọc một danh mục lẻ; danh sách của một hộ chỉ vài chục
    // dòng nên lấy cả rồi tìm là đủ, khỏi thêm một route API chỉ để dùng ở đây.
    api
      .categories({ includeArchived: true, includeDeleted: true })
      .then(({ categories }) => {
        if (cancelled) return;
        const found = categories.find((c: Category) => c.id === id);
        if (!found) {
          setLoadError('Không tìm thấy danh mục này');
          return;
        }
        setName(found.name);
        setIcon(found.icon ?? '');
        setKind(found.kind);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Không tải được danh mục');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === 'edit' && id) {
        await api.updateCategory(id, { name, icon: icon || null });
        goBack({ notice: `Đã lưu danh mục "${name}".` });
      } else {
        const created = await api.createCategory({ name, kind, icon: icon || null });
        // Tên trùng một danh mục đã xoá thì API dựng lại chính nó — phải nói ra,
        // nếu không người dùng tưởng mình vừa tạo một danh mục trắng tinh.
        goBack({
          notice: created.restored
            ? `"${created.name}" trước đó đã bị xoá nên được khôi phục lại thay vì tạo mới.`
            : `Đã thêm danh mục "${created.name}".`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được danh mục');
      setSaving(false);
    }
  }

  return (
    <>
      <Link className="back-link" to={to}>
        ← Danh sách danh mục
      </Link>
      <div className="page-head">
        <div>
          <h1>{mode === 'edit' ? 'Sửa danh mục' : 'Thêm danh mục'}</h1>
          <p className="page-sub">
            {mode === 'edit'
              ? 'Đổi tên hay biểu tượng không đụng tới giao dịch nào: chúng gắn theo mã danh mục.'
              : 'Tên không được trùng trong cùng một loại thu hoặc chi.'}
          </p>
        </div>
      </div>

      <section className="card form-page">
        {loading ? (
          <p className="empty">Đang tải…</p>
        ) : loadError ? (
          <div className="alert error">{loadError}</div>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="alert error">{error}</div>}

            <div className="field">
              <label htmlFor="c-name">Tên danh mục</label>
              <input
                id="c-name"
                required
                autoFocus
                maxLength={60}
                placeholder="Ăn uống, tiền điện…"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="c-icon">Biểu tượng</label>
              <IconPicker id="c-icon" value={icon} onChange={setIcon} />
            </div>

            <div className="field">
              <label htmlFor="c-kind">Loại</label>
              {mode === 'edit' ? (
                <>
                  <input id="c-kind" value={kind === 'income' ? 'Thu' : 'Chi'} disabled readOnly />
                  <p className="field-hint">
                    Loại thu/chi không đổi được — đổi rồi thì các giao dịch cũ sẽ lệch chiều.
                  </p>
                </>
              ) : (
                <select
                  id="c-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Direction)}
                >
                  <option value="expense">Chi</option>
                  <option value="income">Thu</option>
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Đang lưu…' : mode === 'edit' ? 'Lưu thay đổi' : 'Thêm danh mục'}
              </button>
              <button type="button" onClick={() => goBack()} disabled={saving}>
                Huỷ
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

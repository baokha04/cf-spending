import { useCallback, useEffect, useState } from 'react';
import type { Category, Direction } from '../../shared/types';
import { api } from '../lib/api';

/** Trạng thái ô sửa tại chỗ của một danh mục. */
interface EditState {
  id: string;
  name: string;
  icon: string;
}

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<Direction>('expense');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Trang này là nơi duy nhất nhìn thấy đủ ba trạng thái: đang dùng, đã lưu
      // trữ và đã xoá.
      setCategories(
        (await api.categories({ includeArchived: true, includeDeleted: true })).categories,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh mục');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const created = await api.createCategory({ name, kind, icon: icon || null });
      if (created.restored) {
        setNotice(`"${created.name}" trước đó đã bị xoá nên được khôi phục lại thay vì tạo mới.`);
      }
      setName('');
      setIcon('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được danh mục');
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      // Loại thu/chi không đổi được: đổi rồi thì các giao dịch cũ sẽ lệch chiều.
      await api.updateCategory(edit.id, { name: edit.name, icon: edit.icon || null });
      setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không sửa được danh mục');
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    // Xoá mềm: hàng vẫn nằm trong bảng nên lời nhắc không cần doạ dẫm.
    if (!confirm(`Xoá danh mục "${category.name}"? Vẫn khôi phục lại được.`)) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api.deleteCategory(category.id);
      setNotice(
        res.transactions > 0
          ? `Đã xoá "${category.name}". ${res.transactions} giao dịch cũ vẫn giữ nguyên nhãn này.`
          : `Đã xoá "${category.name}".`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xoá được danh mục');
    }
  }

  async function restore(category: Category) {
    setError(null);
    setNotice(null);
    try {
      await api.restoreCategory(category.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khôi phục được danh mục');
    }
  }

  async function toggleArchive(category: Category) {
    setError(null);
    try {
      await api.updateCategory(category.id, { isArchived: !category.isArchived });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cập nhật được danh mục');
    }
  }

  const groups: Array<{ kind: Direction; title: string }> = [
    { kind: 'expense', title: 'Danh mục chi' },
    { kind: 'income', title: 'Danh mục thu' },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Danh mục</h1>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      <section className="card">
        <h2 className="card-title">Thêm danh mục</h2>
        <p className="card-sub">Tên không được trùng trong cùng một loại thu hoặc chi.</p>
        <form onSubmit={create} className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="c-name">Tên</label>
            <input id="c-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ width: 90 }}>
            <label htmlFor="c-icon">Biểu tượng</label>
            <input id="c-icon" maxLength={4} placeholder="🍜" value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label htmlFor="c-kind">Loại</label>
            <select id="c-kind" value={kind} onChange={(e) => setKind(e.target.value as Direction)}>
              <option value="expense">Chi</option>
              <option value="income">Thu</option>
            </select>
          </div>
          <button type="submit" className="primary">
            Thêm
          </button>
        </form>
      </section>

      {loading ? (
        <div className="card empty">Đang tải…</div>
      ) : (
        groups.map((group) => {
          const rows = categories.filter((c) => c.kind === group.kind);
          return (
            <section className="card" key={group.kind}>
              <h2 className="card-title">{group.title}</h2>
              <p className="card-sub">
                {rows.filter((c) => c.deletedAt === null).length} danh mục
                {rows.some((c) => c.deletedAt !== null) &&
                  ` · ${rows.filter((c) => c.deletedAt !== null).length} đã xoá`}
              </p>
              {rows.length === 0 ? (
                <p className="empty">Chưa có danh mục nào.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Tên</th>
                        <th>Trạng thái</th>
                        <th aria-label="Thao tác" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) =>
                        edit?.id === c.id ? (
                          <tr key={c.id}>
                            {/* Sửa ngay tại dòng: đổi tên và biểu tượng, giữ nguyên
                                mọi giao dịch đang gắn với danh mục này. */}
                            <td colSpan={3}>
                              <form onSubmit={saveEdit} className="toolbar" style={{ marginBottom: 0 }}>
                                <div className="field" style={{ width: 90 }}>
                                  <label htmlFor="c-edit-icon">Biểu tượng</label>
                                  <input
                                    id="c-edit-icon"
                                    maxLength={4}
                                    placeholder="🍜"
                                    value={edit.icon}
                                    onChange={(e) => setEdit({ ...edit, icon: e.target.value })}
                                  />
                                </div>
                                <div className="field" style={{ flex: '1 1 200px' }}>
                                  <label htmlFor="c-edit-name">Tên</label>
                                  <input
                                    id="c-edit-name"
                                    required
                                    autoFocus
                                    maxLength={60}
                                    value={edit.name}
                                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                                  />
                                </div>
                                <button type="submit" className="primary" disabled={saving}>
                                  {saving ? 'Đang lưu…' : 'Lưu'}
                                </button>
                                <button type="button" onClick={() => setEdit(null)} disabled={saving}>
                                  Huỷ
                                </button>
                              </form>
                            </td>
                          </tr>
                        ) : (
                          <tr key={c.id} className={c.deletedAt !== null ? 'deleted' : undefined}>
                            <td>
                              {c.icon ? `${c.icon} ` : ''}
                              {c.name}
                            </td>
                            <td>
                              <span className={`pill${c.deletedAt !== null ? ' warn' : ''}`}>
                                {c.deletedAt !== null
                                  ? 'Đã xoá'
                                  : c.isArchived
                                    ? 'Đã lưu trữ'
                                    : 'Đang dùng'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {/* Danh mục đã xoá chỉ còn một đường ra: khôi phục. */}
                              {c.deletedAt !== null ? (
                                <button type="button" className="ghost" onClick={() => void restore(c)}>
                                  Khôi phục
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => setEdit({ id: c.id, name: c.name, icon: c.icon ?? '' })}
                                  >
                                    Sửa
                                  </button>
                                  <button type="button" className="ghost" onClick={() => void toggleArchive(c)}>
                                    {c.isArchived ? 'Dùng lại' : 'Lưu trữ'}
                                  </button>
                                  <button type="button" className="ghost danger" onClick={() => void remove(c)}>
                                    Xoá
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </>
  );
}

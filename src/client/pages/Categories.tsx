import { useCallback, useEffect, useState } from 'react';
import type { Category, Direction } from '../../shared/types';
import { api } from '../lib/api';

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<Direction>('expense');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCategories((await api.categories(true)).categories);
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
      await api.createCategory({ name, kind, icon: icon || null });
      setName('');
      setIcon('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được danh mục');
    }
  }

  async function remove(category: Category) {
    if (!confirm(`Xoá danh mục "${category.name}"?`)) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api.deleteCategory(category.id);
      // Danh mục còn giao dịch sẽ được lưu trữ thay vì xoá, để lịch sử giữ nguyên nhãn.
      if (res.archived) {
        setNotice(
          `"${category.name}" còn ${res.transactions} giao dịch nên đã chuyển sang lưu trữ thay vì xoá hẳn.`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xoá được danh mục');
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
              <p className="card-sub">{rows.length} danh mục</p>
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
                      {rows.map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.icon ? `${c.icon} ` : ''}
                            {c.name}
                          </td>
                          <td>
                            <span className="pill">{c.isArchived ? 'Đã lưu trữ' : 'Đang dùng'}</span>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" className="ghost" onClick={() => void toggleArchive(c)}>
                              {c.isArchived ? 'Dùng lại' : 'Lưu trữ'}
                            </button>
                            <button type="button" className="ghost danger" onClick={() => void remove(c)}>
                              Xoá
                            </button>
                          </td>
                        </tr>
                      ))}
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

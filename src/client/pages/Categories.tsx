import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Category, Direction } from '../../shared/types';
import { api } from '../lib/api';
import { useCurrentUrl } from '../lib/navigation';
import { ActionIcon } from '../components/icons';

/** Màn hình form gửi kèm lời báo việc vừa làm xong, để hiện ở đây. */
interface NoticeState {
  notice?: string;
}

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();
  const here = useCurrentUrl();

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

  // Vừa từ màn hình form quay về: hiện lời báo rồi xoá khỏi lịch sử duyệt web,
  // nếu không tải lại trang là nó hiện lại một lần nữa.
  useEffect(() => {
    const fromForm = (location.state as NoticeState | null)?.notice;
    if (!fromForm) return;
    setNotice(fromForm);
    navigate(here, { replace: true, state: null });
  }, [location.state, navigate, here]);

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
        <Link
          className="button-link primary icon-button"
          to="/danh-muc/them"
          state={{ from: here }}
          aria-label="Thêm danh mục"
          title="Thêm danh mục"
        >
          <ActionIcon name="plus" />
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

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
                      {rows.map((c) => (
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
                                <Link
                                  className="button-link ghost"
                                  to={`/danh-muc/${c.id}/sua`}
                                  state={{ from: here }}
                                >
                                  Sửa
                                </Link>
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

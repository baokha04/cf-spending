import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Category, Transaction } from '../../shared/types';
import { api } from '../lib/api';
import type { TransactionQuery } from '../lib/api';
import { useExpiry } from '../lib/expiry-context';
import { useCurrentUrl } from '../lib/navigation';
import { currentMonthISO } from '../lib/format';
import { ExpiryAlert } from '../components/ExpiryAlert';
import { ActionIcon } from '../components/icons';
import { TransactionTable } from '../components/TransactionTable';

const PAGE_SIZE = 50;

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Bộ lọc nằm trong URL chứ không trong state của component.
 *
 * Form nhập giờ là một màn hình riêng, nên mỗi lần thêm hay sửa một giao dịch là
 * một lần rời trang này rồi quay lại. Giữ bộ lọc trong URL thì quay về là thấy
 * đúng danh sách đang xem dở, và cái link đó cũng gửi cho người khác được.
 */
interface Filters {
  month: string;
  allMonths: boolean;
  direction: string;
  recurrence: string;
  categoryId: string;
  q: string;
  showDeleted: boolean;
}

function readFilters(params: URLSearchParams): Filters {
  return {
    month: params.get('thang') ?? currentMonthISO(),
    allMonths: params.get('moi-thang') === '1',
    direction: params.get('chieu') ?? '',
    recurrence: params.get('tinh-chat') ?? '',
    categoryId: params.get('danh-muc') ?? '',
    q: params.get('tim') ?? '',
    // Mặc định hiện cả giao dịch đã xoá, nên chỉ ghi vào URL khi người dùng tắt đi.
    showDeleted: params.get('an-da-xoa') !== '1',
  };
}

/** Chỉ ghi vào URL những gì khác mặc định, để link ngắn và dễ đọc. */
function writeFilters(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.allMonths) params.set('moi-thang', '1');
  else if (f.month !== currentMonthISO()) params.set('thang', f.month);
  if (f.direction) params.set('chieu', f.direction);
  if (f.recurrence) params.set('tinh-chat', f.recurrence);
  if (f.categoryId) params.set('danh-muc', f.categoryId);
  if (f.q.trim()) params.set('tim', f.q.trim());
  if (!f.showDeleted) params.set('an-da-xoa', '1');
  return params;
}

export function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Đường quay về cho các màn hình form: chính URL này, kèm bộ lọc đang đặt.
  const here = useCurrentUrl();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { refresh: refreshExpiry } = useExpiry();

  const filters = readFilters(searchParams);
  const { month, allMonths, direction, recurrence, categoryId, q, showDeleted } = filters;

  /** Đổi bộ lọc = thay URL tại chỗ, không đẩy thêm mục vào lịch sử duyệt web. */
  function setFilter(patch: Partial<Filters>) {
    setSearchParams(writeFilters({ ...filters, ...patch }), { replace: true });
  }

  const query = searchParams.toString();
  const buildQuery = useCallback((): TransactionQuery => {
    const f = readFilters(new URLSearchParams(query));
    return {
      ...(f.allMonths ? {} : monthRange(f.month)),
      direction: f.direction || undefined,
      recurrence: f.recurrence || undefined,
      categoryId: f.categoryId || undefined,
      q: f.q.trim() || undefined,
      includeDeleted: f.showDeleted ? ('1' as const) : undefined,
      limit: PAGE_SIZE,
    };
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.transactions(buildQuery());
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    api
      .categories()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Sau mỗi lần dữ liệu đổi: tải lại danh sách và cập nhật cả chuông lẫn thẻ nhắc. */
  const reload = useCallback(() => {
    void load();
    void refreshExpiry();
  }, [load, refreshExpiry]);

  async function loadMore() {
    if (!nextCursor) return;
    try {
      const page = await api.transactions({ ...buildQuery(), cursor: nextCursor });
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải thêm được');
    }
  }

  /** Mở một màn hình form, mang theo đường quay về là danh sách đang lọc dở. */
  const openForm = (path: string) => navigate(path, { state: { from: here } });

  const categoryOptions = categories.filter((c) => !direction || c.kind === direction);

  return (
    <>
      <div className="page-head">
        <h1>Giao dịch</h1>
        {/* Chỉ còn dấu cộng: nhãn chuyển vào aria-label và title, như các nút
            thao tác trên từng dòng. */}
        <Link
          className="button-link primary icon-button"
          to="/giao-dich/them"
          state={{ from: here }}
          aria-label="Thêm giao dịch"
          title="Thêm giao dịch"
        >
          <ActionIcon name="plus" />
        </Link>
      </div>

      <ExpiryAlert onChanged={() => void load()} />

      <section className="card">
        <div className="toolbar">
          <div className="field">
            <label htmlFor="f-month">Tháng</label>
            <input
              id="f-month"
              type="month"
              value={month}
              disabled={allMonths}
              onChange={(e) => e.target.value && setFilter({ month: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="f-all">
              <input
                id="f-all"
                type="checkbox"
                checked={allMonths}
                onChange={(e) => setFilter({ allMonths: e.target.checked })}
                style={{ width: 'auto', marginRight: 6 }}
              />
              Tất cả các tháng
            </label>
          </div>
          <div className="field">
            <label htmlFor="f-direction">Thu / chi</label>
            <select
              id="f-direction"
              value={direction}
              onChange={(e) => setFilter({ direction: e.target.value, categoryId: '' })}
            >
              <option value="">Tất cả</option>
              <option value="expense">Chi ra</option>
              <option value="income">Thu vào</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-recurrence">Tính chất</label>
            <select
              id="f-recurrence"
              value={recurrence}
              onChange={(e) => setFilter({ recurrence: e.target.value })}
            >
              <option value="">Tất cả</option>
              <option value="monthly">Hàng tháng</option>
              <option value="one_off">Phát sinh</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-category">Danh mục</label>
            <select
              id="f-category"
              value={categoryId}
              onChange={(e) => setFilter({ categoryId: e.target.value })}
            >
              <option value="">Tất cả</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label htmlFor="f-q">Tìm trong nội dung</label>
            <input
              id="f-q"
              value={q}
              onChange={(e) => setFilter({ q: e.target.value })}
              placeholder="tiền điện…"
            />
          </div>
          <div className="field">
            <label htmlFor="f-deleted">
              <input
                id="f-deleted"
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setFilter({ showDeleted: e.target.checked })}
                style={{ width: 'auto', marginRight: 6 }}
              />
              Hiện giao dịch đã xoá
            </label>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}
        {loading ? (
          <p className="empty">Đang tải…</p>
        ) : (
          <>
            <TransactionTable
              items={items}
              onChanged={reload}
              onEdit={(tx) => openForm(`/giao-dich/${tx.id}/sua`)}
              onCopy={(tx) => openForm(`/giao-dich/${tx.id}/sao-chep`)}
              onSplit={(tx) => openForm(`/giao-dich/${tx.id}/tach`)}
            />
            {nextCursor && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" onClick={() => void loadMore()}>
                  Tải thêm
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

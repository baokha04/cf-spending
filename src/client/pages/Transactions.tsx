import { useCallback, useEffect, useState } from 'react';
import type { Category, Transaction } from '../../shared/types';
import { api } from '../lib/api';
import type { TransactionQuery } from '../lib/api';
import { currentMonthISO } from '../lib/format';
import { ExpiryAlert } from '../components/ExpiryAlert';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionTable } from '../components/TransactionTable';

const PAGE_SIZE = 50;

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function Transactions() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [copying, setCopying] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tăng lên mỗi lần danh sách đổi, để thẻ nhắc gia hạn tải lại theo.
  const [changeCount, setChangeCount] = useState(0);

  const [month, setMonth] = useState(currentMonthISO());
  const [allMonths, setAllMonths] = useState(false);
  const [direction, setDirection] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [showDeleted, setShowDeleted] = useState(true);

  const buildQuery = useCallback((): TransactionQuery => {
    const range = allMonths ? {} : monthRange(month);
    return {
      ...range,
      direction: direction || undefined,
      recurrence: recurrence || undefined,
      categoryId: categoryId || undefined,
      q: q.trim() || undefined,
      includeDeleted: showDeleted ? ('1' as const) : undefined,
      limit: PAGE_SIZE,
    };
  }, [allMonths, month, direction, recurrence, categoryId, q, showDeleted]);

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

  /**
   * Sau mỗi lần dữ liệu đổi: tải lại danh sách và bảo thẻ nhắc gia hạn tải theo.
   * Lọc lại danh sách thì không cần — hạn của các khoản có đổi gì đâu.
   */
  const reload = useCallback(() => {
    setChangeCount((n) => n + 1);
    void load();
  }, [load]);

  useEffect(() => {
    api
      .categories()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const categoryOptions = categories.filter((c) => !direction || c.kind === direction);

  return (
    <>
      <div className="page-head">
        <h1>Giao dịch</h1>
      </div>

      <ExpiryAlert reloadToken={changeCount} onChanged={() => void load()} />

      <div className="grid grid-form">
        <section className="card">
          <h2 className="card-title">
            {editing ? 'Sửa giao dịch' : copying ? 'Sao chép giao dịch' : 'Thêm giao dịch'}
          </h2>
          <p className="card-sub">
            {copying
              ? 'Đã điền sẵn theo giao dịch được chọn, ngày đổi thành hôm nay. Sửa lại rồi lưu thành giao dịch mới.'
              : 'Ghi ngay khi vừa chi để không quên khoản nhỏ.'}
          </p>
          <TransactionForm
            categories={categories}
            editing={editing}
            copying={copying}
            onSaved={() => {
              setEditing(null);
              setCopying(null);
              reload();
            }}
            onCancel={
              editing || copying
                ? () => {
                    setEditing(null);
                    setCopying(null);
                  }
                : undefined
            }
          />
        </section>

        <section className="card">
          <div className="toolbar">
            <div className="field">
              <label htmlFor="f-month">Tháng</label>
              <input
                id="f-month"
                type="month"
                value={month}
                disabled={allMonths}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-all">
                <input
                  id="f-all"
                  type="checkbox"
                  checked={allMonths}
                  onChange={(e) => setAllMonths(e.target.checked)}
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
                onChange={(e) => {
                  setDirection(e.target.value);
                  setCategoryId('');
                }}
              >
                <option value="">Tất cả</option>
                <option value="expense">Chi ra</option>
                <option value="income">Thu vào</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-recurrence">Tính chất</label>
              <select id="f-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="monthly">Hàng tháng</option>
                <option value="one_off">Phát sinh</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-category">Danh mục</label>
              <select id="f-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
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
              <input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="tiền điện…" />
            </div>
            <div className="field">
              <label htmlFor="f-deleted">
                <input
                  id="f-deleted"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
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
                onEdit={(tx) => {
                  setCopying(null);
                  setEditing(tx);
                }}
                onCopy={(tx) => {
                  setEditing(null);
                  setCopying(tx);
                }}
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
      </div>
    </>
  );
}

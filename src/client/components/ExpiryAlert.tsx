import { useCallback, useEffect, useState } from 'react';
import type { ExpiringTransaction } from '../../shared/types';
import { RENEW_MONTH_OPTIONS, addMonths, renewBaseDate } from '../../shared/expiry';
import { api } from '../lib/api';
import { expiryPillLabel, fullDateLabel, money } from '../lib/format';

interface Props {
  /**
   * Đổi giá trị này để bắt tải lại — trang nào sửa giao dịch xong cũng nên tăng
   * nó lên, nếu không danh sách nhắc vẫn còn khoản vừa được gia hạn.
   */
  reloadToken?: number;
  /** Gọi sau khi gia hạn hoặc bỏ hạn, để trang chủ quản tải lại số liệu của nó. */
  onChanged?: () => void;
}

/** Số khoản hiện thẳng ra; phần còn lại gộp thành một dòng đếm. */
const VISIBLE = 6;

/**
 * Nhắc gia hạn: các khoản đã quá hạn và các khoản hết hạn trong một tuần tới.
 *
 * Tự gọi API chứ không nhận dữ liệu từ trang cha, vì nó xuất hiện ở nhiều trang
 * và ở đâu cũng phải nói cùng một chuyện. Không có khoản nào cần nhắc thì
 * component không vẽ gì cả — một thẻ trống mỗi ngày sẽ dạy người dùng bỏ qua nó.
 */
export function ExpiryAlert({ reloadToken = 0, onChanged }: Props) {
  const [items, setItems] = useState<ExpiringTransaction[]>([]);
  const [today, setToday] = useState('');
  const [days, setDays] = useState(7);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.expiringTransactions();
      setToday(res.today);
      setDays(res.days);
      // Quá hạn lên trước: đó là phần đang thực sự hỏng, không phải phần sắp tới.
      setItems([...res.overdue, ...res.soon]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách cần gia hạn');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  async function apply(item: ExpiringTransaction, expiresOn: string | null) {
    setBusyId(item.transaction.id);
    setError(null);
    try {
      await api.updateTransaction(item.transaction.id, { expiresOn });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gia hạn được');
    } finally {
      setBusyId(null);
    }
  }

  if (error && items.length === 0) return <div className="alert error">{error}</div>;
  if (items.length === 0) return null;

  const overdueCount = items.filter((i) => i.daysLeft < 0).length;
  const soonCount = items.length - overdueCount;
  const shown = showAll ? items : items.slice(0, VISIBLE);

  return (
    <section className="card expiry-alert" aria-label="Nhắc gia hạn">
      <h2 className="card-title">Cần gia hạn</h2>
      <p className="card-sub">
        {overdueCount > 0 && `${overdueCount} khoản đã quá hạn`}
        {overdueCount > 0 && soonCount > 0 && ' · '}
        {soonCount > 0 && `${soonCount} khoản hết hạn trong ${days} ngày tới`}
      </p>

      {error && <div className="alert error">{error}</div>}

      <ul className="expiry-list">
        {shown.map((item) => {
          const tx = item.transaction;
          const base = renewBaseDate(tx.expiresOn ?? today, today);
          return (
            <li key={tx.id} className={item.daysLeft < 0 ? 'expiry-row overdue' : 'expiry-row'}>
              <div className="expiry-main">
                <span className="expiry-note">
                  {tx.note || <span style={{ color: 'var(--text-muted)' }}>(không ghi chú)</span>}
                </span>
                {/* Trong thẻ này khoản nào cũng cần làm gì đó, nên chỉ tô đỏ phần
                    đã tới hạn — đỏ hết thì màu không phân biệt được gì nữa. Trên
                    bảng giao dịch thì ngược lại: ở đó pill hạn là ngoại lệ giữa
                    hàng loạt dòng bình thường nên lúc nào cũng tô. */}
                <span className={`pill${item.daysLeft <= 0 ? ' warn' : ''}`}>
                  {expiryPillLabel(item.daysLeft)}
                </span>
              </div>
              <div className="expiry-meta">
                <span>{tx.expiresOn && fullDateLabel(tx.expiresOn)}</span>
                <span className="dot" aria-hidden="true">·</span>
                <span>{money(tx.amount)}</span>
                {tx.categoryName && (
                  <>
                    <span className="dot" aria-hidden="true">·</span>
                    <span>{tx.categoryName}</span>
                  </>
                )}
              </div>
              <div className="expiry-actions">
                <span className="expiry-actions-label">Gia hạn thêm</span>
                {RENEW_MONTH_OPTIONS.map((months) => (
                  <button
                    key={months}
                    type="button"
                    className="ghost"
                    disabled={busyId === tx.id}
                    title={`Hạn mới: ${fullDateLabel(addMonths(base, months))}`}
                    onClick={() => void apply(item, addMonths(base, months))}
                  >
                    {months} tháng
                  </button>
                ))}
                <button
                  type="button"
                  className="ghost"
                  disabled={busyId === tx.id}
                  title="Khoản này không cần theo dõi hạn nữa"
                  onClick={() => void apply(item, null)}
                >
                  Bỏ hạn
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length > VISIBLE && (
        <button type="button" className="ghost" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Thu gọn' : `Xem thêm ${items.length - VISIBLE} khoản`}
        </button>
      )}
    </section>
  );
}

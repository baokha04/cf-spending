import { Fragment, useState } from 'react';
import type { Transaction } from '../../shared/types';
import { daysUntil, needsRenewal } from '../../shared/expiry';
import { api } from '../lib/api';
import { RECURRENCE_LABEL, expiryPillLabel, fullDateLabel, money, todayISO } from '../lib/format';
import { useIsPhone } from '../lib/use-media-query';
import { TransactionDetails, hasExtraInfo } from './TransactionDetails';

interface Props {
  items: Transaction[];
  onChanged: () => void;
  onEdit?: (tx: Transaction) => void;
  /** Có handler thì hiện nút sao chép để tạo nhanh một giao dịch giống hệt. */
  onCopy?: (tx: Transaction) => void;
  /** Có handler thì hiện nút tách khoản này làm hai. */
  onSplit?: (tx: Transaction) => void;
  compact?: boolean;
}

export function TransactionTable({
  items,
  onChanged,
  onEdit,
  onCopy,
  onSplit,
  compact = false,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mở chi tiết từng dòng, giữ theo id để danh sách tải thêm không làm mất chỗ đang mở.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Bảy cột không lọt màn hình 402pt của iPhone 16 Pro; cuộn ngang một bảng
  // rộng khó đọc hơn hẳn, nên trên điện thoại mỗi giao dịch là một thẻ.
  const isPhone = useIsPhone();

  async function remove(tx: Transaction) {
    // Xoá mềm: dòng vẫn ở lại danh sách nên không cần hỏi lại dồn dập.
    if (!confirm(`Xoá giao dịch "${tx.note || money(tx.amount)}"? Vẫn khôi phục lại được.`)) return;
    setBusyId(tx.id);
    setError(null);
    try {
      await api.deleteTransaction(tx.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xoá được giao dịch');
    } finally {
      setBusyId(null);
    }
  }

  async function restore(tx: Transaction) {
    setBusyId(tx.id);
    setError(null);
    try {
      await api.restoreTransaction(tx.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khôi phục được giao dịch');
    } finally {
      setBusyId(null);
    }
  }

  function toggleDetails(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return <p className="empty">Chưa có giao dịch nào.</p>;
  }

  const amount = (tx: Transaction) => (
    /* Dấu +/− mang ý nghĩa thu/chi; màu chỉ là lớp nhấn thêm. */
    <span className={tx.direction === 'income' ? 'income' : 'expense'}>
      {tx.direction === 'income' ? '+' : '−'}
      {money(tx.amount)}
    </span>
  );

  /**
   * Pill hạn, chỉ hiện khi khoản đó đã quá hạn hoặc sắp hết hạn — hạn còn xa thì
   * nằm trong phần chi tiết là đủ, đưa hết lên bảng thì cái gì cũng nhấn mạnh
   * hoá ra không nhấn mạnh gì. Khoản đã xoá thì hạn không còn ý nghĩa.
   */
  const expiryPill = (tx: Transaction) => {
    if (!tx.expiresOn || tx.deletedAt !== null) return null;
    const daysLeft = daysUntil(todayISO(), tx.expiresOn);
    if (!needsRenewal(daysLeft)) return null;
    return (
      <span className="pill warn" title={`Hết hạn ${fullDateLabel(tx.expiresOn)}`}>
        {expiryPillLabel(daysLeft)}
      </span>
    );
  };

  const detailsButton = (tx: Transaction) => (
    <button
      type="button"
      className="ghost"
      aria-expanded={expanded.has(tx.id)}
      onClick={() => toggleDetails(tx.id)}
      title={hasExtraInfo(tx) ? 'Xem thông tin chi tiết' : 'Khoản này chưa ghi chi tiết'}
    >
      {expanded.has(tx.id) ? 'Ẩn' : 'Chi tiết'}
      {hasExtraInfo(tx) && <span className="has-detail" aria-label="đã có chi tiết" />}
    </button>
  );

  // Dòng đã xoá chỉ còn xem chi tiết và khôi phục; sửa hay xoá tiếp đều vô nghĩa.
  const actions = (tx: Transaction) =>
    tx.deletedAt !== null ? (
      <>
        {detailsButton(tx)}
        <button
          type="button"
          className="ghost"
          onClick={() => void restore(tx)}
          disabled={busyId === tx.id}
        >
          Khôi phục
        </button>
      </>
    ) : (
      <>
        {detailsButton(tx)}
        {onCopy && (
          <button
            type="button"
            className="ghost"
            onClick={() => onCopy(tx)}
            title="Điền sẵn form với nội dung của giao dịch này"
          >
            Sao chép
          </button>
        )}
        {/* Tách được thì khoản đó phải chia ra được thành hai phần đều lớn hơn 0. */}
        {onSplit && tx.amount > 1 && (
          <button
            type="button"
            className="ghost"
            onClick={() => onSplit(tx)}
            title="Cắt một phần số tiền ra thành giao dịch riêng"
          >
            Tách
          </button>
        )}
        {onEdit && (
          <button type="button" className="ghost" onClick={() => onEdit(tx)}>
            Sửa
          </button>
        )}
        <button
          type="button"
          className="ghost danger"
          onClick={() => void remove(tx)}
          disabled={busyId === tx.id}
        >
          Xoá
        </button>
      </>
    );

  if (isPhone) {
    return (
      <>
        {error && <div className="alert error">{error}</div>}
        <ul className="tx-cards" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((tx) => (
            <li className={`tx-card${tx.deletedAt !== null ? ' deleted' : ''}`} key={tx.id}>
              <div className="tx-top">
                <span className="tx-note">
                  {tx.note || <span style={{ color: 'var(--text-muted)' }}>(không ghi chú)</span>}
                </span>
                <span className="tx-amount">{amount(tx)}</span>
              </div>
              <div className="tx-meta">
                <span>{fullDateLabel(tx.occurredOn)}</span>
                <span className="dot" aria-hidden="true">·</span>
                <span>{tx.categoryName ?? 'Chưa phân loại'}</span>
                <span className="pill">{RECURRENCE_LABEL[tx.recurrence]}</span>
                {expiryPill(tx)}
                {tx.deletedAt !== null && <span className="pill warn">Đã xoá</span>}
                {!compact && (
                  <>
                    <span className="dot" aria-hidden="true">·</span>
                    <span>{tx.createdByName}</span>
                  </>
                )}
              </div>
              {expanded.has(tx.id) && <TransactionDetails tx={tx} />}
              <div className="tx-actions">{actions(tx)}</div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="col-tight">Ngày</th>
              <th className="col-grow">Nội dung</th>
              <th className="col-tight">Danh mục</th>
              <th className="col-tight">Loại</th>
              {!compact && <th className="col-tight">Người nhập</th>}
              <th className="num">Số tiền</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {items.map((tx) => (
              <Fragment key={tx.id}>
                <tr className={tx.deletedAt !== null ? 'deleted' : undefined}>
                  <td className="col-tight">{fullDateLabel(tx.occurredOn)}</td>
                  <td className="col-grow">
                    {tx.note || <span style={{ color: 'var(--text-muted)' }}>(không ghi chú)</span>}
                  </td>
                  <td className="col-tight">
                    {tx.categoryName ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="col-tight">
                    <span className="pill">{RECURRENCE_LABEL[tx.recurrence]}</span>
                    {expiryPill(tx)}
                    {tx.deletedAt !== null && <span className="pill warn">Đã xoá</span>}
                  </td>
                  {!compact && <td className="col-tight">{tx.createdByName}</td>}
                  <td className="num">{amount(tx)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{actions(tx)}</td>
                </tr>
                {/* Chi tiết nằm ở dòng riêng trải hết bề ngang, không bóp cột nào. */}
                {expanded.has(tx.id) && (
                  <tr className="tx-detail-row">
                    <td colSpan={compact ? 6 : 7}>
                      <TransactionDetails tx={tx} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

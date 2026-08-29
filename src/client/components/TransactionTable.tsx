import { useState } from 'react';
import type { Transaction } from '../../shared/types';
import { api } from '../lib/api';
import { RECURRENCE_LABEL, fullDateLabel, money } from '../lib/format';
import { useIsPhone } from '../lib/use-media-query';

interface Props {
  items: Transaction[];
  onChanged: () => void;
  onEdit?: (tx: Transaction) => void;
  compact?: boolean;
}

export function TransactionTable({ items, onChanged, onEdit, compact = false }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bảy cột không lọt màn hình 402pt của iPhone 16 Pro; cuộn ngang một bảng
  // rộng khó đọc hơn hẳn, nên trên điện thoại mỗi giao dịch là một thẻ.
  const isPhone = useIsPhone();

  async function remove(tx: Transaction) {
    if (!confirm(`Xoá giao dịch "${tx.note || money(tx.amount)}"?`)) return;
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

  const actions = (tx: Transaction) => (
    <>
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
            <li className="tx-card" key={tx.id}>
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
                {!compact && (
                  <>
                    <span className="dot" aria-hidden="true">·</span>
                    <span>{tx.createdByName}</span>
                  </>
                )}
              </div>
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
              <tr key={tx.id}>
                <td className="col-tight">{fullDateLabel(tx.occurredOn)}</td>
                <td className="col-grow">
                  {tx.note || <span style={{ color: 'var(--text-muted)' }}>(không ghi chú)</span>}
                </td>
                <td className="col-tight">
                  {tx.categoryName ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td className="col-tight">
                  <span className="pill">{RECURRENCE_LABEL[tx.recurrence]}</span>
                </td>
                {!compact && <td className="col-tight">{tx.createdByName}</td>}
                <td className="num">{amount(tx)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{actions(tx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

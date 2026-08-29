import { useState } from 'react';
import type { Transaction } from '../../shared/types';
import { api } from '../lib/api';
import { RECURRENCE_LABEL, fullDateLabel, money } from '../lib/format';

interface Props {
  items: Transaction[];
  onChanged: () => void;
  onEdit?: (tx: Transaction) => void;
  compact?: boolean;
}

export function TransactionTable({ items, onChanged, onEdit, compact = false }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                <td className="num">
                  {/* Dấu +/− mang ý nghĩa thu/chi; màu chỉ là lớp nhấn thêm. */}
                  <span className={tx.direction === 'income' ? 'income' : 'expense'}>
                    {tx.direction === 'income' ? '+' : '−'}
                    {money(tx.amount)}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

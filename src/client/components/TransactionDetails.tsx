import type { Transaction } from '../../shared/types';
import { PAYMENT_METHOD_LABEL, dateTimeLabel } from '../lib/format';

/** Một khoản có ghi thêm thông tin gì ngoài các trường bắt buộc không? */
export function hasExtraInfo(tx: Transaction): boolean {
  return Boolean(tx.detail.trim() || tx.payee.trim() || tx.paymentMethod);
}

/**
 * Phần thông tin mở rộng của một giao dịch: ai nhận, trả bằng gì, mô tả dài,
 * và dấu vết chỉnh sửa. Dùng chung cho bảng giao dịch và trang khoản lớn.
 */
export function TransactionDetails({ tx }: { tx: Transaction }) {
  const rows: Array<[string, React.ReactNode]> = [];

  if (tx.payee.trim()) {
    rows.push([tx.direction === 'income' ? 'Nhận từ' : 'Trả cho', tx.payee]);
  }
  if (tx.paymentMethod) rows.push(['Hình thức', PAYMENT_METHOD_LABEL[tx.paymentMethod]]);
  rows.push(['Danh mục', tx.categoryName ?? 'Chưa phân loại']);
  rows.push(['Người nhập', tx.createdByName]);
  if (tx.deletedAt !== null) rows.push(['Đã xoá lúc', dateTimeLabel(tx.deletedAt)]);
  rows.push([
    'Ghi lúc',
    // Chỉ nói "sửa lúc" khi thực sự có sửa; chênh lệch dưới một giây là do
    // cùng một lần ghi nên không tính.
    tx.updatedAt - tx.createdAt > 1000
      ? `${dateTimeLabel(tx.createdAt)} · sửa ${dateTimeLabel(tx.updatedAt)}`
      : dateTimeLabel(tx.createdAt),
  ]);

  return (
    <div className="tx-details">
      {tx.detail.trim() ? (
        <p className="tx-detail-text">{tx.detail}</p>
      ) : (
        <p className="tx-detail-text muted">Chưa ghi chi tiết cho khoản này.</p>
      )}
      <dl className="tx-detail-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

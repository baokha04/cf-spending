import { useEffect, useMemo, useState } from 'react';
import type { Category, PaymentMethod, Transaction } from '../../shared/types';
import { api } from '../lib/api';
import {
  DIRECTION_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  fullDateLabel,
  money,
} from '../lib/format';

interface Props {
  /** Khoản bị tách. */
  source: Transaction;
  categories: Category[];
  onSplit: () => void;
  onCancel: () => void;
}

/** Số tiền người dùng gõ có thể có dấu phân cách; trả 0 khi chưa gõ gì hợp lệ. */
function parseAmount(raw: string): number {
  const n = Number(raw.replace(/[.,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Vài mốc cắt sẵn hay dùng; bỏ qua mốc nào không chia được thành số nguyên đồng. */
const QUICK_PARTS: Array<{ label: string; of: (total: number) => number }> = [
  { label: '½', of: (t) => Math.floor(t / 2) },
  { label: '⅓', of: (t) => Math.floor(t / 3) },
  { label: '¼', of: (t) => Math.floor(t / 4) },
];

/**
 * Tách một khoản làm hai.
 *
 * Chỉ hỏi những gì thật sự khác nhau giữa hai mảnh — số tiền, nội dung, danh mục,
 * bên nhận, hình thức. Chiều thu/chi, tính chất, ngày và hạn thừa kế khoản gốc:
 * tách là chia nhỏ một sự việc đã xảy ra, nên tổng hai mảnh phải đúng bằng số
 * tiền ban đầu và mọi số liệu tổng hợp giữ nguyên.
 */
export function SplitTransactionForm({ source, categories, onSplit, onCancel }: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(source.note);
  const [payee, setPayee] = useState(source.payee);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(source.paymentMethod ?? '');
  const [categoryId, setCategoryId] = useState(source.categoryId ?? '');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount('');
    setNote(source.note);
    setPayee(source.payee);
    setPaymentMethod(source.paymentMethod ?? '');
    setCategoryId(source.categoryId ?? '');
    setDetail('');
    setError(null);
  }, [source]);

  // Danh mục phải cùng chiều thu/chi với khoản gốc, vì mảnh cắt ra cũng cùng chiều.
  const options = useMemo(
    () => categories.filter((c) => c.kind === source.direction),
    [categories, source.direction],
  );

  const part = parseAmount(amount);
  const remaining = source.amount - part;
  // Phần còn lại phải lớn hơn 0: một giao dịch 0 đồng thì không còn là giao dịch.
  const valid = part > 0 && remaining > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await api.splitTransaction(source.id, {
        amount: part,
        note,
        detail,
        payee,
        paymentMethod: paymentMethod || null,
        categoryId: categoryId || null,
      });
      onSplit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tách được giao dịch');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert error">{error}</div>}

      <div className="split-source">
        <div className="split-source-head">
          <span className="split-source-note">{source.note || '(không ghi chú)'}</span>
          <span className={source.direction === 'income' ? 'income' : 'expense'}>
            {money(source.amount)}
          </span>
        </div>
        <p className="card-sub" style={{ marginBottom: 0 }}>
          {DIRECTION_LABEL[source.direction]} ngày {fullDateLabel(source.occurredOn)} · mảnh cắt ra
          giữ nguyên ngày và chiều thu/chi này
        </p>
      </div>

      <div className="field">
        <label htmlFor="split-amount">Số tiền tách ra (đồng)</label>
        <input
          id="split-amount"
          inputMode="numeric"
          required
          autoFocus
          placeholder="400000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-describedby="split-remaining"
        />
        <div className="expiry-presets">
          {QUICK_PARTS.map((p) => {
            const value = p.of(source.amount);
            return value > 0 ? (
              <button key={p.label} type="button" className="ghost" onClick={() => setAmount(String(value))}>
                {p.label} ({money(value)})
              </button>
            ) : null;
          })}
        </div>
        {/* Nói thẳng khoản gốc còn lại bao nhiêu, ngay lúc đang gõ: đó mới là con
            số người dùng cần thấy để quyết định, chứ không phải phép trừ trong đầu. */}
        <p className="field-hint" id="split-remaining">
          {part <= 0 ? (
            `Khoản gốc đang là ${money(source.amount)}.`
          ) : remaining > 0 ? (
            <>
              Sau khi tách: khoản gốc còn <strong>{money(remaining)}</strong>, khoản mới{' '}
              <strong>{money(part)}</strong>.
            </>
          ) : (
            <span style={{ color: 'var(--critical)' }}>
              Số tiền tách phải nhỏ hơn {money(source.amount)} để khoản gốc còn lại lớn hơn 0.
            </span>
          )}
        </p>
      </div>

      <div className="field">
        <label htmlFor="split-note">Nội dung khoản mới</label>
        <input
          id="split-note"
          maxLength={500}
          placeholder="Phần đồ gia dụng…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="split-category">Danh mục khoản mới</label>
          <select id="split-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Chưa phân loại —</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="split-method">Hình thức</label>
          <select
            id="split-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
          >
            <option value="">— Chưa ghi —</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="split-payee">{source.direction === 'income' ? 'Nhận từ' : 'Trả cho'}</label>
        <input
          id="split-payee"
          maxLength={120}
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="split-detail">Chi tiết khoản mới</label>
        <textarea
          id="split-detail"
          rows={2}
          maxLength={2000}
          placeholder="Vì sao tách, gồm những gì…"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary" disabled={saving || !valid}>
          {saving ? 'Đang tách…' : 'Tách giao dịch'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

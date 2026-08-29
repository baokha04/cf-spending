import { useEffect, useState } from 'react';
import type {
  Category,
  Direction,
  PaymentMethod,
  Recurrence,
  Transaction,
} from '../../shared/types';
import { api } from '../lib/api';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, money, todayISO } from '../lib/format';

/**
 * Từ mức này trở lên, phần chi tiết tự mở sẵn: khoản lớn là thứ vài tháng sau
 * nhìn lại sẽ không nhớ nổi đã chi cho việc gì.
 */
export const LARGE_AMOUNT = 1_000_000;

/** Số tiền người dùng gõ có thể có dấu phân cách — bỏ ra để so với ngưỡng. */
function parseAmount(raw: string): number {
  const n = Number(raw.replace(/[.,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  categories: Category[];
  /** Có giá trị nghĩa là đang sửa; null là thêm mới. */
  editing: Transaction | null;
  onSaved: () => void;
  onCancel?: () => void;
}

/** Một khoản đã ghi sẵn thông tin chi tiết nào chưa? */
function hasDetails(tx: Transaction | null): boolean {
  return Boolean(tx && (tx.detail || tx.payee || tx.paymentMethod));
}

interface FormState {
  occurredOn: string;
  note: string;
  detail: string;
  payee: string;
  paymentMethod: PaymentMethod | '';
  amount: string;
  direction: Direction;
  recurrence: Recurrence;
  categoryId: string;
}

function initialState(editing: Transaction | null): FormState {
  return editing
    ? {
        occurredOn: editing.occurredOn,
        note: editing.note,
        detail: editing.detail,
        payee: editing.payee,
        paymentMethod: editing.paymentMethod ?? '',
        amount: String(editing.amount),
        direction: editing.direction,
        recurrence: editing.recurrence,
        categoryId: editing.categoryId ?? '',
      }
    : {
        occurredOn: todayISO(),
        note: '',
        detail: '',
        payee: '',
        paymentMethod: '',
        amount: '',
        direction: 'expense',
        recurrence: 'one_off',
        categoryId: '',
      };
}

export function TransactionForm({ categories, editing, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Người dùng đã tự bấm mở/đóng phần chi tiết chưa; null nghĩa là để tự quyết.
  const [detailOpen, setDetailOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setForm(initialState(editing));
    setDetailOpen(null);
  }, [editing]);

  const amountValue = parseAmount(form.amount);
  const isLarge = amountValue >= LARGE_AMOUNT;
  const showDetails = detailOpen ?? (isLarge || hasDetails(editing));

  // Danh mục phải cùng chiều thu/chi với giao dịch, nếu không backend sẽ từ chối.
  const options = categories.filter((c) => c.kind === form.direction);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Đổi chiều thu/chi thì danh mục cũ không còn hợp lệ.
      if (key === 'direction' && prev.categoryId) next.categoryId = '';
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      occurredOn: form.occurredOn,
      note: form.note,
      detail: form.detail,
      payee: form.payee,
      paymentMethod: form.paymentMethod || null,
      amount: form.amount,
      direction: form.direction,
      recurrence: form.recurrence,
      categoryId: form.categoryId || null,
    };
    try {
      if (editing) await api.updateTransaction(editing.id, payload);
      else await api.createTransaction(payload);
      if (!editing) setForm(initialState(null));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được giao dịch');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert error">{error}</div>}

      <div className="field">
        <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500 }}>
          Loại giao dịch
        </span>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={form.direction === 'expense'}
            onClick={() => set('direction', 'expense')}
          >
            Chi ra
          </button>
          <button
            type="button"
            aria-pressed={form.direction === 'income'}
            onClick={() => set('direction', 'income')}
          >
            Thu vào
          </button>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="tx-amount">Số tiền (đồng)</label>
          <input
            id="tx-amount"
            inputMode="numeric"
            required
            placeholder="150000"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-date">Ngày</label>
          <input
            id="tx-date"
            type="date"
            required
            value={form.occurredOn}
            onChange={(e) => set('occurredOn', e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="tx-note">Nội dung</label>
        <input
          id="tx-note"
          placeholder="Đi chợ, tiền điện tháng 8…"
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="tx-category">Danh mục</label>
          <select id="tx-category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
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
          <label htmlFor="tx-recurrence">Tính chất</label>
          <select
            id="tx-recurrence"
            value={form.recurrence}
            onChange={(e) => set('recurrence', e.target.value as Recurrence)}
          >
            <option value="one_off">Phát sinh</option>
            <option value="monthly">Hàng tháng (cố định)</option>
          </select>
        </div>
      </div>

      <div className="detail-block">
        <button
          type="button"
          className="ghost detail-toggle"
          aria-expanded={showDetails}
          onClick={() => setDetailOpen(!showDetails)}
        >
          {showDetails ? '▾' : '▸'} Chi tiết khoản này
          {!showDetails && isLarge && <span className="pill warn">Nên ghi</span>}
        </button>
        {showDetails && (
          <>
            {isLarge && !form.detail.trim() && (
              <p className="card-sub" style={{ marginTop: 0 }}>
                Khoản từ {money(LARGE_AMOUNT)} trở lên nên ghi rõ để sau này còn tra lại.
              </p>
            )}
            <div className="field-row">
              <div className="field">
                <label htmlFor="tx-payee">
                  {form.direction === 'income' ? 'Nhận từ' : 'Trả cho'}
                </label>
                <input
                  id="tx-payee"
                  maxLength={120}
                  placeholder={form.direction === 'income' ? 'Công ty ABC…' : 'Cửa hàng, bệnh viện…'}
                  value={form.payee}
                  onChange={(e) => set('payee', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="tx-method">Hình thức</label>
                <select
                  id="tx-method"
                  value={form.paymentMethod}
                  onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod | '')}
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
              <label htmlFor="tx-detail">Chi tiết</label>
              <textarea
                id="tx-detail"
                rows={3}
                maxLength={2000}
                placeholder="Gồm những gì, vì sao chi, đã trả bao nhiêu đợt, giấy tờ kèm theo…"
                value={form.detail}
                onChange={(e) => set('detail', e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm giao dịch'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Huỷ
          </button>
        )}
      </div>
    </form>
  );
}

import { useEffect, useState } from 'react';
import type { Category, Direction, Recurrence, Transaction } from '../../shared/types';
import { api } from '../lib/api';
import { todayISO } from '../lib/format';

interface Props {
  categories: Category[];
  /** Có giá trị nghĩa là đang sửa; null là thêm mới. */
  editing: Transaction | null;
  onSaved: () => void;
  onCancel?: () => void;
}

interface FormState {
  occurredOn: string;
  note: string;
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
        amount: String(editing.amount),
        direction: editing.direction,
        recurrence: editing.recurrence,
        categoryId: editing.categoryId ?? '',
      }
    : {
        occurredOn: todayISO(),
        note: '',
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

  useEffect(() => setForm(initialState(editing)), [editing]);

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

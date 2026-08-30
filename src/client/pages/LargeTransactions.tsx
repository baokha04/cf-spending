import { useCallback, useEffect, useState } from 'react';
import type {
  Direction,
  LargeTransactionGroup,
  LargeTransactionsResponse,
  PaymentMethod,
  Transaction,
} from '../../shared/types';
import { api } from '../lib/api';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  currentMonthISO,
  dateTimeLabel,
  fullDateLabel,
  money,
  monthLabel,
  monthNumberLabel,
  shareLabel,
  shiftMonth,
} from '../lib/format';

/** Các mức ngưỡng dựng sẵn; giá trị tính bằng đồng. */
const THRESHOLDS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const PAGE_SIZE = 10;

interface GroupConfig {
  direction: Direction;
  title: string;
  totalLabel: string;
  emptyLabel: string;
}

const GROUPS: GroupConfig[] = [
  {
    direction: 'expense',
    title: 'Khoản chi lớn',
    totalLabel: 'tổng chi tháng',
    emptyLabel: 'Tháng này không có khoản chi nào vượt ngưỡng.',
  },
  {
    direction: 'income',
    title: 'Khoản thu lớn',
    totalLabel: 'tổng thu tháng',
    emptyLabel: 'Tháng này không có khoản thu nào vượt ngưỡng.',
  },
];

export function LargeTransactions() {
  const [month, setMonth] = useState(currentMonthISO());
  const [threshold, setThreshold] = useState(THRESHOLDS[1]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [data, setData] = useState<LargeTransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.largeTransactions({ month, min: threshold, limit }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách khoản lớn');
    } finally {
      setLoading(false);
    }
  }, [month, threshold, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const thisMonth = currentMonthISO();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Khoản lớn {monthLabel(month)}</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Các khoản thu và chi từ {money(threshold)} trở lên, kèm phần ghi chi tiết.
          </p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="segmented">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}>
              {monthNumberLabel(shiftMonth(month, -1), month)}
            </button>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= thisMonth}
            >
              {monthNumberLabel(shiftMonth(month, 1), month)}
            </button>
          </div>
          <input
            type="month"
            aria-label="Chọn tháng"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            style={{ width: 'auto' }}
          />
          <div className="field">
            <label htmlFor="l-threshold">Từ mức</label>
            <select
              id="l-threshold"
              value={threshold}
              onChange={(e) => {
                setThreshold(Number(e.target.value));
                setLimit(PAGE_SIZE);
              }}
            >
              {THRESHOLDS.map((t) => (
                <option key={t} value={t}>
                  {money(t)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && !data && <div className="card empty">Đang tải…</div>}

      {data &&
        GROUPS.map((group) => (
          <LargeGroup
            key={group.direction}
            config={group}
            group={group.direction === 'expense' ? data.expense : data.income}
            threshold={data.threshold}
            onShowMore={limit < 50 ? () => setLimit(50) : undefined}
            onSaved={() => void load()}
          />
        ))}
    </>
  );
}

function LargeGroup({
  config,
  group,
  threshold,
  onShowMore,
  onSaved,
}: {
  config: GroupConfig;
  group: LargeTransactionGroup;
  threshold: number;
  onShowMore?: () => void;
  onSaved: () => void;
}) {
  return (
    <section className="card">
      <h2 className="card-title">{config.title}</h2>
      <p className="card-sub">
        {group.count} khoản từ {money(threshold)} · tổng {money(group.total)} ·{' '}
        {shareLabel(group.total, group.monthTotal)} {config.totalLabel} ({money(group.monthTotal)})
      </p>

      {group.missingDetail > 0 && (
        <div className="alert info">
          Còn {group.missingDetail} khoản chưa ghi chi tiết. Bổ sung ngay để tháng sau nhìn lại
          còn biết tiền đã đi đâu.
        </div>
      )}

      {group.items.length === 0 ? (
        <p className="empty">{config.emptyLabel}</p>
      ) : (
        <>
          <ul className="large-list">
            {group.items.map((tx) => (
              <LargeItem key={tx.id} tx={tx} monthTotal={group.monthTotal} onSaved={onSaved} />
            ))}
          </ul>
          {/* Danh sách cắt theo `limit`; còn khoản chưa hiện thì cho xem tiếp. */}
          {group.count > group.items.length && onShowMore && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={onShowMore}>
                Xem tất cả {group.count} khoản
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LargeItem({
  tx,
  monthTotal,
  onSaved,
}: {
  tx: Transaction;
  monthTotal: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const share = monthTotal > 0 ? Math.min(100, (tx.amount / monthTotal) * 100) : 0;
  const missing = !tx.detail.trim();

  return (
    <li className={`large-item${missing ? ' missing' : ''}`}>
      <div className="large-head">
        <span className="large-note">
          {tx.note || <span style={{ color: 'var(--text-muted)' }}>(không ghi chú)</span>}
        </span>
        <span className={`large-amount ${tx.direction === 'income' ? 'income' : 'expense'}`}>
          {tx.direction === 'income' ? '+' : '−'}
          {money(tx.amount)}
        </span>
      </div>

      {/* Thanh tỷ trọng cho thấy khoản này chiếm bao nhiêu phần của cả tháng. */}
      <div className="large-bar" aria-hidden="true">
        <span style={{ width: `${share}%` }} />
      </div>

      <div className="large-meta">
        <span>{fullDateLabel(tx.occurredOn)}</span>
        <span className="dot" aria-hidden="true">·</span>
        <span>{tx.categoryName ?? 'Chưa phân loại'}</span>
        <span className="dot" aria-hidden="true">·</span>
        <span>{shareLabel(tx.amount, monthTotal)} của tháng</span>
        {tx.payee.trim() && <span className="pill">{tx.payee}</span>}
        {tx.paymentMethod && <span className="pill">{PAYMENT_METHOD_LABEL[tx.paymentMethod]}</span>}
        {missing && <span className="pill warn">Chưa có chi tiết</span>}
      </div>

      {editing ? (
        <DetailEditor
          tx={tx}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      ) : (
        <>
          {tx.detail.trim() && <p className="large-detail">{tx.detail}</p>}
          <div className="large-actions">
            <span className="large-by">
              {tx.createdByName} · {dateTimeLabel(tx.createdAt)}
            </span>
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              {missing ? 'Bổ sung chi tiết' : 'Sửa chi tiết'}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * Sửa nhanh phần thông tin bổ sung ngay tại danh sách — không phải nhảy sang
 * trang giao dịch chỉ để ghi thêm một dòng cho khoản lớn.
 */
function DetailEditor({
  tx,
  onCancel,
  onSaved,
}: {
  tx: Transaction;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState(tx.detail);
  const [payee, setPayee] = useState(tx.payee);
  const [method, setMethod] = useState<PaymentMethod | ''>(tx.paymentMethod ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateTransaction(tx.id, { detail, payee, paymentMethod: method || null });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được chi tiết');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="large-editor">
      {error && <div className="alert error">{error}</div>}
      <div className="field-row">
        <div className="field">
          <label htmlFor={`payee-${tx.id}`}>{tx.direction === 'income' ? 'Nhận từ' : 'Trả cho'}</label>
          <input
            id={`payee-${tx.id}`}
            maxLength={120}
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`method-${tx.id}`}>Hình thức</label>
          <select
            id={`method-${tx.id}`}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}
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
        <label htmlFor={`detail-${tx.id}`}>Chi tiết</label>
        <textarea
          id={`detail-${tx.id}`}
          rows={3}
          maxLength={2000}
          autoFocus
          placeholder="Gồm những gì, vì sao chi, đã trả bao nhiêu đợt, giấy tờ kèm theo…"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu chi tiết'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

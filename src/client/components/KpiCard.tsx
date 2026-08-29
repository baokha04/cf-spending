import { formatPercent, money, percentChange } from '../lib/format';

interface Props {
  label: string;
  value: number;
  previous: number;
  /** true khi tăng là tin tốt (thu), false khi tăng là tin xấu (chi). */
  increaseIsGood: boolean;
  previousLabel: string;
}

/**
 * Thẻ số liệu: giá trị tháng này kèm mức thay đổi so với tháng trước.
 * Hướng thay đổi luôn có mũi tên + chữ đi cùng, màu chỉ là lớp nhấn thêm.
 */
export function KpiCard({ label, value, previous, increaseIsGood, previousLabel }: Props) {
  const change = percentChange(value, previous);
  const diff = value - previous;
  const rising = diff > 0;
  const tone = diff === 0 ? '' : (rising === increaseIsGood ? 'good' : 'bad');

  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{money(value)}</div>
      <div className={`kpi-delta ${tone}`}>
        {diff === 0 ? (
          <span>Không đổi so với {previousLabel.toLowerCase()}</span>
        ) : (
          <>
            <span className="arrow" aria-hidden="true">{rising ? '▲' : '▼'}</span>
            <span>
              {rising ? 'Tăng' : 'Giảm'} {money(Math.abs(diff))}
              {change !== null ? ` (${formatPercent(change)})` : ''}
            </span>
          </>
        )}
      </div>
      <div className="kpi-delta" style={{ marginTop: 2 }}>
        <span style={{ color: 'var(--text-muted)' }}>
          {previousLabel}: {money(previous)}
        </span>
      </div>
    </div>
  );
}

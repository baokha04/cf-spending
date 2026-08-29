/**
 * Thành phần dùng chung cho biểu đồ.
 *
 * Quy ước màu áp dụng cho toàn bộ dashboard: xanh = tháng hiện tại,
 * cam = tháng trước. Cặp màu này đã qua kiểm tra tách biệt cho người mù màu
 * ở cả nền sáng lẫn nền tối. Chiều thu/chi do nhãn trục mang, không do màu —
 * nhờ vậy người xem chỉ phải học một quy ước duy nhất.
 */
import type { ReactNode } from 'react';
import { money } from '../lib/format';

export const SERIES = {
  current: 'var(--series-current)',
  previous: 'var(--series-previous)',
} as const;

export const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--text-muted)',
} as const;

/** Legend luôn hiện khi có từ 2 chuỗi trở lên — danh tính không bao giờ chỉ dựa vào màu. */
export function Legend({ currentLabel, previousLabel }: { currentLabel: string; previousLabel: string }) {
  return (
    <div className="legend">
      <span className="item">
        <span className="swatch" style={{ background: SERIES.current }} aria-hidden="true" />
        {currentLabel}
      </span>
      <span className="item">
        <span className="swatch" style={{ background: SERIES.previous }} aria-hidden="true" />
        {previousLabel}
      </span>
    </div>
  );
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
}

export function VizTooltip({ active, payload, label, labelFormatter }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="viz-tooltip">
      <div className="t-label">{labelFormatter ? labelFormatter(label ?? '') : label}</div>
      {payload.map((entry) => (
        <div className="t-row" key={String(entry.dataKey)}>
          <span className="swatch" style={{ background: entry.color }} aria-hidden="true" />
          <span>{entry.name}</span>
          <span className="t-val">{money(Number(entry.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

/** Bảng số liệu đi kèm mỗi biểu đồ — kênh đọc thay thế khi màu không dùng được. */
export function TableView({ children }: { children: ReactNode }) {
  return (
    <details className="table-view">
      <summary>Xem dạng bảng</summary>
      <div className="table-scroll">{children}</div>
    </details>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      {children}
    </section>
  );
}

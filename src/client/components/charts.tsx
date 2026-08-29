import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryBreakdownRow, DailyPoint, MonthTotals } from '../../shared/types';
import { money, moneyShort, monthLabel } from '../lib/format';
import { AXIS_STYLE, Legend, SERIES, TableView, VizTooltip } from './viz';

const GRID = 'var(--grid)';
const AXIS_LINE = { stroke: 'var(--axis)' };
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

interface MonthsProps {
  months: { current: string; previous: string };
}

/* ---------------------------------------------- 1. Thu và chi, hai tháng --- */

export function IncomeExpenseChart({
  totals,
  months,
}: MonthsProps & { totals: { current: MonthTotals; previous: MonthTotals } }) {
  const data = [
    { name: 'Thu vào', current: totals.current.income, previous: totals.previous.income },
    { name: 'Chi ra', current: totals.current.expense, previous: totals.previous.expense },
  ];

  return (
    <>
      <Legend currentLabel={monthLabel(months.current)} previousLabel={monthLabel(months.previous)} />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis tickFormatter={moneyShort} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="current" name={monthLabel(months.current)} fill={SERIES.current} radius={BAR_RADIUS} maxBarSize={54} />
          <Bar dataKey="previous" name={monthLabel(months.previous)} fill={SERIES.previous} radius={BAR_RADIUS} maxBarSize={54} />
        </BarChart>
      </ResponsiveContainer>
      <TableView>
        <table>
          <thead>
            <tr>
              <th>Khoản</th>
              <th className="num">{monthLabel(months.current)}</th>
              <th className="num">{monthLabel(months.previous)}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="num">{money(row.current)}</td>
                <td className="num">{money(row.previous)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </>
  );
}

/* ------------------------------- 2. Chi cố định hàng tháng vs phát sinh --- */

export function RecurrenceChart({
  totals,
  months,
}: MonthsProps & { totals: { current: MonthTotals; previous: MonthTotals } }) {
  const data = [
    {
      name: 'Cố định hàng tháng',
      current: totals.current.monthlyExpense,
      previous: totals.previous.monthlyExpense,
    },
    {
      name: 'Phát sinh',
      current: totals.current.oneOffExpense,
      previous: totals.previous.oneOffExpense,
    },
  ];

  return (
    <>
      <Legend currentLabel={monthLabel(months.current)} previousLabel={monthLabel(months.previous)} />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis tickFormatter={moneyShort} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="current" name={monthLabel(months.current)} fill={SERIES.current} radius={BAR_RADIUS} maxBarSize={54} />
          <Bar dataKey="previous" name={monthLabel(months.previous)} fill={SERIES.previous} radius={BAR_RADIUS} maxBarSize={54} />
        </BarChart>
      </ResponsiveContainer>
      <TableView>
        <table>
          <thead>
            <tr>
              <th>Loại chi</th>
              <th className="num">{monthLabel(months.current)}</th>
              <th className="num">{monthLabel(months.previous)}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="num">{money(row.current)}</td>
                <td className="num">{money(row.previous)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </>
  );
}

/* --------------------------------------------------- 3. Chi theo danh mục --- */

const MAX_CATEGORY_BARS = 8;

export function CategoryChart({
  rows,
  months,
}: MonthsProps & { rows: CategoryBreakdownRow[] }) {
  const expenses = rows.filter((r) => r.kind === 'expense' && (r.current > 0 || r.previous > 0));
  // Quá 8 danh mục thì gộp phần đuôi vào "Danh mục khác" thay vì sinh thêm màu.
  const head = expenses.slice(0, MAX_CATEGORY_BARS);
  const tail = expenses.slice(MAX_CATEGORY_BARS);
  const data = [...head];
  if (tail.length > 0) {
    data.push({
      categoryId: null,
      name: `${tail.length} danh mục khác`,
      kind: 'expense',
      current: tail.reduce((s, r) => s + r.current, 0),
      previous: tail.reduce((s, r) => s + r.previous, 0),
      delta: tail.reduce((s, r) => s + r.delta, 0),
    });
  }

  if (data.length === 0) {
    return <p className="empty">Chưa có khoản chi nào trong hai tháng này.</p>;
  }

  return (
    <>
      <Legend currentLabel={monthLabel(months.current)} previousLabel={monthLabel(months.previous)} />
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 46)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          barGap={2}
        >
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tickFormatter={moneyShort} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_STYLE}
            axisLine={AXIS_LINE}
            tickLine={false}
            width={112}
          />
          <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="current" name={monthLabel(months.current)} fill={SERIES.current} radius={[0, 4, 4, 0]} maxBarSize={15} />
          <Bar dataKey="previous" name={monthLabel(months.previous)} fill={SERIES.previous} radius={[0, 4, 4, 0]} maxBarSize={15} />
        </BarChart>
      </ResponsiveContainer>
      <TableView>
        <table>
          <thead>
            <tr>
              <th>Danh mục</th>
              <th className="num">{monthLabel(months.current)}</th>
              <th className="num">{monthLabel(months.previous)}</th>
              <th className="num">Chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="num">{money(row.current)}</td>
                <td className="num">{money(row.previous)}</td>
                <td className="num">
                  {row.delta === 0 ? '—' : `${row.delta > 0 ? '▲ ' : '▼ '}${money(Math.abs(row.delta))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </>
  );
}

/* ------------------------------------------- 4. Lũy kế chi tiêu theo ngày --- */

/** Cộng dồn để so tốc độ chi: đường tháng này nằm trên nghĩa là đang tiêu nhanh hơn. */
function cumulative(points: DailyPoint[]): DailyPoint[] {
  let c = 0;
  let p = 0;
  return points.map((point) => {
    c += point.current;
    p += point.previous;
    return { day: point.day, current: c, previous: p };
  });
}

export function PaceChart({ points, months }: MonthsProps & { points: DailyPoint[] }) {
  const data = cumulative(points);
  const hasData = data.some((d) => d.current > 0 || d.previous > 0);
  if (!hasData) return <p className="empty">Chưa có khoản chi nào để vẽ tốc độ chi tiêu.</p>;

  return (
    <>
      <Legend currentLabel={monthLabel(months.current)} previousLabel={monthLabel(months.previous)} />
      <ResponsiveContainer width="100%" height={230}>
        {/* Chừa lề phải rộng để nhãn ngày cuối tháng không bị cắt. */}
        <LineChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            tick={AXIS_STYLE}
            axisLine={AXIS_LINE}
            tickLine={false}
            interval={4}
            tickFormatter={(d: number) => `Ngày ${d}`}
          />
          <YAxis tickFormatter={moneyShort} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            content={<VizTooltip labelFormatter={(d) => `Tới hết ngày ${d}`} />}
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="current"
            name={monthLabel(months.current)}
            stroke={SERIES.current}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
          />
          <Line
            type="monotone"
            dataKey="previous"
            name={monthLabel(months.previous)}
            stroke={SERIES.previous}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
          />
        </LineChart>
      </ResponsiveContainer>
      <TableView>
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th className="num">Lũy kế {monthLabel(months.current)}</th>
              <th className="num">Lũy kế {monthLabel(months.previous)}</th>
            </tr>
          </thead>
          <tbody>
            {data
              .filter((d) => d.day % 5 === 0 || d.day === data.length)
              .map((row) => (
                <tr key={row.day}>
                  <td>Ngày {row.day}</td>
                  <td className="num">{money(row.current)}</td>
                  <td className="num">{money(row.previous)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableView>
    </>
  );
}

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
import { money, moneyAxisTight, moneyShort, monthLabel } from '../lib/format';
import { useIsPhone } from '../lib/use-media-query';
import { AXIS_STYLE, Legend, SERIES, TableView, VizTooltip } from './viz';

const GRID = 'var(--grid)';
const AXIS_LINE = { stroke: 'var(--axis)' };
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/* Recharts nhận bề rộng trục và chiều cao bằng số nên không đặt được trong
   stylesheet — phải tự chọn theo bề ngang màn hình. Trên iPhone 16 Pro khung
   biểu đồ chỉ còn khoảng 342pt sau khi trừ lề trang và lề thẻ. */
const AXIS_W = { wide: 56, phone: 44 } as const;
const CHART_H = { wide: 230, phone: 200 } as const;

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

  const isPhone = useIsPhone();

  return (
    <>
      <Legend currentLabel={monthLabel(months.current)} previousLabel={monthLabel(months.previous)} />
      <ResponsiveContainer width="100%" height={isPhone ? CHART_H.phone : CHART_H.wide}>
        <BarChart data={data} margin={{ top: isPhone ? 14 : 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis
            tickFormatter={isPhone ? moneyAxisTight : moneyShort}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={isPhone ? AXIS_W.phone : AXIS_W.wide}
          />
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
  const isPhone = useIsPhone();
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
      <ResponsiveContainer width="100%" height={isPhone ? CHART_H.phone : CHART_H.wide}>
        <BarChart data={data} margin={{ top: isPhone ? 14 : 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="name"
            tick={AXIS_STYLE}
            axisLine={AXIS_LINE}
            tickLine={false}
            /* Trục X chỉ rộng bằng nửa khung trên điện thoại; nhãn đầy đủ sẽ bị
               cắt cụt. Bảng số liệu bên dưới vẫn giữ tên gốc. */
            tickFormatter={(name: string) => (isPhone ? name.replace(' hàng tháng', '') : name)}
          />
          <YAxis
            tickFormatter={isPhone ? moneyAxisTight : moneyShort}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={isPhone ? AXIS_W.phone : AXIS_W.wide}
          />
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
  const isPhone = useIsPhone();
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
      <ResponsiveContainer
        width="100%"
        height={Math.max(isPhone ? 180 : 200, data.length * (isPhone ? 42 : 46))}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: isPhone ? 6 : 16, bottom: 4, left: 0 }}
          barGap={2}
        >
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickFormatter={isPhone ? moneyAxisTight : moneyShort}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            /* Ít vạch chia hơn để nhãn tiền không chồng lên nhau ở khung hẹp. */
            tickCount={isPhone ? 4 : 5}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_STYLE}
            axisLine={AXIS_LINE}
            tickLine={false}
            width={isPhone ? 88 : 112}
            /* Cột nhãn hẹp lại thì tên dài phải cắt bớt, nếu không Recharts
               vẽ đè lên vùng cột. Tên đầy đủ vẫn có trong bảng số liệu. */
            tickFormatter={(name: string) =>
              isPhone && name.length > 13 ? `${name.slice(0, 12)}…` : name
            }
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
  const isPhone = useIsPhone();
  const data = cumulative(points);
  const hasData = data.some((d) => d.current > 0 || d.previous > 0);
  if (!hasData) return <p className="empty">Chưa có khoản chi nào để vẽ tốc độ chi tiêu.</p>;

  return (
    <>
      <Legend currentLabel={monthLabel(months.current)} previousLabel={monthLabel(months.previous)} />
      <ResponsiveContainer width="100%" height={isPhone ? CHART_H.phone : CHART_H.wide}>
        {/* Chừa lề phải rộng để nhãn ngày cuối tháng không bị cắt. */}
        <LineChart data={data} margin={{ top: isPhone ? 14 : 8, right: isPhone ? 14 : 28, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            tick={AXIS_STYLE}
            axisLine={AXIS_LINE}
            tickLine={false}
            /* Trục chỉ còn khoảng 280pt trên điện thoại; thưa vạch ra để nhãn
               vẫn giữ được chữ "Ngày" mà không dính vào nhau. */
            interval={isPhone ? 7 : 4}
            tickFormatter={(d: number) => `Ngày ${d}`}
          />
          <YAxis
            tickFormatter={isPhone ? moneyAxisTight : moneyShort}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={isPhone ? AXIS_W.phone : AXIS_W.wide}
          />
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

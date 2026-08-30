import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSummary } from '../../shared/types';
import { api } from '../lib/api';
import { currentMonthISO, money, monthLabel, shiftMonth } from '../lib/format';
import { KpiCard } from '../components/KpiCard';
import { CategoryChart, IncomeExpenseChart, PaceChart, RecurrenceChart } from '../components/charts';
import { ChartCard } from '../components/viz';
import { ExpiryAlert } from '../components/ExpiryAlert';
import { TransactionTable } from '../components/TransactionTable';

export function Dashboard() {
  const [month, setMonth] = useState(currentMonthISO());
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.dashboard(target));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [load, month]);

  const thisMonth = currentMonthISO();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tổng quan {monthLabel(month)}</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            So sánh với {monthLabel(shiftMonth(month, -1)).toLowerCase()}
          </p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="segmented">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}>
              ← Tháng trước
            </button>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= thisMonth}
            >
              Tháng sau →
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
        </div>
      </div>

      {/* Nhắc gia hạn nằm trên cùng: đây là việc phải làm trong tuần này, khác
          với phần còn lại của trang vốn chỉ là số liệu để xem. */}
      <ExpiryAlert onChanged={() => void load(month)} />

      {error && <div className="alert error">{error}</div>}
      {loading && !data && <div className="card empty">Đang tải…</div>}

      {data && (
        <>
          <section className="grid grid-kpi">
            <KpiCard
              label="Tổng thu"
              value={data.totals.current.income}
              previous={data.totals.previous.income}
              increaseIsGood
              previousLabel={monthLabel(data.months.previous)}
            />
            <KpiCard
              label="Tổng chi"
              value={data.totals.current.expense}
              previous={data.totals.previous.expense}
              increaseIsGood={false}
              previousLabel={monthLabel(data.months.previous)}
            />
            <KpiCard
              label="Còn lại (thu − chi)"
              value={data.totals.current.net}
              previous={data.totals.previous.net}
              increaseIsGood
              previousLabel={monthLabel(data.months.previous)}
            />
          </section>

          <div style={{ height: 16 }} />

          <section className="grid grid-2">
            <ChartCard
              title="Thu và chi"
              subtitle={`${monthLabel(data.months.current)} so với ${monthLabel(data.months.previous).toLowerCase()}`}
            >
              <IncomeExpenseChart totals={data.totals} months={data.months} />
            </ChartCard>

            <ChartCard
              title="Chi cố định và chi phát sinh"
              subtitle="Phần cố định là khoản gần như không cắt được; phần phát sinh là chỗ điều chỉnh được"
            >
              <RecurrenceChart totals={data.totals} months={data.months} />
            </ChartCard>
          </section>

          <div style={{ height: 16 }} />

          <section className="grid grid-2">
            <ChartCard title="Chi theo danh mục" subtitle="Xếp theo mức chi tháng này">
              <CategoryChart rows={data.byCategory} months={data.months} />
            </ChartCard>

            <ChartCard
              title="Tốc độ chi tiêu"
              subtitle="Chi lũy kế theo ngày — đường tháng này nằm trên nghĩa là đang tiêu nhanh hơn"
            >
              <PaceChart points={data.dailyExpense} months={data.months} />
            </ChartCard>
          </section>

          <div style={{ height: 16 }} />

          <section className="card">
            <div className="page-head" style={{ marginBottom: 12 }}>
              <div>
                <h2 className="card-title">Giao dịch gần đây</h2>
                <p className="card-sub" style={{ marginBottom: 0 }}>
                  {data.totals.current.count} giao dịch trong {monthLabel(data.months.current).toLowerCase()}
                  {' · '}
                  chi phát sinh {money(data.totals.current.oneOffExpense)}
                </p>
              </div>
              <Link className="navlink" to="/giao-dich">
                Xem tất cả →
              </Link>
            </div>
            <TransactionTable items={data.recent} onChanged={() => void load(month)} compact />
          </section>
        </>
      )}
    </>
  );
}

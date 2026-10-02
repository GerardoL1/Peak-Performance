import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { describeError, get } from '../api/client';
import { fullName, hhmm } from '../api/resources';
import type { Dashboard } from '../api/types';
import { DataTable } from '../components/DataTable';

// One hue for every chart: each chart is a single series, so colour carries no
// identity and the title names what is plotted.
const BAR = '#1a56c4';
const GRID = '#e2e8f0';
const AXIS = { fontSize: 12, fill: '#475569' };

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;

function Kpi({ label, value, detail, to }: { label: string; value: string | number; detail?: string; to?: string }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {detail && <span className="kpi-detail">{detail}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="kpi">
      {body}
    </Link>
  ) : (
    <div className="kpi">{body}</div>
  );
}

function ChartCard({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <figure className="chart-card">
      <figcaption>
        <h2>{title}</h2>
        <p className="muted">{summary}</p>
      </figcaption>
      {/* The summary above states the key numbers for screen-reader users. */}
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={220}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function DashboardPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['/dashboard'],
    queryFn: () => get<Dashboard>('/dashboard'),
  });

  if (isLoading)
    return (
      <p className="loading" role="status">
        Loading dashboard…
      </p>
    );
  if (error || !data)
    return (
      <p className="alert" role="alert">
        {describeError(error)}
      </p>
    );

  const k = data.kpis;
  const trend = k.checkInsPrev7Days
    ? Math.round(((k.checkInsLast7Days - k.checkInsPrev7Days) / k.checkInsPrev7Days) * 100)
    : null;
  const busiestHour = data.checkInsByHour.reduce((a, b) => (b.count > a.count ? b : a));
  const totalCheckIns30 = data.checkInsByDay.reduce((s, d) => s + d.count, 0);
  const reservationsTotal = data.reservationsByStatus.reduce((s, r) => s + r.count, 0);
  const attended = data.reservationsByStatus.find((r) => r.status === 'Attended')?.count ?? 0;
  const cancelled = data.reservationsByStatus.find((r) => r.status === 'Cancelled')?.count ?? 0;
  const tooltip = {
    cursor: { fill: 'rgba(26,86,196,0.08)' },
    contentStyle: { borderRadius: 8, borderColor: GRID, fontSize: 13 },
  };

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="muted">As of {data.today}</span>
      </div>

      <section className="kpi-grid" aria-label="Key numbers">
        <Kpi label="Members" value={k.totalMembers} detail={`+${k.newMembersThisMonth} this month`} to="/members" />
        {k.monthlyRecurringRevenue !== null && (
          <Kpi
            label="Monthly recurring revenue"
            value={money(k.monthlyRecurringRevenue)}
            detail="Sum of members' plan fees"
            to="/plans"
          />
        )}
        <Kpi
          label="Check-ins today"
          value={k.checkInsToday}
          detail={`${k.checkInsLast7Days} in the last 7 days${trend === null ? '' : ` (${trend >= 0 ? '+' : ''}${trend}% vs prior week)`}`}
          to="/checkins"
        />
        <Kpi label="Classes next 7 days" value={k.classesNext7Days} to="/schedule" />
        <Kpi label="Training sessions next 7 days" value={k.trainingNext7Days} to="/training" />
      </section>

      <div className="chart-grid">
        <ChartCard title="Check-ins per day" summary={`${totalCheckIns30} check-ins in the last 30 days.`}>
          <BarChart data={data.checkInsByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip {...tooltip} labelFormatter={(d) => shortDay(String(d))} formatter={(v) => [v, 'Check-ins']} />
            <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Busiest hours"
          summary={
            busiestHour.count
              ? `Peak at ${hourLabel(busiestHour.hour)} (${busiestHour.count} check-ins, last 30 days).`
              : 'No check-ins in the last 30 days.'
          }
        >
          <BarChart
            data={data.checkInsByHour.filter((h) => h.hour >= 5 && h.hour <= 22)}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="hour" tickFormatter={hourLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip {...tooltip} labelFormatter={(h) => hourLabel(Number(h))} formatter={(v) => [v, 'Check-ins']} />
            <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Members by plan" summary={data.planMix.map((p) => `${p.PlanName} ${p.members}`).join(', ')}>
          <BarChart data={data.planMix} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="PlanName" tick={AXIS} tickLine={false} axisLine={false} width={72} />
            <Tooltip
              {...tooltip}
              formatter={(v, _n, item) => {
                const revenue = (item.payload as Dashboard['planMix'][number]).revenue;
                return [revenue === null ? v : `${v} (${money(revenue)}/mo)`, 'Members'];
              }}
            />
            <Bar dataKey="members" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Average class fill"
          summary={
            data.classFill.length
              ? `Fullest: ${data.classFill[0].ClassName} at ${data.classFill[0].avgFillPct}%.`
              : 'No classes scheduled yet.'
          }
        >
          <BarChart data={data.classFill} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="ClassName" tick={AXIS} tickLine={false} axisLine={false} width={96} />
            <Tooltip
              {...tooltip}
              formatter={(v, _n, item) => [
                `${v}% over ${(item.payload as { sessions: number }).sessions} session(s)`,
                'Average fill',
              ]}
            />
            <Bar dataKey="avgFillPct" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ChartCard>
      </div>

      <section className="dashboard-bottom">
        <div>
          <h2 className="section-title">Upcoming classes</h2>
          <DataTable
            caption="Upcoming classes"
            rows={data.upcomingClasses}
            rowKey={(c) => c.ScheduleID}
            empty={
              <>
                No upcoming classes. <Link to="/schedule">Schedule one</Link>.
              </>
            }
            columns={[
              {
                header: 'When',
                cell: (c) => (
                  <span className="nowrap">
                    {c.StartDate} {hhmm(c.StartTime)}
                  </span>
                ),
              },
              { header: 'Class', cell: (c) => <strong>{c.ClassName}</strong> },
              { header: 'Instructor', cell: (c) => fullName(c.StaffFirstName, c.StaffLastName) },
              { header: 'Booked', cell: (c) => `${c.Booked} / ${c.MaxCapacity}` },
            ]}
          />
        </div>
        <div className="card">
          <h2 className="section-title">Reservations</h2>
          <dl className="stat-list">
            {data.reservationsByStatus.map((r) => (
              <div key={r.status}>
                <dt>{r.status}</dt>
                <dd>{r.count}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            {reservationsTotal
              ? `${Math.round((attended / reservationsTotal) * 100)}% attended, ${Math.round((cancelled / reservationsTotal) * 100)}% cancelled.`
              : 'No reservations yet.'}
          </p>
        </div>
      </section>
    </div>
  );
}

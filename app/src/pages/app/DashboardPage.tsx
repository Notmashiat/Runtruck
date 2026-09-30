import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { TODAY, addDays, billableLoads, fmtDate, usd0 } from '../../data/invoicing';
import { between, compactUsd, deliveredRevenue, mondayOf, sum } from '../../data/metrics';
import { ACTIVE_STATUSES } from '../../data/mock';
import { matchesQuery } from '../../lib/search';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DashboardPage() {
  const navigate = useNavigate();
  const { query, loads, drivers, invoices } = useAppShell();
  const unbilled = billableLoads(loads, invoices);
  const driverRows = drivers.filter((d) => !d.archived).map((d) => ({
    id: d.id,
    name: d.name,
    note: d.status === 'On duty' ? `On duty · ${d.hos} left` : d.status,
    dot: d.status === 'On duty' ? 'var(--ui-primary)' : d.status === 'Available' ? 'var(--ui-green)' : 'var(--ui-muted)',
  }));
  const searching = query.trim().length > 0;

  const active = loads.filter((l) => ACTIVE_STATUSES.includes(l.status));
  // A search widens the table to every load; otherwise it is the active set.
  const rows = (searching ? loads.filter((l) => matchesQuery(l, query)) : active).slice(0, 6);

  // Revenue counts on delivery (see data/metrics.ts). This week runs Monday to today.
  const earned = deliveredRevenue(loads, invoices);
  const monday = mondayOf(TODAY);
  const thisWeek = between(earned, monday, TODAY);
  const lastWeek = between(earned, addDays(monday, -7), addDays(monday, -1));
  const weekMiles = sum(thisWeek, 'miles');
  const chart = [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const date = addDays(TODAY, -back);
    return { date, day: WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()], total: sum(between(earned, date, date)) };
  });
  const top = Math.max(1, ...chart.map((c) => c.total));
  const countOf = (status: string) => active.filter((l) => l.status === status).length;

  const kpis = [
    { label: 'Active loads', value: String(active.length), note: `${countOf('In transit')} in transit · ${countOf('Needs driver')} need a driver`, onClick: () => navigate('/app/loads') },
    { label: 'Revenue this week', value: compactUsd(sum(thisWeek)), note: `${thisWeek.length} deliveries since Mon · last week ${compactUsd(sum(lastWeek))}`, onClick: () => navigate('/app/accounting/invoiced') },
    { label: 'Rate per mile', value: weekMiles ? `$${(sum(thisWeek) / weekMiles).toFixed(2)}` : '—', note: `${weekMiles.toLocaleString('en-US')} loaded miles delivered this week`, onClick: () => navigate('/app/loads') },
    { label: 'Unbilled loads', value: String(unbilled.length), note: `${usd0(unbilled.reduce((s, l) => s + l.amount, 0))} waiting`, onClick: () => navigate('/app/accounting/uninvoiced') },
  ];

  return (
    <>
      <Kpis items={kpis} />

      <div className="ui-grid-2">
        <Card title="Active loads" flush action={<Link className="ui-link" to="/app/loads">View all</Link>}>
          <table className="ui-table">
            <thead>
              <tr>
                <th>Load</th><th>Customer</th><th>Route</th><th className="num">Rate</th><th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="is-clickable" onClick={() => navigate(`/app/loads/${l.id}`)}>
                  <td className="strong">{l.id}</td>
                  <td>{l.customer}</td>
                  <td className="muted">{l.route}</td>
                  <td className="num">{l.rate}</td>
                  <td className="num"><Tag label={l.status} tagClass={l.tagClass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card title="Revenue delivered, last 7 days" action={<span style={{ fontSize: 13, color: 'var(--ui-muted)' }}>{usd0(chart.reduce((n, c) => n + c.total, 0))} total</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chart.length}, minmax(0, 1fr))`, gap: 10 }}>
              {chart.map((c) => (
                <div key={c.date} title={`${fmtDate(c.date)} · ${usd0(c.total)}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ui-text-2)', fontVariantNumeric: 'tabular-nums' }}>{c.total ? compactUsd(c.total) : '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', height: 110 }}>
                    <div style={{ width: '100%', height: `${Math.max(2, Math.round((c.total / top) * 100))}%`, background: c.total === top ? 'var(--ui-primary)' : 'var(--ui-primary-soft)', borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ui-muted)' }}>{c.day}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Drivers">
            {driverRows.map((d, i) => (
              <div
                key={d.id}
                onClick={() => navigate('/app/fleet/drivers')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--ui-border)' : 0, cursor: 'pointer' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 999, background: d.dot, flex: 'none' }} />
                <div style={{ flex: 1, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ui-muted)' }}>{d.note}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

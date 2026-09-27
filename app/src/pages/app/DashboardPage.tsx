import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { dollars, money, UNINVOICED } from '../../data/accounting';
import { ACTIVE_STATUSES, DRIVERS, LOADS, REVENUE_BARS, REVENUE_DAYS } from '../../data/mock';
import { matchesQuery } from '../../lib/search';

const MAX_BAR = Math.max(...REVENUE_BARS);
const CHART = REVENUE_BARS.map((v, i) => ({
  day: REVENUE_DAYS[i],
  h: `${Math.round((v / MAX_BAR) * 100)}%`,
  fill: v === MAX_BAR ? 'var(--ui-primary)' : 'var(--ui-primary-soft)',
}));

const DRIVER_ROWS = DRIVERS.map((d) => ({
  name: d.name,
  note: d.status === 'On duty' ? `On duty · ${d.hos} left` : d.status,
  dot: d.status === 'On duty' ? 'var(--ui-primary)' : d.status === 'Available' ? 'var(--ui-green)' : 'var(--ui-muted)',
}));

export function DashboardPage() {
  const navigate = useNavigate();
  const { query } = useAppShell();
  const searching = query.trim().length > 0;

  const active = LOADS.filter((l) => ACTIVE_STATUSES.includes(l.status));
  // A search widens the table to every load; otherwise it is the active set.
  const rows = (searching ? LOADS.filter((l) => matchesQuery(l, query)) : active).slice(0, 6);

  const kpis = [
    { label: 'Active loads', value: String(active.length), note: '+4 vs. last week', onClick: () => navigate('/app/loads') },
    { label: 'Revenue this week', value: '$168K', note: '+9.2%', onClick: () => navigate('/app/accounting/invoiced') },
    { label: 'Deadhead miles', value: '7.8%', note: '1.4 pts better', onClick: () => navigate('/app/fleet/trucks') },
    { label: 'Unbilled loads', value: String(UNINVOICED.length), note: `${money(UNINVOICED.reduce((s, l) => s + dollars(l.amount), 0))} waiting`, onClick: () => navigate('/app/accounting/uninvoiced') },
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
          <Card title="Revenue, last 7 days">
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${CHART.length}, minmax(0, 1fr))`, gap: 10 }}>
              {CHART.map((c) => (
                <div key={c.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', height: 120 }}>
                    <div style={{ width: '100%', height: c.h, background: c.fill, borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ui-muted)' }}>{c.day}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Drivers">
            {DRIVER_ROWS.map((d, i) => (
              <div
                key={d.name}
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

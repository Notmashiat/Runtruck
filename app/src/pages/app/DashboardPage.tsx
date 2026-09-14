import { useNavigate } from 'react-router-dom';
import { Blueprint } from '../../components/Blueprint';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { ACTIVE_STATUSES, DRIVERS, LOADS, REVENUE_BARS, REVENUE_DAYS } from '../../data/mock';

function matches(l: (typeof LOADS)[number], q: string) {
  return `${l.id} ${l.customer} ${l.route} ${l.driver}`.toLowerCase().includes(q);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { query } = useAppShell();
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const kpis = [
    { label: 'Active loads', value: String(LOADS.filter((l) => ACTIVE_STATUSES.includes(l.status)).length), delta: '+4 vs. last week', go: () => navigate('/app/loads') },
    { label: 'Revenue this week', value: '$168K', delta: '+9.2%', go: () => navigate('/app/invoices') },
    { label: 'Deadhead miles', value: '7.8%', delta: '1.4 pts better', go: () => navigate('/app/trucks') },
    { label: 'Unbilled loads', value: '11', delta: '$34,900 waiting', go: () => navigate('/app/invoices') },
  ];

  const activeLoads = (searching ? LOADS.filter((l) => matches(l, q)) : LOADS.filter((l) => ACTIVE_STATUSES.includes(l.status))).slice(0, 6);

  const max = Math.max(...REVENUE_BARS);
  const chart = REVENUE_BARS.map((v, i) => ({
    day: REVENUE_DAYS[i],
    h: `${Math.round((v / max) * 100)}%`,
    fill: v === max ? 'var(--color-accent)' : 'var(--color-accent-300)',
  }));

  const driverDots = DRIVERS.map((d) => ({
    name: d.name,
    note: d.status === 'On duty' ? `On duty · ${d.hos} left` : d.status,
    dot: d.status === 'On duty' ? 'var(--color-accent)' : d.status === 'Available' ? 'var(--color-neutral-400)' : 'var(--color-neutral-300)',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <Blueprint style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', background: 'var(--color-neutral-100)' }}>
        {kpis.map((k) => (
          <div key={k.label} onClick={k.go} style={{ padding: '22px 24px', borderRight: '1px solid var(--color-divider)', cursor: 'pointer' }}>
            <div className="lbl" style={{ color: 'var(--color-neutral-600)' }}>{k.label}</div>
            <div className="num" style={{ fontSize: 46, lineHeight: 1, marginTop: 14 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-accent-700)', marginTop: 8 }}>{k.delta}</div>
          </div>
        ))}
      </Blueprint>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 40, alignItems: 'start' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sect" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h4 style={{ fontSize: 19 }}>Active loads</h4>
            <div style={{ flex: 1 }} />
            <div onClick={() => navigate('/app/loads')} className="lbl" style={{ color: 'var(--color-accent-700)', cursor: 'pointer' }}>View all</div>
          </div>
          <div style={{ minWidth: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Load</th><th>Customer</th><th>Route</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Status</th></tr>
              </thead>
              <tbody>
                {activeLoads.map((al) => (
                  <tr key={al.id} onClick={() => navigate(`/app/loads/${al.id}`)} className="row-link">
                    <td className="num" style={{ fontSize: 14 }}>{al.id}</td>
                    <td>{al.customer}</td>
                    <td style={{ color: 'var(--color-neutral-700)' }}>{al.route}</td>
                    <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{al.rate}</td>
                    <td style={{ textAlign: 'right' }}><Tag label={al.status} tagClass={al.tagClass} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="sect"><h4 style={{ fontSize: 19 }}>Revenue, last 7 days</h4></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 132 }}>
              {chart.map((c) => (
                <div key={c.day} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: '100%', height: c.h, background: c.fill }} />
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{c.day}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="sect"><h4 style={{ fontSize: 19 }}>Drivers</h4></div>
            {driverDots.map((d) => (
              <div key={d.name} onClick={() => navigate('/app/drivers')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14, cursor: 'pointer' }}>
                <div style={{ width: 8, height: 8, background: d.dot, flex: 'none' }} />
                <div style={{ flex: 1 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{d.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

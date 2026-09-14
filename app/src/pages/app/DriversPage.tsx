import { Blueprint } from '../../components/Blueprint';
import { Tag } from '../../components/Tag';
import { useAppShell, type DriverTab } from '../../context/AppShellContext';
import { COMPLIANCE, DRIVERS } from '../../data/mock';

const TABS: DriverTab[] = ['All', 'On duty', 'Available'];

export function DriversPage() {
  const { driverTab, setDriverTab } = useAppShell();

  let driverRows = DRIVERS;
  if (driverTab === 'On duty') driverRows = DRIVERS.filter((d) => d.status === 'On duty');
  if (driverTab === 'Available') driverRows = DRIVERS.filter((d) => d.status === 'Available');

  const driverKpis = [
    { label: 'On the roster', value: String(DRIVERS.length), delta: '1 in orientation' },
    { label: 'Available now', value: String(DRIVERS.filter((d) => d.status === 'Available').length), delta: 'Both reset today' },
    { label: 'Hours at risk', value: '1', delta: 'Nakamura · 1h 45m' },
    { label: 'Docs expiring', value: '2', delta: 'Within 60 days' },
  ];

  const maxMiles = Math.max(...DRIVERS.map((d) => d.miles));
  const driverMiles = DRIVERS.map((d) => ({
    name: d.name,
    miles: d.miles.toLocaleString(),
    w: `${Math.round((d.miles / maxMiles) * 100)}%`,
    fill: d.miles === maxMiles ? 'var(--color-accent)' : 'var(--color-accent-300)',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="seg">
          {TABS.map((t) => (
            <label key={t} className="seg-opt" onClick={() => setDriverTab(t)}>
              <input type="radio" name="drvtab" readOnly checked={driverTab === t} />
              {t}
            </label>
          ))}
        </div>
      </div>

      <Blueprint style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', background: 'var(--color-neutral-100)' }}>
        {driverKpis.map((k) => (
          <div key={k.label} style={{ padding: '20px 24px', borderRight: '1px solid var(--color-divider)' }}>
            <div className="lbl" style={{ color: 'var(--color-neutral-600)' }}>{k.label}</div>
            <div className="num" style={{ fontSize: 40, lineHeight: 1, marginTop: 12 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-accent-700)', marginTop: 8 }}>{k.delta}</div>
          </div>
        ))}
      </Blueprint>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sect"><h4 style={{ fontSize: 19 }}>Roster</h4></div>
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Driver</th><th>Status</th><th>Unit</th><th>Current load</th>
                <th style={{ textAlign: 'right' }}>Hours left</th><th style={{ textAlign: 'right' }}>CDL</th><th style={{ textAlign: 'right' }}>Pay YTD</th>
              </tr>
            </thead>
            <tbody>
              {driverRows.map((d) => (
                <tr key={d.name}>
                  <td style={{ fontWeight: 500 }}>{d.name}</td>
                  <td><Tag label={d.status} tagClass={d.tagClass} /></td>
                  <td className="num" style={{ fontSize: 14 }}>{d.unit}</td>
                  <td style={{ color: 'var(--color-neutral-700)' }}>{d.load}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{d.hos}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{d.cdl}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{d.pay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 40, alignItems: 'start' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sect"><h4 style={{ fontSize: 19 }}>Compliance watchlist</h4></div>
          {COMPLIANCE.map((c) => (
            <div key={c.name + c.item} style={{ display: 'flex', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
              <div style={{ width: 150, fontWeight: 500 }}>{c.name}</div>
              <div style={{ flex: 1, color: 'var(--color-neutral-700)' }}>{c.item}</div>
              <div className="num" style={{ fontSize: 15 }}>{c.due}</div>
            </div>
          ))}
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sect"><h4 style={{ fontSize: 19 }}>Miles per driver, this week</h4></div>
          {driverMiles.map((m) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', fontSize: 14 }}>
              <div style={{ width: 132 }}>{m.name}</div>
              <div style={{ flex: 1, height: 14, background: 'var(--color-neutral-200)' }}>
                <div style={{ height: '100%', width: m.w, background: m.fill }} />
              </div>
              <div className="num" style={{ width: 58, textAlign: 'right', fontSize: 15 }}>{m.miles}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

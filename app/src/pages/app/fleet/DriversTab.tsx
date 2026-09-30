import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/Card';
import { DriverDialog } from '../../../components/FleetDialogs';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell, type DriverTab } from '../../../context/AppShellContext';
import { WATCHLIST, type FleetDriver } from '../../../data/fleet';
import { matchesQuery } from '../../../lib/search';

const TABS: DriverTab[] = ['All', 'On duty', 'Available'];

// '6h 20m' → 6.33. A driver off the clock ('—') is never at risk.
function hoursLeft(hos: string): number {
  const [h, m] = hos.split(' ').map((p) => parseInt(p, 10));
  return Number.isNaN(h) ? Infinity : h + (m || 0) / 60;
}

export function DriversTab() {
  const { query, driverTab, setDriverTab, drivers } = useAppShell();
  const [editing, setEditing] = useState<FleetDriver | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = drivers.filter((d) => !d.archived);
  const archivedCount = drivers.length - active.length;
  const onDuty = active.filter((d) => d.status === 'On duty');
  const available = active.filter((d) => d.status === 'Available');
  const atRisk = onDuty.filter((d) => hoursLeft(d.hos) < 2);
  const maxMiles = Math.max(1, ...active.map((d) => d.miles));
  const totalMiles = active.reduce((sum, d) => sum + d.miles, 0);

  const kpis = [
    { label: 'On the roster', value: String(active.length), note: `${onDuty.length} on duty · ${active.length - onDuty.length - available.length} off` },
    { label: 'Available now', value: String(available.length), note: available.map((d) => d.name.split(' ')[0]).join(', ') || 'Nobody free' },
    { label: 'Hours at risk', value: String(atRisk.length), note: atRisk.map((d) => `${d.name.split(' ').at(-1)} · ${d.hos}`).join(', ') || 'Nobody under 2h' },
    { label: 'Docs to renew', value: String(WATCHLIST.length), note: 'On the watchlist below' },
  ];

  const rows = (showArchived ? drivers : active).filter(
    (d) => (driverTab === 'All' || d.status === driverTab) && matchesQuery({ ...d, ...d.details }, query),
  );

  const action = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {archivedCount > 0 && (
        <label className="ui-check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archivedCount})
        </label>
      )}
      <div className="ui-filter">
        {TABS.map((t) => (
          <button key={t} type="button" className={`ui-filter-opt${driverTab === t ? ' is-active' : ''}`} onClick={() => setDriverTab(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Roster" flush action={action}>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Driver</th><th>Status</th><th>Unit</th><th>Current load</th>
              <th className="num">Hours left</th><th className="num">CDL</th><th className="num">Pay YTD</th><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={d.archived ? 'is-archived' : ''}>
                <td className="strong">{d.name}</td>
                <td>{d.archived ? <Tag label="Archived" tagClass="tag-neutral" /> : <Tag label={d.status} tagClass={d.tagClass} />}</td>
                <td>{d.unit}</td>
                <td className="muted">{d.load}</td>
                <td className="num">{d.hos}</td>
                <td className="num">{d.cdl}</td>
                <td className="num">{d.pay}</td>
                <td className="num"><button type="button" className="ui-link" onClick={() => setEditing(d)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{query ? `Nothing matches “${query}”.` : 'No drivers in this view.'}</div>}
      </Card>

      <div className="ui-grid-2">
        <Card title="Miles per driver, this week" action={<span style={{ fontSize: 13, color: 'var(--ui-muted)' }}>{totalMiles.toLocaleString()} mi total</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {active.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 132, flex: 'none' }}>{d.name}</div>
                <div className="ui-bar-track" style={{ flex: 1 }}>
                  <div className="ui-bar-fill" style={{ width: `${Math.round((d.miles / maxMiles) * 100)}%`, opacity: d.miles === maxMiles ? 1 : 0.55 }} />
                </div>
                <div style={{ width: 58, flex: 'none', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.miles.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Compliance watchlist" flush action={<Link className="ui-link" to="/app/safety/driver-documents">All documents →</Link>}>
          <table className="ui-table">
            <thead>
              <tr><th>Driver</th><th>Item</th><th className="num">Due</th></tr>
            </thead>
            <tbody>
              {WATCHLIST.map((c) => (
                <tr key={c.name + c.item}>
                  <td className="strong">{c.name}</td>
                  <td className="muted">{c.item}</td>
                  <td className="num">{c.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {editing && <DriverDialog driver={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

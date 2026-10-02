import { useState } from 'react';
import { Card } from '../../../components/Card';
import { TruckDialog } from '../../../components/FleetDialogs';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import type { FleetTruck } from '../../../data/fleet';
import { matchesQuery } from '../../../lib/search';
import { numberOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { usePaged } from '../../../lib/paging';

// Odometer and service readings are display strings: '528,900' → 528900.
const miles = (s: string) => Number(s.replace(/,/g, '')) || 0;

export function TrucksTab() {
  const { query, trucks } = useAppShell();
  const [editing, setEditing] = useState<FleetTruck | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = trucks.filter((t) => !t.archived);
  const archivedCount = trucks.length - active.length;
  const inService = active.filter((t) => t.status === 'In service');
  const inShop = active.filter((t) => t.status === 'In shop');
  const serviceDue = active.filter((t) => t.status === 'Service due');
  const avgOdo = active.length ? active.reduce((sum, t) => sum + miles(t.odo), 0) / active.length : 0;

  const kpis = [
    { label: 'Power units', value: String(active.length), note: `Avg ${Math.round(avgOdo / 1000)}K mi` },
    { label: 'In service', value: String(inService.length), note: `Of ${active.length} units` },
    { label: 'In shop', value: String(inShop.length), note: inShop.map((t) => t.unit).join(', ') || 'Bays clear' },
    {
      label: 'Service due', value: String(serviceDue.length),
      note: serviceDue.map((t) => (t.service === '—' ? t.unit : `${t.unit} in ${Math.max(0, miles(t.service) - miles(t.odo)).toLocaleString()} mi`)).join(', ') || 'Nothing due',
    },
  ];

  const tv = (t: FleetTruck, k: string) => (typeof t.details[k] === 'string' ? (t.details[k] as string) : '');
  const filters: FilterDef<FleetTruck>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (t) => (t.archived ? 'Archived' : t.status) },
    { key: 'make', label: 'Make', type: 'select', get: (t) => tv(t, 'make') },
    { key: 'ownership', label: 'Ownership', type: 'select', get: (t) => tv(t, 'ownership') },
    { key: 'terminal', label: 'Home terminal', type: 'select', get: (t) => tv(t, 'terminal') },
    { key: 'fuel', label: 'Fuel', type: 'select', get: (t) => tv(t, 'fuel') },
    { key: 'assigned', label: 'Driver', type: 'select', get: (t) => (t.driver === 'Unassigned' ? 'No driver' : 'Has a driver') },
    { key: 'year', label: 'Model year', type: 'range', get: (t) => numberOf(tv(t, 'year')) },
    { key: 'odo', label: 'Odometer', type: 'range', get: (t) => numberOf(t.odo), suffix: ' mi' },
    { key: 'toService', label: 'Miles to next service', type: 'range', get: (t) => (numberOf(t.service) !== null && numberOf(t.odo) !== null ? (numberOf(t.service) as number) - (numberOf(t.odo) as number) : null), suffix: ' mi' },
  ];
  const sort = useSort(usePageFilters((showArchived ? trucks : active).filter((t) => matchesQuery({ ...t, ...t.details }, query)), filters), {
    driver: (t) => (t.driver === 'Unassigned' ? null : t.driver),
  });
  const rows = sort.rows;
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows);

  const action = archivedCount > 0 && (
    <label className="ui-check">
      <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      Show archived ({archivedCount})
    </label>
  );

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Power units" flush action={action || undefined}>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="make">Make / year</SortTh><SortTh sort={sort} k="plate">Plate</SortTh><SortTh sort={sort} k="driver">Assigned to</SortTh>
              <SortTh sort={sort} k="odo" num>Odometer</SortTh><SortTh sort={sort} k="service" num>Next service</SortTh><SortTh sort={sort} k="status" num>Status</SortTh><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((t) => (
              <tr key={t.id} className={t.archived ? 'is-archived' : ''}>
                <td className="strong">{t.unit}</td>
                <td>{t.make}</td>
                <td className="muted">{t.plate}</td>
                <td>{t.driver}</td>
                <td className="num">{t.odo}</td>
                <td className="num">{t.service}</td>
                <td className="num">{t.archived ? <Tag label="Archived" tagClass="tag-neutral" /> : <Tag label={t.status} tagClass={t.tagClass} />}</td>
                <td className="num"><button type="button" className="ui-link" onClick={() => setEditing(t)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">{trucks.length ? 'Nothing matches the search or filters.' : 'No units yet.'}</div>}
      </Card>

      {editing && <TruckDialog truck={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

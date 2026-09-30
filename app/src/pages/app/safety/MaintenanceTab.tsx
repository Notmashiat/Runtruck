import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { MAINTENANCE, money, type WorkOrder } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

const OPEN = MAINTENANCE.filter((w) => w.status !== 'Done');
const IN_SHOP = MAINTENANCE.filter((w) => w.status === 'In shop');
const OVERDUE = MAINTENANCE.filter((w) => w.status === 'Overdue');

const KPIS = [
  { label: 'Open work orders', value: String(OPEN.length), note: `${MAINTENANCE.length - OPEN.length} done · last 30 d` },
  { label: 'In shop', value: String(IN_SHOP.length), note: [...new Set(IN_SHOP.map((w) => w.shop))].join(', ') || 'None' },
  { label: 'Overdue', value: String(OVERDUE.length), note: OVERDUE.map((w) => `${w.unit} · ${w.item}`).join(', ') || 'None' },
  { label: 'Est. cost open', value: money(OPEN.reduce((sum, w) => sum + w.estimate, 0)), note: 'Parts & labor, open orders' },
];

const FILTERS: FilterDef<WorkOrder>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (w) => w.status, options: ['Overdue', 'In shop', 'Due', 'Scheduled', 'Done'] },
  { key: 'shop', label: 'Shop', type: 'select', get: (w) => w.shop },
  { key: 'unit', label: 'Unit', type: 'select', get: (w) => w.unit },
  { key: 'kind', label: 'Equipment', type: 'select', get: (w) => (w.unit.startsWith('T-') ? 'Truck' : 'Trailer') },
  { key: 'due', label: 'Due date', type: 'dates', get: (w) => isoOf(w.due) },
  { key: 'estimate', label: 'Estimate', type: 'range', get: (w) => w.estimate, prefix: '$' },
];

export function MaintenanceTab() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(MAINTENANCE.filter((w) => matchesQuery(w, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Work orders" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="item">Item</SortTh><SortTh sort={sort} k="due">Due</SortTh><SortTh sort={sort} k="shop">Shop</SortTh><SortTh sort={sort} k="estimate" num>Estimate</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={`${w.unit} ${w.item}`}>
                <td className="strong">{w.unit}</td>
                <td>{w.item}</td>
                <td>{w.due}</td>
                <td className="muted">{w.shop}</td>
                <td className="num">{money(w.estimate)}</td>
                <td className="num"><Tag label={w.status} tagClass={w.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

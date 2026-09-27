import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { MAINTENANCE, money } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';

const OPEN = MAINTENANCE.filter((w) => w.status !== 'Done');
const IN_SHOP = MAINTENANCE.filter((w) => w.status === 'In shop');
const OVERDUE = MAINTENANCE.filter((w) => w.status === 'Overdue');

const KPIS = [
  { label: 'Open work orders', value: String(OPEN.length), note: `${MAINTENANCE.length - OPEN.length} done · last 30 d` },
  { label: 'In shop', value: String(IN_SHOP.length), note: [...new Set(IN_SHOP.map((w) => w.shop))].join(', ') || 'None' },
  { label: 'Overdue', value: String(OVERDUE.length), note: OVERDUE.map((w) => `${w.unit} · ${w.item}`).join(', ') || 'None' },
  { label: 'Est. cost open', value: money(OPEN.reduce((sum, w) => sum + w.estimate, 0)), note: 'Parts & labor, open orders' },
];

export function MaintenanceTab() {
  const { query } = useAppShell();
  const rows = MAINTENANCE.filter((w) => matchesQuery(w, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Work orders" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Unit</th><th>Item</th><th>Due</th><th>Shop</th><th className="num">Estimate</th><th className="num">Status</th>
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
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

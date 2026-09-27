import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { daysBetween, dollars, money, TODAY, UNINVOICED } from '../../../data/accounting';
import { matchesQuery } from '../../../lib/search';

const waiting = UNINVOICED.reduce((sum, l) => sum + dollars(l.amount), 0);
const missingPod = UNINVOICED.filter((l) => l.pod === 'Missing').length;
const customers = new Set(UNINVOICED.map((l) => l.customer)).size;
const oldest = UNINVOICED.reduce((best, l) => (daysBetween(l.delivered, TODAY) > daysBetween(best.delivered, TODAY) ? l : best), UNINVOICED[0]);

const KPIS = [
  { label: 'Loads', value: String(UNINVOICED.length), note: 'Delivered, not yet invoiced' },
  { label: 'Amount waiting', value: money(waiting), note: `Across ${customers} customers` },
  { label: 'Missing POD', value: String(missingPod), note: 'Cannot invoice until attached' },
  { label: 'Oldest (days)', value: String(daysBetween(oldest.delivered, TODAY)), note: `${oldest.id} · delivered ${oldest.delivered}` },
];

export function UninvoicedTab() {
  const { query } = useAppShell();
  const rows = UNINVOICED.filter((l) => matchesQuery(l, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Delivered, not yet invoiced" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Load</th><th>Customer</th><th>Route</th><th>Delivered</th><th>POD</th><th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="strong">{l.id}</td>
                <td>{l.customer}</td>
                <td className="muted">{l.route}</td>
                <td>{l.delivered}</td>
                <td><Tag label={l.pod} tagClass={l.tagClass} /></td>
                <td className="num">{l.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

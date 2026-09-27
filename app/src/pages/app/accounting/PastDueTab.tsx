import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { ageDays, ALL_INVOICES, dollars, money } from '../../../data/accounting';
import { CUSTOMERS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';

// Oldest first: that is the order collections works them in.
const OVERDUE = ALL_INVOICES.filter((i) => i.status === 'Overdue').sort((a, b) => ageDays(b.age) - ageDays(a.age));
const overdueTotal = OVERDUE.reduce((sum, i) => sum + dollars(i.amount), 0);
const inCollections = OVERDUE.filter((i) => ageDays(i.age) > 60).length;
const accounts = new Set(OVERDUE.map((i) => i.customer)).size;
const oldest = OVERDUE[0];

const KPIS = [
  { label: 'Overdue invoices', value: String(OVERDUE.length), note: 'Past terms' },
  { label: 'Amount overdue', value: money(overdueTotal), note: `${inCollections} in collections (60+ days)` },
  { label: 'Oldest', value: oldest.age, note: `${oldest.id} · ${oldest.customer}` },
  { label: 'Accounts affected', value: String(accounts), note: `of ${CUSTOMERS.length} accounts` },
];

export function PastDueTab() {
  const { query } = useAppShell();
  const rows = OVERDUE.filter((i) => matchesQuery(i, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Past due" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Invoice</th><th>Customer</th><th>Load</th><th>Issued</th>
              <th className="num">Amount</th><th className="num">Age</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="strong">{i.id}</td>
                <td>{i.customer}</td>
                <td className="muted">{i.load}</td>
                <td>{i.issued}</td>
                <td className="num">{i.amount}</td>
                <td className="num">{i.age}</td>
                <td className="num"><Tag label={i.status} tagClass={i.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

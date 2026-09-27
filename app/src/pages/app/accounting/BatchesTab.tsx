import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { BATCHES, daysBetween, dollars, money, TODAY } from '../../../data/accounting';
import { matchesQuery } from '../../../lib/search';

const ready = BATCHES.filter((b) => b.status === 'Ready');
const sentThisWeek = BATCHES.filter((b) => b.status === 'Sent' && daysBetween(b.created, TODAY) < 7);
const invoiceCount = BATCHES.reduce((n, b) => n + b.invoices, 0);
const readyTotal = ready.reduce((sum, b) => sum + dollars(b.total), 0);
const batchedTotal = BATCHES.reduce((sum, b) => sum + dollars(b.total), 0);

const KPIS = [
  { label: 'Batches', value: String(BATCHES.length), note: `${invoiceCount} invoices` },
  { label: 'Ready to send', value: String(ready.length), note: `${money(readyTotal)} to go out` },
  { label: 'Sent this week', value: String(sentThisWeek.length), note: 'Last 7 days' },
  { label: 'Total batched', value: money(batchedTotal), note: 'Ready, sent and settled' },
];

export function BatchesTab() {
  const { query } = useAppShell();
  const rows = BATCHES.filter((b) => matchesQuery(b, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Invoice batches" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Batch</th><th>Created</th><th className="num">Invoices</th><th>Sent to</th>
              <th className="num">Total</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="strong">{b.id}</td>
                <td>{b.created}</td>
                <td className="num">{b.invoices}</td>
                <td className="muted">{b.sentTo}</td>
                <td className="num">{b.total}</td>
                <td className="num"><Tag label={b.status} tagClass={b.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

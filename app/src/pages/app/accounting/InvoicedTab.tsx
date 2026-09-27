import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { ageDays, ALL_INVOICES } from '../../../data/accounting';
import { AR } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';

// Sent and not yet paid, newest first.
const OPEN = ALL_INVOICES.filter((i) => i.status === 'Sent').sort((a, b) => ageDays(a.age) - ageDays(b.age));

export function InvoicedTab() {
  const { query } = useAppShell();
  const rows = OPEN.filter((i) => matchesQuery(i, query));

  return (
    <>
      <Kpis items={AR} />

      <Card title="Open invoices" flush>
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

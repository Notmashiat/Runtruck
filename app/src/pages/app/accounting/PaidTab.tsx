import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { ALL_INVOICES, daysBetween, dollars, money, PAYMENTS, TODAY } from '../../../data/accounting';
import { matchesQuery } from '../../../lib/search';

// Paid invoices joined with how they were settled, most recently paid first.
const PAID = ALL_INVOICES.filter((i) => i.status === 'Paid')
  .map((i) => {
    const p = PAYMENTS[i.id];
    return { ...i, paid: p?.paid ?? '—', via: p?.via ?? '—', days: p ? daysBetween(i.issued, p.paid) : 0 };
  })
  .sort((a, b) => daysBetween(a.paid, TODAY) - daysBetween(b.paid, TODAY));

const thisMonth = PAID.filter((i) => i.paid.startsWith('Sep'));
const factored = PAID.filter((i) => i.via === 'Factoring');
const collected = thisMonth.reduce((sum, i) => sum + dollars(i.amount), 0);
const factoredTotal = factored.reduce((sum, i) => sum + dollars(i.amount), 0);
const avgDays = Math.round(PAID.reduce((sum, i) => sum + i.days, 0) / Math.max(PAID.length, 1));

const KPIS = [
  { label: 'Paid this month', value: String(thisMonth.length), note: 'September' },
  { label: 'Amount', value: money(collected), note: 'Collected this month' },
  { label: 'Avg days to pay', value: String(avgDays), note: 'Issued to paid' },
  { label: 'Paid via factoring', value: String(factored.length), note: `TriPoint Capital · ${money(factoredTotal)}` },
];

export function PaidTab() {
  const { query } = useAppShell();
  const rows = PAID.filter((i) => matchesQuery(i, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Paid invoices" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Invoice</th><th>Customer</th><th>Load</th><th>Issued</th><th>Paid</th><th>Via</th>
              <th className="num">Amount</th><th className="num">Days to pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="strong">{i.id}</td>
                <td>{i.customer}</td>
                <td className="muted">{i.load}</td>
                <td>{i.issued}</td>
                <td>{i.paid}</td>
                <td><Tag label={i.via} tagClass={i.via === 'Factoring' ? 'tag-accent' : 'tag-neutral'} /></td>
                <td className="num">{i.amount}</td>
                <td className="num">{i.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

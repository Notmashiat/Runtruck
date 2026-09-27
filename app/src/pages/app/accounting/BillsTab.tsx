import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { BILLS, daysBetween, dollars, money, TODAY, type Bill } from '../../../data/accounting';
import { matchesQuery } from '../../../lib/search';

const total = (list: Bill[]) => money(list.reduce((sum, b) => sum + dollars(b.amount), 0));

const dueThisWeek = BILLS.filter((b) => b.status === 'Due' && daysBetween(TODAY, b.due) <= 7);
const overdue = BILLS.filter((b) => b.status === 'Overdue');
const scheduled = BILLS.filter((b) => b.status === 'Scheduled');
const paidThisMonth = BILLS.filter((b) => b.status === 'Paid' && b.due.startsWith('Sep'));

const KPIS = [
  { label: 'Due this week', value: String(dueThisWeek.length), note: total(dueThisWeek) },
  { label: 'Overdue', value: String(overdue.length), note: total(overdue) },
  { label: 'Scheduled', value: String(scheduled.length), note: `${total(scheduled)} · auto-pay` },
  { label: 'Paid this month', value: String(paidThisMonth.length), note: total(paidThisMonth) },
];

export function BillsTab() {
  const { query } = useAppShell();
  const rows = BILLS.filter((b) => matchesQuery(b, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Bills" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Vendor</th><th>Category</th><th>Due</th><th className="num">Amount</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.vendor}>
                <td className="strong">{b.vendor}</td>
                <td className="muted">{b.category}</td>
                <td>{b.due}</td>
                <td className="num">{b.amount}</td>
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

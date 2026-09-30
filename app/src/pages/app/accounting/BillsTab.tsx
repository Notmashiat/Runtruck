import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { BILLS, daysBetween, dollars, money, TODAY, type Bill } from '../../../data/accounting';
import { matchesQuery } from '../../../lib/search';
import { isoOf, numberOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

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

const FILTERS: FilterDef<Bill>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (b) => b.status, options: ['Overdue', 'Due', 'Scheduled', 'Paid'] },
  { key: 'category', label: 'Category', type: 'select', get: (b) => b.category },
  { key: 'vendor', label: 'Vendor', type: 'select', get: (b) => b.vendor },
  { key: 'due', label: 'Due date', type: 'dates', get: (b) => isoOf(b.due) },
  { key: 'amount', label: 'Amount', type: 'range', get: (b) => numberOf(b.amount), prefix: '$' },
];

export function BillsTab() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(BILLS.filter((b) => matchesQuery(b, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Bills" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="vendor">Vendor</SortTh><SortTh sort={sort} k="category">Category</SortTh><SortTh sort={sort} k="due">Due</SortTh><SortTh sort={sort} k="amount" num>Amount</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
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
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

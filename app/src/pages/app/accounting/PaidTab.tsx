import { useState } from 'react';
import { Card } from '../../../components/Card';
import { InvoiceDialog } from '../../../components/InvoiceDialog';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { daysFrom, fmtDate, invoiceTotal, usd, usd0, type InvoiceRecord } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

export function PaidTab() {
  const { query, invoices } = useAppShell();
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);

  // Paid invoices, most recently paid first.
  const paid = invoices
    .filter((i) => i.paid)
    .map((i) => ({ inv: i, date: i.paid?.date ?? '', via: i.paid?.via ?? '—', days: i.paid ? daysFrom(i.issued, i.paid.date) : 0 }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const thisMonth = paid.filter((p) => p.date.startsWith('2026-09'));
  const factored = paid.filter((p) => p.via === 'Factoring');
  const kpis = [
    { label: 'Paid this month', value: String(thisMonth.length), note: 'September' },
    { label: 'Amount', value: usd0(thisMonth.reduce((s, p) => s + invoiceTotal(p.inv), 0)), note: 'Collected this month' },
    { label: 'Avg days to pay', value: String(Math.round(paid.reduce((s, p) => s + p.days, 0) / Math.max(paid.length, 1))), note: 'Issued to paid' },
    { label: 'Paid via factoring', value: String(factored.length), note: `TriPoint Capital · ${usd0(factored.reduce((s, p) => s + invoiceTotal(p.inv), 0))}` },
  ];
  type PaidRow = (typeof paid)[number];
  const filters: FilterDef<PaidRow>[] = [
    { key: 'via', label: 'Paid via', type: 'select', get: (p) => p.via },
    { key: 'customer', label: 'Customer', type: 'select', get: (p) => p.inv.customer },
    { key: 'paid', label: 'Paid on', type: 'dates', get: (p) => p.date },
    { key: 'amount', label: 'Amount', type: 'range', get: (p) => invoiceTotal(p.inv), prefix: '$' },
    { key: 'days', label: 'Days to pay', type: 'range', get: (p) => p.days, suffix: ' d' },
  ];
  const sort = useSort(usePageFilters(paid.filter((p) => matchesQuery({ ...p.inv, via: p.via, loads: p.inv.loads.join(' ') }, query)), filters), {
    id: (p) => p.inv.id, customer: (p) => p.inv.customer, loads: (p) => p.inv.loads.join(', '), issued: (p) => p.inv.issued,
    paid: (p) => p.date, amount: (p) => invoiceTotal(p.inv),
  });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Paid invoices" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Invoice</SortTh><SortTh sort={sort} k="customer">Customer</SortTh><SortTh sort={sort} k="loads">Load</SortTh><SortTh sort={sort} k="issued">Issued</SortTh><SortTh sort={sort} k="paid">Paid</SortTh><SortTh sort={sort} k="via">Via</SortTh>
              <SortTh sort={sort} k="amount" num>Amount</SortTh><SortTh sort={sort} k="days" num>Days to pay</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ inv, date, via, days }) => (
              <tr key={inv.id} className="is-clickable" onClick={() => setViewing(inv)}>
                <td className="strong">{inv.id}</td>
                <td>{inv.customer}</td>
                <td className="muted">{inv.loads.join(', ')}</td>
                <td>{fmtDate(inv.issued, true)}</td>
                <td>{fmtDate(date, true)}</td>
                <td><Tag label={via} tagClass={via === 'Factoring' ? 'tag-accent' : 'tag-neutral'} /></td>
                <td className="num">{usd(invoiceTotal(inv))}</td>
                <td className="num">{days}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{paid.length ? 'Nothing matches the search or filters.' : 'No paid invoices yet.'}</div>}
      </Card>

      {viewing && <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

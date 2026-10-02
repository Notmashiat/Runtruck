import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { InvoiceDetail, useInvoiceActions } from '../../../components/InvoiceDetail';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import {
  daysPastDue, fmtDate, invoiceTotal, lateFees, statusOf, usd, usd0, type InvoiceRecord,
} from '../../../data/invoicing';
import { CUSTOMERS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { usePaged } from '../../../lib/paging';

export function PastDueTab() {
  const { query, invoices } = useAppShell();
  const actions = useInvoiceActions();
  const [openId, setOpenId] = useState<string | null>(null);

  // Most days late first: the order collections works them in.
  const overdue = invoices.filter((i) => statusOf(i) === 'Overdue').sort((a, b) => daysPastDue(b) - daysPastDue(a));
  const total = overdue.reduce((s, i) => s + invoiceTotal(i), 0);
  const oldest = overdue[0];
  const kpis = [
    { label: 'Overdue invoices', value: String(overdue.length), note: 'Past their due date' },
    { label: 'Amount overdue', value: usd0(total), note: `${overdue.filter((i) => daysPastDue(i) > 30).length} more than 30 days late` },
    { label: 'Most days late', value: oldest ? String(daysPastDue(oldest)) : '0', note: oldest ? `${oldest.id} · ${oldest.customer}` : 'Nothing overdue' },
    { label: 'Accounts affected', value: String(new Set(overdue.map((i) => i.customer)).size), note: `of ${CUSTOMERS.length} accounts` },
  ];

  const lastReminder = (i: InvoiceRecord) => (i.history ?? []).findLast((h) => h.text.startsWith('Reminder'));
  const filters: FilterDef<InvoiceRecord>[] = [
    { key: 'customer', label: 'Customer', type: 'select', get: (i) => i.customer },
    { key: 'late', label: 'Days late', type: 'range', get: (i) => daysPastDue(i), suffix: ' d' },
    { key: 'balance', label: 'Balance', type: 'range', get: (i) => invoiceTotal(i), prefix: '$' },
    { key: 'due', label: 'Was due', type: 'dates', get: (i) => i.due },
    { key: 'fee', label: 'Late fee', type: 'toggle', get: (i) => lateFees(i) > 0, hint: 'Only invoices with a late fee added' },
    { key: 'never', label: 'Not reminded', type: 'toggle', get: (i) => !lastReminder(i), hint: 'Only invoices never reminded' },
  ];
  const sort = useSort(usePageFilters(overdue.filter((i) => matchesQuery({ ...i, ...i.billTo, loads: i.loads.join(' ') }, query)), filters), {
    loads: (i) => i.loads.join(', '), late: (i) => daysPastDue(i), reminder: (i) => lastReminder(i)?.date ?? '', balance: (i) => invoiceTotal(i),
  });
  const rows = sort.rows;
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows, { key: openId, of: (r) => r.id });

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Past due" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Invoice</SortTh><SortTh sort={sort} k="customer">Customer</SortTh><SortTh sort={sort} k="loads">Load</SortTh><SortTh sort={sort} k="due">Due</SortTh><SortTh sort={sort} k="late" num>Days late</SortTh>
              <SortTh sort={sort} k="reminder">Last reminder</SortTh><SortTh sort={sort} k="balance" num>Balance</SortTh><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((i) => {
              const isOpen = openId === i.id;
              const reminder = lastReminder(i);
              return (
                <Fragment key={i.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpenId(isOpen ? null : i.id)}>
                    <td className="strong">{i.id}</td>
                    <td>{i.customer}</td>
                    <td className="muted">{i.loads.join(', ')}</td>
                    <td>{fmtDate(i.due, true)}</td>
                    <td className="num"><Tag label={`${daysPastDue(i)} d`} tagClass={daysPastDue(i) > 30 ? 'tag-outline' : 'tag-neutral'} /></td>
                    <td className="muted">{reminder ? fmtDate(reminder.date, true) : 'None yet'}</td>
                    <td className="num">
                      {usd(invoiceTotal(i))}
                      {lateFees(i) > 0 && <div className="ui-stop-meta">incl. {usd(lateFees(i))} late fees</div>}
                    </td>
                    <td className="num">
                      <button type="button" className="ui-link" onClick={(e) => { e.stopPropagation(); actions.remind([i.id]); }}>Remind</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="ui-expand-cell"><InvoiceDetail inv={i} actions={actions} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">{overdue.length ? 'Nothing matches the search or filters.' : 'Nothing is past due.'}</div>}
      </Card>

      {actions.dialogs}
    </>
  );
}

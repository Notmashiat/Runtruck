import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { InvoiceDetail, useInvoiceActions } from '../../../components/InvoiceDetail';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import {
  STATUS_TAG, TODAY, daysFrom, fmtDate, invoiceTotal, statusOf, usd, usd0, type InvoiceRecord, type InvoiceStatus,
} from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

type View = 'All' | 'Draft' | 'Unsent' | 'Sent';
const VIEWS: View[] = ['All', 'Draft', 'Unsent', 'Sent'];
const OPEN: InvoiceStatus[] = ['Draft', 'Unsent', 'Sent'];

// Invoices that are not paid and not yet past due, newest first.
export function InvoicedTab() {
  const { query, invoices } = useAppShell();
  const actions = useInvoiceActions();
  const [view, setView] = useState<View>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  const open = invoices.filter((i) => OPEN.includes(statusOf(i))).sort((a, b) => (a.issued < b.issued ? 1 : a.issued > b.issued ? -1 : b.id.localeCompare(a.id)));
  const issued = open.filter((i) => !i.draft);
  const dueSoon = issued.filter((i) => daysFrom(TODAY, i.due) <= 7);
  const kpis = [
    { label: 'Open invoices', value: String(issued.length), note: `${usd0(issued.reduce((s, i) => s + invoiceTotal(i), 0))} outstanding` },
    { label: 'Drafts', value: String(open.length - issued.length), note: 'Not issued yet' },
    { label: 'Not emailed', value: String(open.filter((i) => statusOf(i) === 'Unsent').length), note: 'Issued but not sent' },
    { label: 'Due in 7 days', value: usd0(dueSoon.reduce((s, i) => s + invoiceTotal(i), 0)), note: `${dueSoon.length} invoice(s)` },
  ];

  const filters: FilterDef<InvoiceRecord>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (i) => statusOf(i), options: ['Draft', 'Unsent', 'Sent'] },
    { key: 'customer', label: 'Customer', type: 'select', get: (i) => i.customer },
    { key: 'terms', label: 'Terms', type: 'select', get: (i) => i.terms },
    { key: 'issued', label: 'Issued', type: 'dates', get: (i) => (i.draft ? '' : i.issued) },
    { key: 'due', label: 'Due', type: 'dates', get: (i) => i.due },
    { key: 'amount', label: 'Amount', type: 'range', get: (i) => invoiceTotal(i), prefix: '$' },
  ];
  const base = open.filter((i) => (view === 'All' || statusOf(i) === view) && matchesQuery({ ...i, ...i.billTo, loads: i.loads.join(' ') }, query));
  const sort = useSort(usePageFilters(base, filters), {
    loads: (i) => i.loads.join(', '), issued: (i) => (i.draft ? '' : i.issued), amount: (i) => invoiceTotal(i), status: (i) => statusOf(i),
  });
  const rows = sort.rows;

  const filter = (
    <div className="ui-filter">
      {VIEWS.map((v) => (
        <button key={v} type="button" className={`ui-filter-opt${view === v ? ' is-active' : ''}`} onClick={() => setView(v)}>{v}</button>
      ))}
    </div>
  );

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Open invoices" flush action={filter}>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Invoice</SortTh><SortTh sort={sort} k="customer">Customer</SortTh><SortTh sort={sort} k="loads">Load</SortTh><SortTh sort={sort} k="issued">Issued</SortTh><SortTh sort={sort} k="due">Due</SortTh>
              <SortTh sort={sort} k="amount" num>Amount</SortTh><SortTh sort={sort} k="status" num>Status</SortTh><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const st = statusOf(i);
              const isOpen = openId === i.id;
              return (
                <Fragment key={i.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpenId(isOpen ? null : i.id)}>
                    <td className="strong">{i.id}</td>
                    <td>{i.customer || '—'}</td>
                    <td className="muted">{i.loads.join(', ') || '—'}</td>
                    <td>{i.draft ? '—' : fmtDate(i.issued, true)}</td>
                    <td>{fmtDate(i.due, true)}</td>
                    <td className="num">{usd(invoiceTotal(i))}</td>
                    <td className="num"><Tag label={st} tagClass={STATUS_TAG[st]} /></td>
                    <td className="num">
                      <button type="button" className="ui-link" onClick={(e) => { e.stopPropagation(); actions.edit(i); }}>Edit</button>
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
        {rows.length === 0 && <div className="ui-empty">{base.length ? 'Nothing matches the search or filters.' : 'No open invoices in this view.'}</div>}
      </Card>

      {actions.dialogs}
    </>
  );
}

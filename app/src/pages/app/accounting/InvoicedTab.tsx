import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { InvoiceDetail, useInvoiceActions } from '../../../components/InvoiceDetail';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import {
  STATUS_TAG, TODAY, daysFrom, fmtDate, invoiceTotal, statusOf, usd, usd0, type InvoiceStatus,
} from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';

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

  const rows = open.filter((i) => (view === 'All' || statusOf(i) === view) && matchesQuery({ ...i, ...i.billTo, loads: i.loads.join(' ') }, query));

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
              <th>Invoice</th><th>Customer</th><th>Load</th><th>Issued</th><th>Due</th>
              <th className="num">Amount</th><th className="num">Status</th><th className="num" aria-label="Actions" />
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
        {rows.length === 0 && <div className="ui-empty">{query ? `Nothing matches “${query}”.` : 'No open invoices in this view.'}</div>}
      </Card>

      {actions.dialogs}
    </>
  );
}

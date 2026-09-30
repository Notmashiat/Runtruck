import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { InvoiceDetail, useInvoiceActions } from '../../../components/InvoiceDetail';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import {
  daysPastDue, fmtDate, invoiceTotal, lateFees, statusOf, usd, usd0,
} from '../../../data/invoicing';
import { CUSTOMERS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';

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

  const rows = overdue.filter((i) => matchesQuery({ ...i, ...i.billTo, loads: i.loads.join(' ') }, query));
  const lastReminder = (id: string) => [...(invoices.find((i) => i.id === id)?.history ?? [])].reverse().find((h) => h.text.startsWith('Reminder'));

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Past due" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Invoice</th><th>Customer</th><th>Load</th><th>Due</th><th className="num">Days late</th>
              <th>Last reminder</th><th className="num">Balance</th><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const isOpen = openId === i.id;
              const reminder = lastReminder(i.id);
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
        {rows.length === 0 && <div className="ui-empty">{query ? `Nothing matches “${query}”.` : 'Nothing is past due.'}</div>}
      </Card>

      {actions.dialogs}
    </>
  );
}

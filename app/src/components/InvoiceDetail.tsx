import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import {
  daysPastDue, fmtDate, invoiceTotal, lateFees, lineAmount, statusOf, usd, type InvoiceRecord,
} from '../data/invoicing';
import { invoiceDoc, invoiceFileName } from '../lib/invoicePdf';
import { downloadPdf } from '../lib/pdf';
import { EmailInvoiceDialog, InvoiceDialog, PaymentDialog } from './InvoiceDialog';
import { ReminderDialog } from './ReminderDialog';

// The popups an invoice row can open, owned by the tab showing the rows.
export function useInvoiceActions() {
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [emailing, setEmailing] = useState<InvoiceRecord | null>(null);
  const [paying, setPaying] = useState<InvoiceRecord | null>(null);
  const [reminding, setReminding] = useState<string[] | null>(null);
  const dialogs: ReactNode = (
    <>
      {editing && <InvoiceDialog invoice={editing} onClose={() => setEditing(null)} />}
      {emailing && <EmailInvoiceDialog invoice={emailing} onClose={() => setEmailing(null)} />}
      {paying && <PaymentDialog invoice={paying} onClose={() => setPaying(null)} />}
      {reminding && <ReminderDialog invoiceIds={reminding} onClose={() => setReminding(null)} />}
    </>
  );
  return { edit: setEditing, email: setEmailing, pay: setPaying, remind: setReminding, dialogs };
}

type Actions = ReturnType<typeof useInvoiceActions>;

function Row({ k, children }: { k: string; children: ReactNode }) {
  if (children === '' || children === null || children === undefined || children === false) return null;
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children}</div>
    </div>
  );
}

// An invoice row's drop-down: who owes it, the dates, every charge, what has
// happened so far, and what can be done next.
export function InvoiceDetail({ inv, actions }: { inv: InvoiceRecord; actions: Actions }) {
  const { loads, batches } = useAppShell();
  const status = statusOf(inv);
  const late = daysPastDue(inv);
  const batch = batches.find((b) => b.invoiceIds.includes(inv.id));
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const b = inv.billTo;

  return (
    <div className="ui-expand">
      <div>
        <div className="ui-label">Bill to</div>
        <div className="ui-kv">
          <div>
            <div className="ui-kv-value">{b.name || inv.customer}</div>
            {b.attn && <div className="ui-stop-meta">{b.attn}</div>}
            <div className="ui-stop-meta">{[b.street, [b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')}</div>
          </div>
          <Row k="Email">{b.email && <a className="ui-link" href={`mailto:${b.email}`} onClick={(e) => e.stopPropagation()}>{b.email}</a>}</Row>
          <Row k="Phone">{b.phone}</Row>
          <Row k="Last sent">{inv.sentOn ? `${fmtDate(inv.sentOn)} to ${inv.sentTo ?? '—'}` : 'Not emailed yet'}</Row>
        </div>
      </div>

      <div>
        <div className="ui-label">Invoice</div>
        <div className="ui-kv">
          <Row k="Issued · terms">{`${fmtDate(inv.issued)} · ${inv.terms}`}</Row>
          <Row k="Due">
            {fmtDate(inv.due)}
            {status === 'Overdue' && <span style={{ color: 'var(--ui-red)' }}> · {late} days late</span>}
          </Row>
          <Row k={inv.loads.length > 1 ? 'Loads' : 'Load'}>
            {inv.loads.length === 0 ? '—' : inv.loads.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                {loads.some((l) => l.id === id) ? <Link className="ui-link" to={`/app/loads/${id}`} onClick={(e) => e.stopPropagation()}>{id}</Link> : id}
              </span>
            ))}
          </Row>
          <Row k="Route">{inv.route}</Row>
          <Row k="Customer ref · BOL">{[inv.ref, inv.bol].filter(Boolean).join(' · ')}</Row>
          <Row k="Batch">{batch ? `${batch.id} · ${batch.recipient}` : ''}</Row>
        </div>
      </div>

      <div>
        <div className="ui-label">Charges</div>
        <div className="ui-kv">
          {inv.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <span className="ui-stop-meta" style={{ flex: 1, marginTop: 0, color: l.kind === 'Late fee' ? 'var(--ui-red)' : undefined }}>{l.kind}{Number(l.qty) !== 1 ? ` × ${l.qty}` : ''}</span>
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{usd(lineAmount(l))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--ui-border)', paddingTop: 8 }}>
            <strong style={{ flex: 1, fontSize: 13 }}>Total{lateFees(inv) ? ' (incl. late fees)' : ''}</strong>
            <strong style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{usd(invoiceTotal(inv))}</strong>
          </div>
          {inv.paid && <Row k="Paid">{`${fmtDate(inv.paid.date)} · ${inv.paid.via}${inv.paid.reference ? ` · ${inv.paid.reference}` : ''}`}</Row>}
        </div>
      </div>

      <div>
        <div className="ui-label">Activity</div>
        <div className="ui-kv">
          {inv.history.slice(-5).map((h, i) => <div key={i} className="ui-stop-meta" style={{ marginTop: 0 }}><strong>{fmtDate(h.date, true)}</strong> · {h.text}</div>)}
          {inv.internal && <div className="ui-stop-meta" style={{ marginTop: 0 }}><strong>Internal:</strong> {inv.internal}</div>}
          <div className="ui-link-stack" style={{ marginTop: 6 }}>
            <button type="button" className="ui-link" onClick={stop(() => actions.edit(inv))}>Edit invoice</button>
            {!inv.draft && <button type="button" className="ui-link" onClick={stop(() => actions.email(inv))}>{inv.sentOn ? 'Email again' : 'Email invoice'}</button>}
            <button type="button" className="ui-link" onClick={stop(() => downloadPdf(invoiceDoc(inv), invoiceFileName(inv)))}>Download PDF</button>
            {status === 'Overdue' && <button type="button" className="ui-link" onClick={stop(() => actions.remind([inv.id]))}>Send reminder / add late fee</button>}
            {!inv.paid && !inv.draft && <button type="button" className="ui-link" onClick={stop(() => actions.pay(inv))}>Record payment</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

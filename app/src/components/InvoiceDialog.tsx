import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import {
  CHARGE_TYPES, PAY_METHODS, TERMS, TODAY, addDays, billToFor, billableLoads, draftForLoads, fmtDate, invoiceEmail, invoiceTotal,
  lineAmount, nextInvoiceId, rateLines, statusOf, termDays, termsFor, usd, type BillTo, type BillableLoad, type InvoiceLine,
  type InvoiceRecord,
} from '../data/invoicing';
import { CUSTOMERS } from '../data/mock';
import { invoiceDoc, invoiceFileName } from '../lib/invoicePdf';
import { downloadPdf, openPdf } from '../lib/pdf';
import { Field, isEmail, launch, mailtoHref, useModal } from './FormBits';
import { PdfPages } from './PdfPages';
import { ConfirmDialog } from './RecordDialog';

type SectionKey = 'Customer' | 'Invoice' | 'Shipment' | 'Charges' | 'Notes' | 'Preview';
const SECTIONS: { key: SectionKey; title: string; help: string }[] = [
  { key: 'Customer', title: 'Customer & loads', help: 'Who is billed, and for which delivered loads. Ticking a load adds its rate to the charges.' },
  { key: 'Invoice', title: 'Invoice details', help: 'Dates, terms and the customer’s own reference numbers. The due date follows the terms.' },
  { key: 'Shipment', title: 'Shipment', help: 'What moved, as it prints on the invoice. Filled in from the load.' },
  { key: 'Charges', title: 'Charges', help: 'Line haul, fuel surcharge and any accessorials. Amount = quantity × rate.' },
  { key: 'Notes', title: 'Notes', help: 'A note printed on the invoice, and one for your team only.' },
  { key: 'Preview', title: 'Preview', help: 'Exactly what the PDF will look like.' },
];

const QUICK: { label: string; line: InvoiceLine }[] = [
  { label: '+ Detention', line: { kind: 'Detention', description: 'Detention beyond 2 h free time', qty: '1', rate: '75' } },
  { label: '+ Lumper', line: { kind: 'Lumper', description: 'Lumper receipt attached', qty: '1', rate: '' } },
  { label: '+ Stop-off', line: { kind: 'Stop-off', description: 'Additional stop', qty: '1', rate: '100' } },
  { label: '+ Discount', line: { kind: 'Discount', description: '', qty: '1', rate: '-50' } },
];

function validate(d: InvoiceRecord): Record<SectionKey, Record<string, string>> {
  const e: Record<SectionKey, Record<string, string>> = { Customer: {}, Invoice: {}, Shipment: {}, Charges: {}, Notes: {}, Preview: {} };
  if (!d.customer) e.Customer.customer = 'Choose the customer';
  if (!d.billTo.name.trim()) e.Customer.billName = 'Required';
  if (!d.billTo.street.trim()) e.Customer.billStreet = 'Required';
  if (!d.billTo.city.trim()) e.Customer.billCity = 'Required';
  if (!/^[A-Za-z]{2}$/.test(d.billTo.state.trim())) e.Customer.billState = 'Two letters';
  if (d.billTo.email.trim() && !isEmail(d.billTo.email)) e.Customer.billEmail = 'Enter a valid email';
  if (!d.issued) e.Invoice.issued = 'Required';
  if (!d.due) e.Invoice.due = 'Required';
  else if (d.issued && d.due < d.issued) e.Invoice.due = 'Cannot be before the invoice date';
  if (d.lines.length === 0) e.Charges.none = 'Add at least one charge';
  d.lines.forEach((l, i) => {
    if (!l.kind) e.Charges[`kind${i}`] = 'Type';
    if (!(Number(l.qty) > 0)) e.Charges[`qty${i}`] = 'Qty';
    if (l.rate.trim() === '' || Number.isNaN(Number(l.rate))) e.Charges[`rate${i}`] = 'Rate';
  });
  if (d.lines.length && invoiceTotal(d) <= 0) e.Charges.total = 'The total must be more than $0';
  return e;
}

// The New Invoice / Edit invoice popup. `loadIds` starts a new invoice from
// delivered loads (the Uninvoiced tab's "New invoice").
export function InvoiceDialog({ invoice, loadIds, onClose }: { invoice?: InvoiceRecord; loadIds?: string[]; onClose: () => void }) {
  const { loads, invoices, saveInvoice, deleteInvoice } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const bodyRef = useRef<HTMLElement>(null);
  const queue = useMemo(() => billableLoads(loads, invoices.filter((i) => i.id !== invoice?.id)), [loads, invoices, invoice?.id]);
  const [start] = useState<InvoiceRecord>(() =>
    invoice ? JSON.parse(JSON.stringify(invoice)) : draftForLoads(queue.filter((l) => loadIds?.includes(l.id)), nextInvoiceId(invoices)),
  );
  const [d, setD] = useState<InvoiceRecord>(start);
  const [section, setSection] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emailing, setEmailing] = useState<InvoiceRecord | null>(null);

  const isNew = !invoice;
  const issuedAlready = Boolean(invoice && !invoice.draft);
  const errors = validate(d);
  const count = (k: SectionKey) => Object.keys(errors[k]).length;
  const err = (k: SectionKey, f: string) => (showErrors ? errors[k][f] : undefined);
  const dirty = JSON.stringify(d) !== JSON.stringify(start);
  const total = invoiceTotal(d);

  const go = (i: number) => {
    setSection(i);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const requestClose = () => {
    if (!dirty || window.confirm(isNew ? 'Discard this new invoice?' : `Discard your changes to ${d.id}?`)) closeNow();
  };

  const setBill = (k: keyof BillTo, v: string) => setD((p) => ({ ...p, billTo: { ...p.billTo, [k]: v } }));
  const setLine = (i: number, patch: Partial<InvoiceLine>) => setD((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const withTerms = (p: InvoiceRecord, terms: string, issued = p.issued) => ({ ...p, terms, issued, due: issued ? addDays(issued, termDays(terms)) : p.due });

  const setCustomer = (c: string) =>
    setD((p) => ({
      ...withTerms(p, termsFor(c)),
      customer: c,
      billTo: billToFor(c),
      loads: [],
      lines: p.lines.filter((l) => !p.loads.some((id) => l.description.startsWith(id))),
    }));

  const toggleLoad = (l: BillableLoad, on: boolean) =>
    setD((p) => {
      if (!on) {
        return { ...p, loads: p.loads.filter((x) => x !== l.id), lines: p.lines.filter((x) => !x.description.startsWith(l.id)) };
      }
      const first = p.loads.length === 0;
      return {
        ...p,
        loads: [...p.loads, l.id],
        lines: [...p.lines, ...rateLines(l.amount, `${l.id} · ${l.route}`, l.miles)],
        ref: [p.ref, l.ref].filter(Boolean).join(', '),
        route: first ? l.route : p.route,
        pickup: first ? l.pickup : p.pickup,
        delivery: l.delivered > p.delivery ? l.delivered : p.delivery,
        equipment: p.equipment || l.equipment,
        commodity: p.commodity || l.commodity,
        weight: first ? l.weight : p.weight,
        miles: first ? l.miles : p.miles,
      };
    });

  const finalize = (): InvoiceRecord | null => {
    const firstBad = SECTIONS.findIndex((s) => count(s.key) > 0);
    if (firstBad >= 0) {
      setShowErrors(true);
      go(firstBad);
      return null;
    }
    const text = issuedAlready ? 'Invoice edited' : 'Invoice created';
    return { ...d, draft: false, history: [...d.history, { date: TODAY, text }] };
  };

  const saveDraft = () => {
    if (!d.customer) {
      setShowErrors(true);
      go(0);
      return;
    }
    saveInvoice({ ...d, draft: true, history: d.history.length ? d.history : [{ date: TODAY, text: 'Draft started' }] });
    closeNow();
  };
  const create = (thenEmail: boolean) => {
    const done = finalize();
    if (!done) return;
    saveInvoice(done);
    if (thenEmail) setEmailing(done);
    else closeNow();
  };

  const doc = useMemo(() => (SECTIONS[section].key === 'Preview' ? invoiceDoc(d) : null), [d, section]);
  const mine = queue.filter((q) => q.customer === d.customer);
  const attachedElsewhere = d.loads.filter((id) => !mine.some((q) => q.id === id));

  const body: Record<SectionKey, ReactNode> = {
    Customer: (
      <>
        <div className="ui-form-grid">
          <Field label="Customer" required wide error={err('Customer', 'customer')}>
            <select className="ui-input" value={d.customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">Select the customer…</option>
              {CUSTOMERS.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.terms}</option>)}
            </select>
          </Field>
        </div>
        {d.customer && (
          <div className="ui-panel">
            <div className="ui-panel-head"><span className="ui-label">Delivered loads to bill</span></div>
            {mine.length === 0 && attachedElsewhere.length === 0 && <div className="ui-stop-meta">No delivered, uninvoiced loads for {d.customer}. You can still bill custom charges.</div>}
            <div className="ui-pick-list">
              {attachedElsewhere.map((id) => (
                <label key={id} className="ui-check">
                  <input type="checkbox" checked onChange={() => setD((p) => ({ ...p, loads: p.loads.filter((x) => x !== id), lines: p.lines.filter((x) => !x.description.startsWith(id)) }))} />
                  <strong>{id}</strong><span className="muted"> · already on this invoice</span>
                </label>
              ))}
              {mine.map((l) => (
                <label key={l.id} className="ui-check">
                  <input type="checkbox" checked={d.loads.includes(l.id)} onChange={(e) => toggleLoad(l, e.target.checked)} />
                  <strong>{l.id}</strong>
                  <span className="muted"> · {l.route} · delivered {fmtDate(l.delivered, true)} · {usd(l.amount)}</span>
                  {l.pod === 'Missing' && <span className="ui-chip ui-chip-amber" style={{ marginLeft: 6 }}>POD missing</span>}
                </label>
              ))}
            </div>
            {d.loads.some((id) => mine.find((q) => q.id === id)?.pod === 'Missing') && (
              <div className="ui-note" style={{ marginTop: 12 }}>A proof of delivery is missing. Most customers short-pay or reject an invoice without one — attach it on the load first if you can.</div>
            )}
          </div>
        )}
        <div className="ui-form-grid">
          <Field label="Bill to" required wide error={err('Customer', 'billName')}>
            <input className="ui-input" value={d.billTo.name} onChange={(e) => setBill('name', e.target.value)} />
          </Field>
          <Field label="Attention" wide>
            <input className="ui-input" value={d.billTo.attn} onChange={(e) => setBill('attn', e.target.value)} placeholder="e.g. Accounts Payable" />
          </Field>
          <Field label="Street address" required wide error={err('Customer', 'billStreet')}>
            <input className="ui-input" value={d.billTo.street} onChange={(e) => setBill('street', e.target.value)} />
          </Field>
          <Field label="City" required error={err('Customer', 'billCity')}>
            <input className="ui-input" value={d.billTo.city} onChange={(e) => setBill('city', e.target.value)} />
          </Field>
          <Field label="State" required error={err('Customer', 'billState')}>
            <input className="ui-input" value={d.billTo.state} maxLength={2} onChange={(e) => setBill('state', e.target.value.toUpperCase())} />
          </Field>
          <Field label="ZIP">
            <input className="ui-input" value={d.billTo.zip} onChange={(e) => setBill('zip', e.target.value)} />
          </Field>
          <Field label="Billing phone">
            <input className="ui-input" type="tel" value={d.billTo.phone} onChange={(e) => setBill('phone', e.target.value)} />
          </Field>
          <Field label="Billing email" wide error={err('Customer', 'billEmail')} help="Where the invoice is emailed.">
            <input className="ui-input" type="email" value={d.billTo.email} onChange={(e) => setBill('email', e.target.value)} />
          </Field>
        </div>
      </>
    ),
    Invoice: (
      <div className="ui-form-grid">
        <Field label="Invoice number">
          <input className="ui-input" value={d.id} readOnly />
        </Field>
        <Field label="Terms" required>
          <select className="ui-input" value={d.terms} onChange={(e) => setD((p) => withTerms(p, e.target.value))}>
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Invoice date" required error={err('Invoice', 'issued')}>
          <input className="ui-input" type="date" value={d.issued} onChange={(e) => setD((p) => withTerms(p, p.terms, e.target.value))} />
        </Field>
        <Field label="Due date" required error={err('Invoice', 'due')}>
          <input className="ui-input" type="date" value={d.due} onChange={(e) => setD((p) => ({ ...p, due: e.target.value }))} />
        </Field>
        <Field label="Customer reference / PO" wide>
          <input className="ui-input" value={d.ref} onChange={(e) => setD((p) => ({ ...p, ref: e.target.value }))} placeholder="Printed so their AP can match it" />
        </Field>
        <Field label="BOL #">
          <input className="ui-input" value={d.bol} onChange={(e) => setD((p) => ({ ...p, bol: e.target.value }))} />
        </Field>
      </div>
    ),
    Shipment: (
      <div className="ui-form-grid">
        <Field label="Route" wide>
          <input className="ui-input" value={d.route} onChange={(e) => setD((p) => ({ ...p, route: e.target.value }))} placeholder="Fresno, CA → Reno, NV" />
        </Field>
        <Field label="Picked up">
          <input className="ui-input" type="date" value={d.pickup} onChange={(e) => setD((p) => ({ ...p, pickup: e.target.value }))} />
        </Field>
        <Field label="Delivered">
          <input className="ui-input" type="date" value={d.delivery} onChange={(e) => setD((p) => ({ ...p, delivery: e.target.value }))} />
        </Field>
        <Field label="Equipment">
          <input className="ui-input" value={d.equipment} onChange={(e) => setD((p) => ({ ...p, equipment: e.target.value }))} />
        </Field>
        <Field label="Commodity">
          <input className="ui-input" value={d.commodity} onChange={(e) => setD((p) => ({ ...p, commodity: e.target.value }))} />
        </Field>
        <Field label="Weight">
          <input className="ui-input" value={d.weight} onChange={(e) => setD((p) => ({ ...p, weight: e.target.value }))} />
        </Field>
        <Field label="Miles">
          <input className="ui-input" value={d.miles} onChange={(e) => setD((p) => ({ ...p, miles: e.target.value }))} />
        </Field>
      </div>
    ),
    Charges: (
      <>
        {showErrors && (errors.Charges.none || errors.Charges.total) && <div className="ui-errors">{errors.Charges.none ?? errors.Charges.total}</div>}
        <div className="ui-lines">
          <div className="ui-lines-head">
            <span>Type</span><span>Description</span><span className="num">Qty</span><span className="num">Rate</span><span className="num">Amount</span><span />
          </div>
          {d.lines.map((l, i) => (
            <div key={i} className="ui-lines-row">
              <select className={`ui-input${err('Charges', `kind${i}`) ? ' is-bad' : ''}`} aria-label="Charge type" value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value })}>
                <option value="">Type…</option>
                {CHARGE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input className="ui-input" aria-label="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={`ui-input num${err('Charges', `qty${i}`) ? ' is-bad' : ''}`} aria-label="Quantity" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <input className={`ui-input num${err('Charges', `rate${i}`) ? ' is-bad' : ''}`} aria-label="Rate" inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
              <span className="ui-lines-amount">{usd(lineAmount(l))}</span>
              <button type="button" className="ui-icon-btn" aria-label={`Remove ${l.kind || 'charge'}`} onClick={() => setD((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <div className="ui-lines-total"><span>Total</span><strong>{usd(total)}</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ui-btn" onClick={() => setD((p) => ({ ...p, lines: [...p.lines, { kind: '', description: '', qty: '1', rate: '' }] }))}>+ Add charge</button>
          {QUICK.map((q) => (
            <button key={q.label} type="button" className="ui-btn" onClick={() => setD((p) => ({ ...p, lines: [...p.lines, { ...q.line }] }))}>{q.label}</button>
          ))}
        </div>
      </>
    ),
    Notes: (
      <>
        <div className="ui-form-grid">
          <Field label="Note on the invoice" wide help="Printed above the payment instructions.">
            <textarea className="ui-input" value={d.memo} onChange={(e) => setD((p) => ({ ...p, memo: e.target.value }))} placeholder="e.g. Detention per signed in/out times on the BOL." />
          </Field>
          <Field label="Internal note" wide help="Only your team sees this.">
            <textarea className="ui-input" value={d.internal} onChange={(e) => setD((p) => ({ ...p, internal: e.target.value }))} />
          </Field>
        </div>
        {d.history.length > 0 && (
          <div className="ui-panel">
            <div className="ui-label">History</div>
            <div className="ui-kv">
              {d.history.map((h, i) => <div key={i} className="ui-stop-meta"><strong>{fmtDate(h.date, true)}</strong> · {h.text}</div>)}
            </div>
          </div>
        )}
      </>
    ),
    Preview: doc && (
      <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>{usd(total)}</strong>
          <span className="muted">· due {fmtDate(d.due)} · {d.billTo.email || 'no billing email'}</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={() => openPdf(doc)}>Open PDF ↗</button>
          <button type="button" className="ui-btn" onClick={() => downloadPdf(doc, invoiceFileName(d))}>Download PDF</button>
        </div>
        <PdfPages doc={doc} />
      </>
    ),
  };

  const current = SECTIONS[section];
  const status = invoice ? statusOf(invoice) : 'Draft';

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-large"
      aria-label={isNew ? 'New invoice' : `Invoice ${d.id}`}
      onClose={(e) => { if (ownEvent(e)) onClose(); }}
      onCancel={(e) => {
        if (!ownEvent(e)) return;
        e.preventDefault();
        requestClose();
      }}
    >
      <aside className="ui-dialog-nav">
        <div className="ui-dialog-title">{isNew ? 'New invoice' : `${d.id} · ${status}`}</div>
        {SECTIONS.map((s, i) => {
          const n = showErrors ? count(s.key) : 0;
          return (
            <button key={s.key} type="button" className={`ui-dialog-nav-item${section === i ? ' is-active' : ''}`} onClick={() => go(i)}>
              <span>{s.title}</span>
              {n > 0 && <span className="ui-badge" aria-label={`${n} to fix`}>{n}</span>}
              {s.key === 'Charges' && n === 0 && <span className="ui-nav-note">{usd(total)}</span>}
            </button>
          );
        })}
      </aside>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body" ref={bodyRef}>
          <button type="button" className="ui-dialog-close" onClick={requestClose} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>{current.title}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{current.help}</p>
          </div>
          {invoice?.paid && <div className="ui-note">Paid {fmtDate(invoice.paid.date)} by {invoice.paid.via}. Changes here do not change the payment.</div>}
          {body[current.key]}
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          {!isNew && <button type="button" className="ui-btn ui-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <div style={{ flex: 1 }} />
          {section > 0 && <button type="button" className="ui-btn" onClick={() => go(section - 1)}>Back</button>}
          {section < SECTIONS.length - 1 && <button type="button" className="ui-btn" onClick={() => go(section + 1)}>Next</button>}
          {!issuedAlready && <button type="button" className="ui-btn" onClick={saveDraft}>Save draft</button>}
          <button type="button" className="ui-btn" onClick={() => create(true)}>{issuedAlready ? 'Save & email' : 'Create & email'}</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => create(false)}>{issuedAlready ? 'Save changes' : 'Create invoice'}</button>
        </footer>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${d.id}?`}
          body={`The invoice is removed for good${d.loads.length ? ` and ${d.loads.join(', ')} go${d.loads.length === 1 ? 'es' : ''} back to Uninvoiced` : ''}. It also leaves any batch it was in.`}
          confirmLabel="Yes, delete invoice"
          onConfirm={() => {
            setConfirmDelete(false);
            deleteInvoice(d.id);
            closeNow();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {emailing && <EmailInvoiceDialog invoice={emailing} onClose={() => { setEmailing(null); closeNow(); }} />}
    </dialog>
  );
}

// Email an invoice: the message is filled in and the PDF downloaded to attach.
// There is no mail server yet, so Send opens the person's email app.
export function EmailInvoiceDialog({ invoice, onClose }: { invoice: InvoiceRecord; onClose: () => void }) {
  const { saveInvoice } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const tpl = invoiceEmail(invoice);
  const [to, setTo] = useState(invoice.billTo.email);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [attach, setAttach] = useState(true);
  const [tried, setTried] = useState(false);
  const toError = !isEmail(to) ? 'Enter the customer’s billing email' : '';
  const ccError = cc.trim() && !cc.split(',').every((x) => isEmail(x)) ? 'Separate addresses with commas' : '';

  const send = () => {
    setTried(true);
    if (toError || ccError) return;
    if (attach) downloadPdf(invoiceDoc(invoice), invoiceFileName(invoice));
    launch(mailtoHref(to, subject, body, cc));
    saveInvoice({
      ...invoice,
      draft: false,
      sentOn: TODAY,
      sentTo: to.trim(),
      history: [...invoice.history, { date: TODAY, text: `Emailed to ${to.trim()}${cc.trim() ? ` (cc ${cc.trim()})` : ''}` }],
    });
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-medium" aria-label={`Email ${invoice.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>Email {invoice.id}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{invoice.customer} · {usd(invoiceTotal(invoice))} due {fmtDate(invoice.due)}</p>
          </div>
          <div className="ui-form-grid">
            <Field label="To" required wide error={tried && toError}>
              <input className="ui-input" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Cc" wide error={tried && ccError}>
              <input className="ui-input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional, comma-separated" />
            </Field>
            <Field label="Subject" wide>
              <input className="ui-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Message" wide>
              <textarea className="ui-input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
          </div>
          <label className="ui-check">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            Download <strong>{invoiceFileName(invoice)}</strong> to attach
            <button type="button" className="ui-link" style={{ marginLeft: 8 }} onClick={() => openPdf(invoiceDoc(invoice))}>Preview ↗</button>
          </label>
          <div className="ui-note">RunTruck does not send email itself yet: Send opens your email app with this message filled in and downloads the PDF for you to attach. The invoice is marked as sent.</div>
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn ui-btn-primary" onClick={send}>Send</button>
        </footer>
      </div>
    </dialog>
  );
}

// Record a payment against an invoice.
export function PaymentDialog({ invoice, onClose }: { invoice: InvoiceRecord; onClose: () => void }) {
  const { saveInvoice } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [date, setDate] = useState(TODAY);
  const [via, setVia] = useState(PAY_METHODS[0]);
  const [reference, setReference] = useState('');
  const save = () => {
    if (!date) return;
    saveInvoice({
      ...invoice,
      paid: { date, via, reference: reference.trim() },
      history: [...invoice.history, { date, text: `Payment received · ${via}${reference.trim() ? ` · ${reference.trim()}` : ''}` }],
    });
    closeNow();
  };
  return (
    <dialog ref={ref} className="ui-dialog is-confirm" aria-label={`Record payment for ${invoice.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <h2 className="ui-h2" style={{ margin: 0 }}>Record payment</h2>
          <p className="ui-p" style={{ marginTop: 0 }}>{invoice.id} · {invoice.customer} · {usd(invoiceTotal(invoice))}</p>
          <div className="ui-form-grid">
            <Field label="Paid on" required>
              <input className="ui-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Method" required>
              <select className="ui-input" value={via} onChange={(e) => setVia(e.target.value)}>
                {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference" wide>
              <input className="ui-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, ACH trace or advance #" />
            </Field>
          </div>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>Mark paid</button>
        </footer>
      </div>
    </dialog>
  );
}

import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import {
  COMPANY, TODAY, daysPastDue, fmtDate, invoiceTotal, round2, statusOf, usd, type InvoiceRecord,
} from '../data/invoicing';
import { USER } from '../data/mock';
import { Choice, Field, isEmail, launch, mailtoHref, smsHref, useModal } from './FormBits';

type FeeType = '% of balance' | 'Flat amount';

const TEMPLATE = [
  'Hello {customer} team,',
  '',
  `Our records show the following invoice(s) from ${COMPANY.name} are past due:`,
  '',
  '{invoices}',
  '',
  'Balance due: {balance}',
  '',
  `Please remit by ACH to ${COMPANY.bank}, account ending ${COMPANY.accountLast4}, or by check to ${COMPANY.legal}, ${COMPANY.remit}. If payment is already on its way, reply with the remittance details and we will apply it.`,
  '',
  'Thank you,',
  USER.name,
  `${COMPANY.name} · ${COMPANY.phone}`,
].join('\n');

interface Group {
  customer: string;
  invoices: InvoiceRecord[];
  email: string;
  phone: string;
  subject: string;
  message: string;
  text: string;
}

// Send reminders for past-due invoices by email and/or text, optionally adding
// a late fee to each. There is no mail or SMS server yet, so messages open in
// the person's own email and messaging apps; the reminder and any fee are
// recorded on the invoices.
export function ReminderDialog({ invoiceIds, onClose }: { invoiceIds?: string[]; onClose: () => void }) {
  const { invoices, saveInvoices } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const overdue = invoices.filter((i) => statusOf(i) === 'Overdue').sort((a, b) => daysPastDue(b) - daysPastDue(a));
  const [picked, setPicked] = useState<string[]>(invoiceIds ?? overdue.map((i) => i.id));
  const [byEmail, setByEmail] = useState(true);
  const [byText, setByText] = useState(false);
  const [feeOn, setFeeOn] = useState(false);
  const [feeType, setFeeType] = useState<FeeType>('% of balance');
  const [feeValue, setFeeValue] = useState(String(COMPANY.lateFeePct));
  const [template, setTemplate] = useState(TEMPLATE);
  const [contacts, setContacts] = useState<Record<string, { email: string; phone: string }>>(() =>
    Object.fromEntries(invoices.map((i) => [i.customer, { email: i.billTo.email, phone: i.billTo.phone }])),
  );
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<Group[] | null>(null);

  const chosen = overdue.filter((i) => picked.includes(i.id));
  const feeFor = (inv: InvoiceRecord) =>
    !feeOn ? 0 : feeType === '% of balance' ? round2((invoiceTotal(inv) * (Number(feeValue) || 0)) / 100) : round2(Number(feeValue) || 0);

  const groups: Group[] = [...new Set(chosen.map((i) => i.customer))].map((customer) => {
    const list = chosen.filter((i) => i.customer === customer);
    const balance = list.reduce((s, i) => s + invoiceTotal(i) + feeFor(i), 0);
    const rows = list
      .map((i) => `• ${i.id} · load ${i.loads.join(', ') || '—'} · issued ${fmtDate(i.issued)} · due ${fmtDate(i.due)} (${daysPastDue(i)} days late) · ${usd(invoiceTotal(i))}${feeFor(i) ? ` + late fee ${usd(feeFor(i))}` : ''}`)
      .join('\n');
    const c = contacts[customer] ?? { email: '', phone: '' };
    return {
      customer,
      invoices: list,
      email: c.email,
      phone: c.phone,
      subject: `Past due: ${list.map((i) => i.id).join(', ')} — ${COMPANY.name}`,
      message: template.replace(/\{customer\}/g, customer).replace(/\{invoices\}/g, rows).replace(/\{balance\}/g, usd(balance)),
      text: `${COMPANY.name}: ${list.length === 1 ? `invoice ${list[0].id} is` : `${list.length} invoices are`} past due, balance ${usd(balance)}.${byEmail && c.email ? ` Details sent to ${c.email}.` : ''} Questions: ${COMPANY.phone}`,
    };
  });

  const problems: string[] = [];
  if (chosen.length === 0) problems.push('Pick at least one invoice');
  if (!byEmail && !byText) problems.push('Choose email, text or both');
  if (feeOn && !(Number(feeValue) > 0)) problems.push('Enter the late fee');
  for (const g of groups) {
    if (byEmail && !isEmail(g.email)) problems.push(`${g.customer}: billing email`);
    if (byText && g.phone.replace(/\D/g, '').length < 10) problems.push(`${g.customer}: mobile number`);
  }

  const send = () => {
    setTried(true);
    if (problems.length) return;
    const how = [byEmail && 'email', byText && 'text'].filter(Boolean).join(' and ');
    saveInvoices(
      chosen.map((inv) => {
        const fee = feeFor(inv);
        const c = contacts[inv.customer] ?? { email: '', phone: '' };
        const to = [byEmail && c.email, byText && c.phone].filter(Boolean).join(', ');
        return {
          ...inv,
          lines: fee
            ? [...inv.lines, {
                kind: 'Late fee',
                description: `${feeType === '% of balance' ? `${feeValue}% of ${usd(invoiceTotal(inv))}` : 'Flat late fee'} · ${daysPastDue(inv)} days past due on ${fmtDate(TODAY)}`,
                qty: '1',
                rate: String(fee),
              }]
            : inv.lines,
          history: [...inv.history, { date: TODAY, text: `Reminder sent by ${how} to ${to}${fee ? ` · late fee ${usd(fee)} added` : ''}` }],
        };
      }),
    );
    setSent(groups);
    // One customer: open their email straight away.
    if (groups.length === 1) launch(byEmail ? mailtoHref(groups[0].email, groups[0].subject, groups[0].message) : smsHref(groups[0].phone, groups[0].text));
  };

  const setContact = (customer: string, key: 'email' | 'phone', v: string) =>
    setContacts((p) => ({ ...p, [customer]: { ...(p[customer] ?? { email: '', phone: '' }), [key]: v } }));

  return (
    <dialog ref={ref} className="ui-dialog is-medium" aria-label="Send reminders" onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          {sent ? (
            <>
              <div>
                <h2 className="ui-h2" style={{ margin: 0 }}>Reminders recorded</h2>
                <p className="ui-p" style={{ marginTop: 4 }}>
                  {sent.reduce((n, g) => n + g.invoices.length, 0)} invoice(s) updated{feeOn ? ' with late fees' : ''}. Open each message below to send it from your own email or phone.
                </p>
              </div>
              {sent.map((g) => (
                <div key={g.customer} className="ui-panel">
                  <div className="ui-panel-head">
                    <strong>{g.customer}</strong>
                    <span className="muted">{g.invoices.map((i) => i.id).join(', ')}</span>
                    <div style={{ flex: 1 }} />
                    {byEmail && <button type="button" className="ui-btn" onClick={() => launch(mailtoHref(g.email, g.subject, g.message))}>Open email ↗</button>}
                    {byText && <button type="button" className="ui-btn" onClick={() => launch(smsHref(g.phone, g.text))}>Open text ↗</button>}
                  </div>
                  <div className="ui-stop-meta">{[byEmail && g.email, byText && g.phone].filter(Boolean).join(' · ')}</div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div>
                <h2 className="ui-h2" style={{ margin: 0 }}>Send reminders</h2>
                <p className="ui-p" style={{ marginTop: 4 }}>Remind customers about past-due invoices by email and text, and add a late fee if your terms allow it.</p>
              </div>

              <div>
                <div className="ui-label" style={{ marginBottom: 8 }}>Invoices</div>
                <div className="ui-pick-list">
                  {overdue.map((i) => (
                    <label key={i.id} className="ui-check">
                      <input
                        type="checkbox"
                        checked={picked.includes(i.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))}
                      />
                      <strong>{i.id}</strong>
                      <span className="muted"> · {i.customer} · {daysPastDue(i)} days late · {usd(invoiceTotal(i))}</span>
                      {feeFor(i) > 0 && picked.includes(i.id) && <span className="ui-chip ui-chip-amber" style={{ marginLeft: 6 }}>+ {usd(feeFor(i))}</span>}
                    </label>
                  ))}
                  {overdue.length === 0 && <div className="ui-stop-meta">Nothing is past due.</div>}
                </div>
              </div>

              <div className="ui-panel">
                <label className="ui-check">
                  <input type="checkbox" checked={feeOn} onChange={(e) => setFeeOn(e.target.checked)} />
                  <strong>Add a late fee</strong>
                  <span className="muted"> · your terms say {COMPANY.lateFeePct}% per month</span>
                </label>
                {feeOn && (
                  <div className="ui-form-grid" style={{ marginTop: 14 }}>
                    <Field label="Fee">
                      <Choice options={['% of balance', 'Flat amount'] as FeeType[]} value={feeType} onChange={(v) => { setFeeType(v); setFeeValue(v === '% of balance' ? String(COMPANY.lateFeePct) : '50'); }} />
                    </Field>
                    <Field label={feeType === '% of balance' ? 'Percent' : 'Amount ($)'} required error={tried && !(Number(feeValue) > 0) && 'Required'}>
                      <input className="ui-input" inputMode="decimal" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>

              <div>
                <div className="ui-label" style={{ marginBottom: 8 }}>Send by</div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <label className="ui-check"><input type="checkbox" checked={byEmail} onChange={(e) => setByEmail(e.target.checked)} />Email</label>
                  <label className="ui-check"><input type="checkbox" checked={byText} onChange={(e) => setByText(e.target.checked)} />Text message</label>
                </div>
              </div>

              {groups.length > 0 && (
                <div>
                  <div className="ui-label" style={{ marginBottom: 8 }}>Recipients</div>
                  {groups.map((g) => (
                    <div key={g.customer} className="ui-form-grid" style={{ marginBottom: 12 }}>
                      <Field label={`${g.customer} · email`} error={tried && byEmail && !isEmail(g.email) && 'Enter the billing email'}>
                        <input className="ui-input" type="email" value={g.email} onChange={(e) => setContact(g.customer, 'email', e.target.value)} />
                      </Field>
                      <Field label="Mobile for texts" error={tried && byText && g.phone.replace(/\D/g, '').length < 10 && 'Ten digits'}>
                        <input className="ui-input" type="tel" value={g.phone} onChange={(e) => setContact(g.customer, 'phone', e.target.value)} />
                      </Field>
                    </div>
                  ))}
                </div>
              )}

              <Field label="Email message" wide help="{customer}, {invoices} and {balance} are filled in for each customer.">
                <textarea className="ui-input" rows={10} value={template} onChange={(e) => setTemplate(e.target.value)} />
              </Field>
              {byText && groups[0] && (
                <div className="ui-note"><strong>Text preview:</strong> {groups[0].text}</div>
              )}
              {tried && problems.length > 0 && <div className="ui-errors">{problems.join(' · ')}</div>}
              <div className="ui-note">RunTruck does not send email or texts itself yet: after Send, each message opens in your email or messaging app, filled in. The reminder{feeOn ? ' and late fee are' : ' is'} recorded on each invoice.</div>
            </>
          )}
        </section>
        <footer className="ui-dialog-foot">
          {sent ? (
            <>
              <div style={{ flex: 1 }} />
              <button type="button" className="ui-btn ui-btn-primary" onClick={closeNow}>Done</button>
            </>
          ) : (
            <>
              <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
              <div style={{ flex: 1 }} />
              <span className="muted" style={{ fontSize: 13 }}>{chosen.length} invoice(s) · {groups.length} customer(s)</span>
              <button type="button" className="ui-btn ui-btn-primary" onClick={send}>Send reminders</button>
            </>
          )}
        </footer>
      </div>
    </dialog>
  );
}

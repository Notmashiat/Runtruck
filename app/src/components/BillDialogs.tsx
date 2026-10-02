import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import {
  BILL_CATEGORIES, BILL_KINDS, BILL_TERMS, ENDS, FREQUENCIES, PAY_METHODS,
  billFromForm, billToForm, blankBillForm, dueFrom, nextBillId, nextInSeries,
  type BillDocument, type BillRecord,
} from '../data/bills';
import { TERMINALS, type FormValues } from '../data/fleet';
import { fmtDate, usd } from '../data/invoicing';
import { downloadDocument, fileSize, openDocument } from '../lib/attachments';
import { isoDateAt, todayIso } from '../lib/clock';
import { PHONE } from '../lib/rules';
import { AttachDialog } from './AttachDialog';
import { Field, useModal } from './FormBits';
import { RecordDialog, type SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const YES_NO = ['Yes', 'No'];

// Kept here too for the files that import them from this module.
export { downloadDocument, fileSize, openDocument, readAttachment } from '../lib/attachments';

// The documents on a bill: attach (PDF, images, Word, Excel), open, download, remove.
export function BillDocuments({ docs, onChange, owner = 'Documents', hint = 'The vendor’s invoice, receipts, contracts' }: { docs: BillDocument[]; onChange: (d: BillDocument[]) => void; owner?: string; hint?: string }) {
  const [attaching, setAttaching] = useState(false);

  return (
    <div className="bill-docs">
      <div className="bill-docs-head">
        <span className="ui-label">Documents</span>
        <span className="ui-stop-meta" style={{ marginTop: 0 }}>{hint} · PDF, images, Word or Excel, up to 2 MB each</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAttaching(true)}>Attach document</button>
      </div>
      {docs.length === 0 ? (
        <div className="ui-stop-meta">No documents attached.</div>
      ) : (
        <ul className="bill-doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <span className="bill-doc-icon" aria-hidden="true">{d.type === 'application/pdf' ? 'PDF' : d.type.startsWith('image/') ? 'IMG' : 'DOC'}</span>
              <span className="bill-doc-name">
                <button type="button" className="crm-doc-open" onClick={() => { void openDocument(d); }}>{d.name}</button>
                <span className="ui-stop-meta" style={{ marginTop: 0 }}>{fileSize(d.size)} · added {fmtDate(isoDateAt(new Date(d.added)))}</span>
              </span>
              <button type="button" className="ui-link" onClick={() => { void openDocument(d); }}>Open</button>
              <button type="button" className="ui-link" onClick={() => downloadDocument(d)}>Download</button>
              <button type="button" className="ui-link is-danger" onClick={() => { if (window.confirm(`Remove ${d.name}?`)) onChange(docs.filter((x) => x.id !== d.id)); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {attaching && <AttachDialog title={owner} onAttach={(added) => onChange([...docs, ...added])} onClose={() => setAttaching(false)} />}
    </div>
  );
}

function billSections(units: string[], trailers: string[], drivers: string[], loads: string[]): SectionSpec[] {
  const recurring = (v: FormValues) => val(v, 'kind') === 'Recurring';
  return [
    {
      title: 'Bill',
      help: 'Who you owe, for what, and when it is due.',
      fields: [
        { key: 'vendor', label: 'Vendor', required: true, placeholder: 'e.g. Pilot Flying J' },
        { key: 'billNumber', label: 'Vendor invoice #', placeholder: 'As printed on their bill' },
        { key: 'category', label: 'Category', type: 'select', required: true, options: BILL_CATEGORIES },
        {
          key: 'amount', label: 'Amount ($)', type: 'number', required: true,
          check: (value) => (Number(value.replace(/[$,]/g, '')) > 0 ? null : 'More than 0'),
        },
        { key: 'description', label: 'What it is for', wide: true, placeholder: 'e.g. Steer tires, T-107' },
        { key: 'issued', label: 'Bill date', type: 'date', required: true },
        { key: 'terms', label: 'Terms', type: 'select', required: true, options: BILL_TERMS, help: 'Sets the due date; change it below if needed.' },
        { key: 'due', label: 'Due date', type: 'date', required: true, check: (value, v) => (value >= val(v, 'issued') ? null : 'On or after the bill date') },
      ],
    },
    {
      title: 'Repeats',
      help: 'A one-time bill is paid once. A recurring bill (rent, insurance, leases, subscriptions) makes the next bill by itself each time one is paid.',
      fields: [
        { key: 'kind', label: 'This bill is', type: 'select', required: true, options: BILL_KINDS, wide: true },
        { key: 'frequency', label: 'Repeats', type: 'select', required: true, options: [...FREQUENCIES], show: recurring },
        { key: 'ends', label: 'Ends', type: 'select', required: true, options: ENDS, show: recurring },
        {
          key: 'endsOn', label: 'Last bill on or before', type: 'date', required: true,
          show: (v) => recurring(v) && val(v, 'ends') === 'On a date',
          check: (value, v) => (value >= val(v, 'due') ? null : 'On or after this bill’s due date'),
        },
      ],
    },
    {
      title: 'Charge to',
      help: 'Optional: tie the cost to a truck, trailer, driver, load or terminal, so it shows in their costs.',
      fields: [
        { key: 'truck', label: 'Truck', type: 'select', options: units },
        { key: 'trailer', label: 'Trailer', type: 'select', options: trailers },
        { key: 'driver', label: 'Driver', type: 'select', options: drivers },
        { key: 'load', label: 'Load', type: 'select', options: loads },
        { key: 'terminal', label: 'Terminal', type: 'select', options: TERMINALS },
      ],
    },
    {
      title: 'Payment',
      help: 'How and when it gets paid, and how to reach the vendor.',
      fields: [
        { key: 'method', label: 'Pay by', type: 'select', required: true, options: PAY_METHODS },
        { key: 'autopay', label: 'Paid automatically', type: 'select', required: true, options: YES_NO, help: 'The vendor or bank takes it on the due date.' },
        { key: 'scheduledFor', label: 'Schedule payment for', type: 'date', show: (v) => val(v, 'autopay') !== 'Yes' && val(v, 'paidAlready') !== 'Yes', help: 'Leave blank if not scheduled yet.' },
        { key: 'paidAlready', label: 'Already paid?', type: 'select', required: true, options: YES_NO },
        { key: 'paidDate', label: 'Paid on', type: 'date', required: true, show: (v) => val(v, 'paidAlready') === 'Yes' },
        { key: 'paidRef', label: 'Check # or reference', show: (v) => val(v, 'paidAlready') === 'Yes' },
        { key: 'vendorAccount', label: 'Your account # with them' },
        { key: 'vendorEmail', label: 'Vendor billing email', type: 'email' },
        { key: 'vendorPhone', label: 'Vendor phone', type: 'tel', check: PHONE },
        { key: 'remitTo', label: 'Remit to', type: 'textarea', placeholder: 'Where payments go, if not on file' },
      ],
    },
    {
      title: 'Documents & notes',
      help: 'Attach the vendor’s invoice and anything else that goes with the bill.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Approval, disputes, warranty details…' }],
    },
  ];
}

// New bill and Edit bill.
export function BillDialog({ bill, onClose }: { bill?: BillRecord; onClose: () => void }) {
  const { bills, saveBill, deleteBill, trucks, trailers, drivers, loads } = useAppShell();
  const [id] = useState(() => bill?.id ?? nextBillId(bills));
  const [docs, setDocs] = useState<BillDocument[]>(bill?.documents ?? []);
  const [initial] = useState<FormValues>(() => (bill ? billToForm(bill) : blankBillForm(todayIso())));

  const sections = billSections(
    trucks.filter((t) => !t.archived).map((t) => t.unit),
    trailers.filter((t) => !t.archived).map((t) => t.unit),
    drivers.filter((d) => !d.archived).map((d) => d.name),
    loads.map((l) => l.id),
  );

  return (
    <RecordDialog
      heading={bill ? `Edit ${bill.id}` : 'New bill'}
      saveLabel={bill ? 'Save changes' : 'Add bill'}
      sections={sections}
      initial={initial}
      isNew={!bill}
      recordLabel={bill ? `${bill.vendor} bill ${bill.id}` : 'bill'}
      noun="bill"
      deleteNote="The bill and its documents are removed for good. To keep a record, void it instead."
      extras={{ 'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={bill ? `${bill.vendor} · ${bill.id}` : 'New bill'} /> }}
      adjust={(_prev, next, key) => {
        // The due date follows the bill date and terms; vendor auto-pay pays itself.
        if (key === 'issued' || key === 'terms') return { ...next, due: dueFrom(val(next, 'issued'), val(next, 'terms')) || val(next, 'due') };
        if (key === 'method' && val(next, 'method') === 'Vendor auto-pay') return { ...next, autopay: 'Yes' };
        return next;
      }}
      onSave={(v) => saveBill(billFromForm(v, id, docs, bill))}
      onDelete={bill ? () => deleteBill(bill.id) : undefined}
      onClose={onClose}
    />
  );
}

// Record a payment. A recurring bill makes its next bill at the same time.
export function PayBillDialog({ bill, onClose, onPaid }: { bill: BillRecord; onClose: () => void; onPaid?: (message: string) => void }) {
  const { bills, saveBill } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState(String(bill.amount));
  const [method, setMethod] = useState(bill.method || 'ACH');
  const [reference, setReference] = useState('');
  const [makeNext, setMakeNext] = useState(true);
  const next = nextInSeries(bill, nextBillId(bills));
  const bad = !date || !(Number(amount.replace(/[$,]/g, '')) > 0);

  const pay = () => {
    saveBill({ ...bill, paid: { date, amount: Number(amount.replace(/[$,]/g, '')), method, reference: reference.trim() }, scheduledFor: undefined, updated: new Date().toISOString() });
    if (next && makeNext) saveBill(next);
    onPaid?.(`${bill.vendor} paid${next && makeNext ? `; next bill ${next.id} is due ${fmtDate(next.due)}` : ''}.`);
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-compact" aria-label={`Pay ${bill.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Mark paid</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{bill.vendor} · {usd(bill.amount)}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{bill.description || bill.category} · due {fmtDate(bill.due)}</p>
          </div>
          <div className="ui-form-grid">
            <Field label="Paid on" required><input className="ui-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Amount paid ($)" required error={!(Number(amount.replace(/[$,]/g, '')) > 0) ? 'More than 0' : undefined}>
              <input className="ui-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Paid by">
              <select className="ui-input" value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </Field>
            <Field label="Check # or reference"><input className="ui-input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
          {next && (
            <label className="ui-check">
              <input type="checkbox" checked={makeNext} onChange={(e) => setMakeNext(e.target.checked)} />
              Make the next {bill.frequency?.toLowerCase()} bill ({next.id}, due {fmtDate(next.due)})
            </label>
          )}
          {bill.frequency && !next && <div className="ui-note">This was the last bill in the series (it ends {fmtDate(bill.endsOn ?? '')}).</div>}
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={bad} onClick={pay}>Mark paid</button>
        </footer>
      </div>
    </dialog>
  );
}

import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import {
  BATCH_METHODS, FACTORING, STATUS_TAG, TODAY, batchTotal, fmtDate, invoiceTotal, nextBatchId, statusOf, usd, type Batch,
} from '../data/invoicing';
import { CUSTOMERS } from '../data/mock';
import { Field, useModal } from './FormBits';
import { ConfirmDialog } from './RecordDialog';
import { Tag } from './Tag';

// New batch / Edit batch: pick the recipient (a customer, or the factoring
// company) and the invoices that go to them together.
export function BatchDialog({ batch, onClose }: { batch?: Batch; onClose: () => void }) {
  const { invoices, batches, saveBatch, deleteBatch } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [start] = useState<Batch>(() =>
    batch
      ? { ...batch, invoiceIds: [...batch.invoiceIds] }
      : { id: nextBatchId(batches), created: TODAY, recipient: '', method: BATCH_METHODS[0], invoiceIds: [], notes: '' },
  );
  const [b, setB] = useState<Batch>(start);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const factoring = FACTORING.includes(b.recipient);
  const inOtherBatch = new Map(batches.filter((x) => x.id !== b.id).flatMap((x) => x.invoiceIds.map((id) => [id, x.id] as const)));
  // Issued, unpaid invoices for this recipient that are not in another batch
  // (plus whatever is already in this one).
  const eligible = invoices
    .filter((i) => b.invoiceIds.includes(i.id) || (!i.draft && !i.paid && !inOtherBatch.has(i.id)))
    .filter((i) => !b.recipient || factoring || i.customer === b.recipient)
    .sort((x, y) => (x.issued < y.issued ? 1 : -1));
  const total = batchTotal(b, invoices);
  const errors = {
    recipient: !b.recipient ? 'Choose who the batch goes to' : '',
    invoices: b.invoiceIds.length === 0 ? 'Pick at least one invoice' : '',
  };
  const dirty = JSON.stringify(b) !== JSON.stringify(start);

  const requestClose = () => {
    if (!dirty || window.confirm(batch ? `Discard your changes to ${b.id}?` : 'Discard this new batch?')) closeNow();
  };
  const setRecipient = (r: string) =>
    setB((p) => ({
      ...p,
      recipient: r,
      method: FACTORING.includes(r) ? 'Factoring portal upload' : p.method === 'Factoring portal upload' ? BATCH_METHODS[0] : p.method,
      invoiceIds: p.invoiceIds.filter((id) => FACTORING.includes(r) || invoices.find((i) => i.id === id)?.customer === r),
    }));
  const toggle = (id: string, on: boolean) => setB((p) => ({ ...p, invoiceIds: on ? [...p.invoiceIds, id] : p.invoiceIds.filter((x) => x !== id) }));
  const allOn = eligible.length > 0 && eligible.every((i) => b.invoiceIds.includes(i.id));

  const save = () => {
    setTried(true);
    if (errors.recipient || errors.invoices) return;
    saveBatch({ ...b, notes: b.notes.trim() });
    closeNow();
  };

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-medium"
      aria-label={batch ? `Edit batch ${b.id}` : 'New batch'}
      onClose={(e) => { if (ownEvent(e)) onClose(); }}
      onCancel={(e) => {
        if (!ownEvent(e)) return;
        e.preventDefault();
        requestClose();
      }}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={requestClose} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>{batch ? `Edit batch ${b.id}` : `New batch ${b.id}`}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>Invoices that go out together — to one customer, or to the factoring company for an advance.</p>
          </div>
          <div className="ui-form-grid">
            <Field label="Send to" required error={tried && errors.recipient}>
              <select className="ui-input" value={b.recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option value="">Select…</option>
                <optgroup label="Customers">
                  {CUSTOMERS.map((c) => <option key={c.name}>{c.name}</option>)}
                </optgroup>
                <optgroup label="Factoring">
                  {FACTORING.map((f) => <option key={f}>{f}</option>)}
                </optgroup>
              </select>
            </Field>
            <Field label="How it is sent" required>
              <select className="ui-input" value={b.method} onChange={(e) => setB((p) => ({ ...p, method: e.target.value }))}>
                {BATCH_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Batch date" required>
              <input className="ui-input" type="date" value={b.created} onChange={(e) => setB((p) => ({ ...p, created: e.target.value }))} />
            </Field>
            <Field label="Sent on" help="Leave blank while the batch is still being put together.">
              <input className="ui-input" type="date" value={b.sentOn ?? ''} onChange={(e) => setB((p) => ({ ...p, sentOn: e.target.value || undefined }))} />
            </Field>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span className="ui-label">Invoices ({b.invoiceIds.length} · {usd(total)})</span>
              <div style={{ flex: 1 }} />
              {eligible.length > 1 && (
                <button type="button" className="ui-link" onClick={() => setB((p) => ({ ...p, invoiceIds: allOn ? [] : eligible.map((i) => i.id) }))}>
                  {allOn ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {tried && errors.invoices && <div className="ui-errors" style={{ marginBottom: 8 }}>{errors.invoices}</div>}
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr><th aria-label="Include" /><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Amount</th></tr>
                </thead>
                <tbody>
                  {eligible.map((i) => {
                    const st = statusOf(i);
                    return (
                      <tr key={i.id} className="is-clickable" onClick={() => toggle(i.id, !b.invoiceIds.includes(i.id))}>
                        <td><input type="checkbox" aria-label={`Include ${i.id}`} checked={b.invoiceIds.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} onClick={(e) => e.stopPropagation()} /></td>
                        <td className="strong">{i.id}</td>
                        <td>{i.customer}</td>
                        <td>{fmtDate(i.issued, true)}</td>
                        <td>{fmtDate(i.due, true)}</td>
                        <td><Tag label={st} tagClass={STATUS_TAG[st]} /></td>
                        <td className="num">{usd(invoiceTotal(i))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {eligible.length === 0 && (
                <div className="ui-empty" style={{ padding: 24 }}>
                  {b.recipient ? `No unbatched, unpaid invoices for ${b.recipient}.` : 'Choose who the batch goes to first.'}
                </div>
              )}
            </div>
          </div>

          <Field label="Notes" wide>
            <textarea className="ui-input" value={b.notes} onChange={(e) => setB((p) => ({ ...p, notes: e.target.value }))} placeholder="e.g. Upload with PODs to the AP portal" />
          </Field>
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          {batch && <button type="button" className="ui-btn ui-btn-danger" onClick={() => setConfirmDelete(true)}>Delete batch</button>}
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>{batch ? 'Save changes' : 'Create batch'}</button>
        </footer>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete batch ${b.id}?`}
          body="The batch is removed. Its invoices are not deleted — they stay open and can go into another batch."
          confirmLabel="Yes, delete batch"
          onConfirm={() => {
            setConfirmDelete(false);
            deleteBatch(b.id);
            closeNow();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </dialog>
  );
}

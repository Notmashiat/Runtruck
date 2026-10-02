import { useRef, useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import { ON_FILE, type CustomerRecord } from '../data/customers';
import { fmtDate } from '../data/invoicing';
import { isoDateAt } from '../lib/clock';
import { downloadDocument, fileSize, openDocument, readAttachment } from './BillDialogs';
import { useModal } from './FormBits';

const kindLabel = (d: BillDocument) => (d.type === 'application/pdf' ? 'PDF' : d.type.startsWith('image/') ? 'IMG' : 'DOC');

// Every document a customer has: one row per required document (W-9,
// credit application…) with its file, or "on file" for a paper copy, then
// any other files. Attach, open, download, replace and remove from here.
export function CustomerDocs({ docs, onFile, onChange }: { docs: BillDocument[]; onFile: string[]; onChange: (docs: BillDocument[], onFile: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pendingKind, setPendingKind] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');

  const pick = (kind?: string) => {
    setError('');
    setPendingKind(kind);
    input.current?.click();
  };

  const attach = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: BillDocument[] = [];
    const tooBig: string[] = [];
    for (const f of pendingKind ? [files[0]] : [...files]) {
      const doc = await readAttachment(f, pendingKind);
      if (typeof doc === 'string') tooBig.push(doc);
      else added.push(doc);
    }
    if (tooBig.length) setError(`${tooBig.join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 2 MB. Attach a smaller copy.`);
    if (added.length) {
      // A required document replaces the file it had; attaching it marks it on file.
      const kept = pendingKind ? docs.filter((d) => d.kind !== pendingKind) : docs;
      onChange([...kept, ...added], pendingKind && !onFile.includes(pendingKind) ? [...onFile, pendingKind] : onFile);
    }
    if (input.current) input.current.value = '';
  };

  const remove = (d: BillDocument) => {
    if (window.confirm(`Remove ${d.name}?`)) onChange(docs.filter((x) => x.id !== d.id), onFile);
  };
  const others = docs.filter((d) => !d.kind || !ON_FILE.includes(d.kind));

  const fileActions = (d: BillDocument) => (
    <>
      <button type="button" className="ui-link" onClick={() => { void openDocument(d); }}>Open</button>
      <button type="button" className="ui-link" onClick={() => downloadDocument(d)}>Download</button>
      <button type="button" className="ui-link is-danger" onClick={() => remove(d)}>Remove</button>
    </>
  );

  return (
    <div className="bill-docs">
      <input ref={input} type="file" hidden multiple={!pendingKind} accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => { void attach(e.target.files); }} />
      {error && <div className="ui-errors" role="alert">{error}</div>}
      <ul className="bill-doc-list">
        {ON_FILE.map((kind) => {
          const d = docs.find((x) => x.kind === kind);
          const on = onFile.includes(kind);
          return (
            <li key={kind} className={d || on ? '' : 'is-missing'}>
              <span className="bill-doc-icon" aria-hidden="true">{d ? kindLabel(d) : on ? '✓' : '—'}</span>
              <span className="bill-doc-name">
                {d ? <button type="button" className="crm-doc-open" onClick={() => { void openDocument(d); }}>{kind}</button> : <strong>{kind}</strong>}
                <span className="ui-stop-meta" style={{ marginTop: 0 }}>
                  {d ? `${d.name} · ${fileSize(d.size)} · added ${fmtDate(isoDateAt(new Date(d.added)))}` : on ? 'On file (no copy attached)' : 'Not on file'}
                </span>
              </span>
              {d ? fileActions(d) : (
                <label className="ui-check crm-paper">
                  <input type="checkbox" checked={on} onChange={(e) => onChange(docs, e.target.checked ? [...onFile, kind] : onFile.filter((k) => k !== kind))} />
                  Paper copy on file
                </label>
              )}
              <button type="button" className="ui-btn ui-btn-sm" onClick={() => pick(kind)}>{d ? 'Replace' : 'Attach'}</button>
            </li>
          );
        })}
      </ul>
      <div className="bill-docs-head">
        <span className="ui-label">Other documents</span>
        <span className="ui-stop-meta" style={{ marginTop: 0 }}>PDF, images, Word or Excel, up to 2 MB each</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="ui-btn ui-btn-sm" onClick={() => pick(undefined)}>Attach document</button>
      </div>
      {others.length === 0 ? (
        <div className="ui-stop-meta">None.</div>
      ) : (
        <ul className="bill-doc-list">
          {others.map((d) => (
            <li key={d.id}>
              <span className="bill-doc-icon" aria-hidden="true">{kindLabel(d)}</span>
              <span className="bill-doc-name">
                <button type="button" className="crm-doc-open" onClick={() => { void openDocument(d); }}>{d.name}</button>
                <span className="ui-stop-meta" style={{ marginTop: 0 }}>{fileSize(d.size)} · added {fmtDate(isoDateAt(new Date(d.added)))}</span>
              </span>
              {fileActions(d)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// View all: every document of one customer, managed in place.
export function CustomerDocsDialog({ customer, onClose }: { customer: CustomerRecord; onClose: () => void }) {
  const { customers, saveCustomer } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const c = customers.find((x) => x.id === customer.id) ?? customer;
  const files = c.documents.length;

  return (
    <dialog ref={ref} className="ui-dialog is-compact crm-docs-dialog" aria-label={`Documents · ${c.name}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Documents</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{c.name}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>
              {files} file{files === 1 ? '' : 's'} · {ON_FILE.filter((k) => c.onFile.includes(k) || c.documents.some((d) => d.kind === k)).length} of {ON_FILE.length} required documents on file. Click a document to open it.
            </p>
          </div>
          <CustomerDocs
            docs={c.documents} onFile={c.onFile}
            onChange={(documents, onFile) => saveCustomer({ ...c, documents, onFile, updated: new Date().toISOString() })}
          />
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn ui-btn-primary" onClick={closeNow}>Done</button>
        </footer>
      </div>
    </dialog>
  );
}

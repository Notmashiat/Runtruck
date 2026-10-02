import { useRef, useState, type DragEvent } from 'react';
import type { BillDocument } from '../data/bills';
import { fileSize, readAttachment } from '../lib/attachments';
import { useModal } from './FormBits';

export const OTHER = 'Other document';

interface Picked {
  file: File;
  kind: string;
}

// A guess at which required document a file is, from its name.
function guessKind(name: string, kinds: string[]): string {
  const n = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/w-?9/, 'W-9'],
    [/credit/, 'Credit application'],
    [/rate/, 'Rate agreement'],
    [/routing/, 'Routing guide'],
    [/insurance|\bcoi\b|certificate/, 'Certificate of insurance sent'],
    [/agreement|contract|shipping/, 'Signed shipping agreement'],
  ];
  const hit = rules.find(([re, kind]) => re.test(n) && kinds.includes(kind));
  return hit ? hit[1] : OTHER;
}

// The one way RunTruck attaches documents: drop files on the box or browse
// for them, say what each one is (when there are document types), then
// attach. Nothing is saved until Attach. With `only`, it attaches one file
// as that document (e.g. Replace W-9).
export function AttachDialog({ title, kinds = [], only, accept = 'application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt', onAttach, onClose }: {
  title: string;
  kinds?: string[];
  only?: string;
  accept?: string;
  onAttach: (docs: BillDocument[]) => void;
  onClose: () => void;
}) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files];
    if (only) setPicked(list.length ? [{ file: list[0], kind: only }] : []);
    else setPicked((p) => [...p, ...list.map((file) => ({ file, kind: kinds.length ? guessKind(file.name, kinds) : OTHER }))]);
    if (input.current) input.current.value = '';
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };
  const ok = picked;
  const total = picked.reduce((n, p) => n + p.file.size, 0);
  const [failed, setFailed] = useState<string[]>([]);

  const attach = async () => {
    setBusy(true);
    const docs: BillDocument[] = [];
    const problems: string[] = [];
    for (const p of ok) {
      const d = await readAttachment(p.file, p.kind === OTHER ? undefined : p.kind);
      if (typeof d === 'string') problems.push(d);
      else docs.push(d);
    }
    setBusy(false);
    if (docs.length) onAttach(docs);
    if (problems.length) {
      // Keep the popup open with what did not go through.
      setFailed(problems);
      setPicked(picked.filter((p) => !docs.some((d) => d.name === p.file.name)));
      return;
    }
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-compact attach-dialog" aria-label={title} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">{only ? `Attach ${only}` : 'Attach documents'}</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{title}</h2>
          </div>
          <div
            className={`attach-drop${over ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          >
            <span className="attach-drop-icon" aria-hidden="true">⤒</span>
            <strong>{only ? 'Drag and drop the file here' : 'Drag and drop files here'}</strong>
            <span>or <span className="attach-browse">browse your computer</span></span>
            <span className="ui-stop-meta" style={{ marginTop: 0 }}>{accept.includes('.doc') ? 'PDF, images, Word or Excel' : 'PDF or images'} · any size</span>
          </div>
          <input ref={input} type="file" multiple={!only} hidden accept={accept} onChange={(e) => add(e.target.files)} />

          {picked.length > 0 && (
            <ul className="bill-doc-list">
              {picked.map((p, i) => {
                return (
                  <li key={`${p.file.name}-${i}`}>
                    <span className="bill-doc-icon" aria-hidden="true">{p.file.type === 'application/pdf' ? 'PDF' : p.file.type.startsWith('image/') ? 'IMG' : 'DOC'}</span>
                    <span className="bill-doc-name">
                      <strong>{p.file.name}</strong>
                      <span className="ui-stop-meta" style={{ marginTop: 0 }}>{fileSize(p.file.size)}</span>
                    </span>
                    {!only && kinds.length > 0 && (
                      <select
                        className="ui-input attach-kind" aria-label={`What ${p.file.name} is`} value={p.kind}
                        onChange={(e) => setPicked(picked.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
                      >
                        {[...kinds, OTHER].map((k) => <option key={k}>{k}</option>)}
                      </select>
                    )}
                    <button type="button" className="ui-link is-danger" onClick={() => setPicked(picked.filter((_, j) => j !== i))}>Remove</button>
                  </li>
                );
              })}
            </ul>
          )}
          {failed.length > 0 && <div className="ui-errors" role="alert">{failed.join(' · ')}</div>}
          {ok.some((p, i) => p.kind !== OTHER && ok.findIndex((q) => q.kind === p.kind) !== i) && (
            <div className="ui-note">Two files are marked as the same document; the last one is kept.</div>
          )}
        </section>
        <footer className="ui-dialog-foot">
          <div className="ui-stop-meta" style={{ marginTop: 0 }}>
            {picked.length === 0 ? 'No files chosen yet.' : `${ok.length} file${ok.length === 1 ? '' : 's'} ready · ${fileSize(total)}`}
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={ok.length === 0 || busy} onClick={() => { void attach(); }}>
            {busy ? 'Attaching…' : `Attach ${ok.length || ''} file${ok.length === 1 ? '' : 's'}`.replace('  ', ' ')}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

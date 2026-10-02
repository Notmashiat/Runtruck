import { useMemo, useState, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { fmtDate } from '../data/invoicing';
import { USER } from '../data/mock';
import { can } from '../lib/auth';
import { formatNow, todayIso } from '../lib/clock';
import { buildExportSets, filterRows, type ExportFilters, type ExportRow, type ExportSet } from '../lib/exportData';
import { downloadExport, type ExportDoc, type ExportFormat } from '../lib/exportFiles';
import { useModal } from './FormBits';

const FORMATS: { key: ExportFormat; label: string; ext: string; about: string }[] = [
  { key: 'pdf', label: 'PDF', ext: '.pdf', about: 'Formatted tables, ready to print or email.' },
  { key: 'docx', label: 'Word', ext: '.docx', about: 'An editable document with a table for each set.' },
  { key: 'xlsx', label: 'Excel', ext: '.xlsx', about: 'One sheet per set, for sorting, filtering and formulas.' },
  { key: 'csv', label: 'CSV', ext: '.csv', about: 'Plain data for other software; several sets come zipped.' },
];

const NO_FILTERS: ExportFilters = { from: '', to: '', drivers: [], trucks: [], customers: [], contains: '', archived: false };
const shortIso = (iso: string) => fmtDate(iso);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function Group({ title, about, children }: { title: string; about?: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <div className="set-group-head">
        <h3>{title}</h3>
        {about && <p>{about}</p>}
      </div>
      {children}
    </section>
  );
}

// "All drivers" until some are ticked; opens to a searchable checklist.
function MultiPick({ label, all, options, value, onChange }: { label: string; all: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="exp-pick">
      <div className="exp-pick-head">
        <span className="ui-field-label">{label}</span>
        <button type="button" className="ui-btn ui-btn-sm" onClick={() => setOpen(!open)} aria-expanded={open} disabled={options.length === 0}>
          {options.length === 0 ? 'None in these sets' : value.length === 0 ? all : `${value.length} chosen`} {options.length > 0 && (open ? '▴' : '▾')}
        </button>
        {value.length > 0 && <button type="button" className="ui-link" onClick={() => onChange([])}>Clear</button>}
      </div>
      {open && (
        <div className="exp-pick-list">
          {options.length > 8 && <input className="ui-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="exp-pick-items">
            {shown.map((o) => (
              <label key={o} className="ui-check">
                <input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
                {o}
              </label>
            ))}
            {shown.length === 0 && <span className="ui-stop-meta">Nothing matches.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

interface Result {
  set: ExportSet;
  rows: ExportRow[];
  columns: ExportSet['columns'];
}

function describeFilters(f: ExportFilters): string {
  const parts: string[] = [];
  if (f.from || f.to) parts.push(`Dates ${f.from ? shortIso(f.from) : 'any'} to ${f.to ? shortIso(f.to) : 'any'}`);
  if (f.drivers.length) parts.push(`Drivers: ${f.drivers.join(', ')}`);
  if (f.trucks.length) parts.push(`Units: ${f.trucks.join(', ')}`);
  if (f.customers.length) parts.push(`Customers: ${f.customers.join(', ')}`);
  if (f.contains.trim()) parts.push(`Containing "${f.contains.trim()}"`);
  if (f.archived) parts.push('Archived records included');
  return parts.length ? parts.join(' · ') : 'No filters: every record';
}

function ReviewDialog({ results, filters, format, name, landscape, onDownloaded, onClose }: {
  results: Result[];
  filters: ExportFilters;
  format: ExportFormat;
  name: string;
  landscape: boolean;
  onDownloaded: (file: string) => void;
  onClose: () => void;
}) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const fmt = FORMATS.find((x) => x.key === format) ?? FORMATS[0];
  const total = results.reduce((n, r) => n + r.rows.length, 0);
  const fileName = format === 'csv' && results.length > 1 ? `${name}.zip` : `${name}${fmt.ext}`;

  const download = () => {
    const doc: ExportDoc = {
      title: name,
      subtitle: `${USER.company} · exported by ${USER.name} on ${formatNow(new Date(), { dateStyle: 'medium', timeStyle: 'short' })} · ${describeFilters(filters)}`,
      landscape,
      tables: results.map((r) => ({
        title: r.set.label,
        note: r.set.dateLabel && (filters.from || filters.to) ? `dates by ${r.set.dateLabel}` : '',
        columns: r.columns.map((c) => c.label),
        rows: r.rows.map((row) => r.columns.map((c) => row.values[c.key] ?? '')),
      })),
    };
    onDownloaded(downloadExport(doc, format, name));
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-large" aria-label="Review export" onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>Review export</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>Nothing has been downloaded yet. Check what will be in the file, then download it.</p>
          </div>
          <div className="ui-kv-grid exp-summary">
            <div><div className="ui-label">File</div><div className="ui-kv-value">{fileName}</div></div>
            <div><div className="ui-label">Format</div><div className="ui-kv-value">{fmt.label}{format === 'pdf' || format === 'docx' ? ` · ${landscape ? 'landscape' : 'portrait'}` : ''}</div></div>
            <div><div className="ui-label">Contents</div><div className="ui-kv-value">{results.length} set{results.length === 1 ? '' : 's'} · {total} row{total === 1 ? '' : 's'}</div></div>
            <div><div className="ui-label">Filters</div><div className="ui-kv-value" style={{ fontWeight: 400 }}>{describeFilters(filters)}</div></div>
          </div>
          {results.map((r) => (
            <div key={r.set.key} className="exp-preview">
              <div className="exp-preview-head">
                <strong>{r.set.label}</strong>
                <span className="ui-stop-meta" style={{ marginTop: 0 }}>{r.rows.length} row{r.rows.length === 1 ? '' : 's'} · {r.columns.length} column{r.columns.length === 1 ? '' : 's'}{r.rows.length > 5 ? ' · first 5 shown' : ''}</span>
              </div>
              {r.rows.length === 0 ? (
                <div className="ui-stop-meta">No records match the filters; the file will say so.</div>
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table">
                    <thead><tr>{r.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {r.rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{r.columns.map((c) => <td key={c.key}>{row.values[c.key]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={closeNow}>Back</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn ui-btn-primary" onClick={download} disabled={results.length === 0}>Download {fmt.label}</button>
        </footer>
      </div>
    </dialog>
  );
}

// Settings › Export data: choose what (only what this account may open),
// narrow it down, pick a file type, review, then download.
export function ExportPanel() {
  const { loads, drivers, trucks, trailers, facilities, invoices, batches, bills, customers } = useAppShell();
  const sets = useMemo(
    () => buildExportSets({ loads, drivers, trucks, trailers, facilities, invoices, batches, bills, customers }).filter((s) => can(s.perm)),
    [loads, drivers, trucks, trailers, facilities, invoices, batches, bills, customers],
  );
  const [picked, setPicked] = useState<string[]>(() => sets.map((s) => s.key));
  const [cols, setCols] = useState<Record<string, string[]>>(() => Object.fromEntries(sets.map((s) => [s.key, s.columns.filter((c) => c.main).map((c) => c.key)])));
  const [openCols, setOpenCols] = useState<string | null>(null);
  const [f, setF] = useState<ExportFilters>(NO_FILTERS);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [landscape, setLandscape] = useState(true);
  const [name, setName] = useState(`RunTruck export ${todayIso()}`);
  const [reviewing, setReviewing] = useState(false);
  const [done, setDone] = useState('');

  const chosen = sets.filter((s) => picked.includes(s.key));
  const optionsOf = (get: (r: ExportRow) => string[]) => [...new Set(chosen.flatMap((s) => s.rows.flatMap(get)))].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const results: Result[] = chosen.map((s) => ({
    set: s,
    rows: filterRows(s, f),
    columns: s.columns.filter((c) => (cols[s.key] ?? []).includes(c.key)),
  }));
  const total = results.reduce((n, r) => n + r.rows.length, 0);
  const dated = chosen.filter((s) => s.dateLabel);
  const noColumns = results.filter((r) => r.columns.length === 0);
  const today = todayIso();
  const groups = [...new Set(sets.map((s) => s.group))];
  const set = <K extends keyof ExportFilters>(k: K, v: ExportFilters[K]) => setF((p) => ({ ...p, [k]: v }));

  if (sets.length === 0) {
    return (
      <Group title="Nothing to export" about="Your account does not have access to any records yet. Ask a RunTruck super admin for access.">
        <div />
      </Group>
    );
  }

  return (
    <>
      <Group title="What to export" about="Everything your account has access to. Tick the sets you want; each one becomes a table (or a sheet in Excel).">
        <div className="exp-links">
          <button type="button" className="ui-link" onClick={() => setPicked(sets.map((s) => s.key))}>Select all</button>
          <button type="button" className="ui-link" onClick={() => setPicked([])}>Clear</button>
        </div>
        <div className="exp-groups">
          {groups.map((g) => (
            <div key={g} className="exp-group">
              <div className="ui-label">{g}</div>
              {sets.filter((s) => s.group === g).map((s) => {
                const on = picked.includes(s.key);
                const sel = cols[s.key] ?? [];
                return (
                  <div key={s.key} className="exp-set">
                    <label className="ui-check">
                      <input type="checkbox" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, s.key] : picked.filter((k) => k !== s.key))} />
                      {s.label} <span className="muted">· {s.rows.length}</span>
                    </label>
                    {on && (
                      <button type="button" className="ui-link exp-cols-btn" onClick={() => setOpenCols(openCols === s.key ? null : s.key)}>
                        Columns {sel.length} of {s.columns.length}
                      </button>
                    )}
                    {on && openCols === s.key && (
                      <div className="exp-cols">
                        <div className="exp-links">
                          <button type="button" className="ui-link" onClick={() => setCols({ ...cols, [s.key]: s.columns.filter((c) => c.main).map((c) => c.key) })}>Usual</button>
                          <button type="button" className="ui-link" onClick={() => setCols({ ...cols, [s.key]: s.columns.map((c) => c.key) })}>All</button>
                          <button type="button" className="ui-link" onClick={() => setCols({ ...cols, [s.key]: [] })}>None</button>
                        </div>
                        <div className="exp-cols-grid">
                          {s.columns.map((c) => (
                            <label key={c.key} className="ui-check">
                              <input type="checkbox" checked={sel.includes(c.key)} onChange={(e) => setCols({ ...cols, [s.key]: e.target.checked ? [...sel, c.key] : sel.filter((k) => k !== c.key) })} />
                              {c.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Group>

      <Group title="Filters" about="Narrow it down. Each filter only applies to the sets that have that kind of information.">
        <div className="exp-dates">
          <label className="ui-field">
            <span className="ui-field-label">From</span>
            <input className="ui-input" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">To</span>
            <input className="ui-input" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
          </label>
          <div className="exp-links exp-quick">
            <button type="button" className="ui-link" onClick={() => setF((p) => ({ ...p, from: `${today.slice(0, 8)}01`, to: today }))}>This month</button>
            <button type="button" className="ui-link" onClick={() => setF((p) => ({ ...p, from: addDays(today, -29), to: today }))}>Last 30 days</button>
            <button type="button" className="ui-link" onClick={() => setF((p) => ({ ...p, from: `${today.slice(0, 4)}-01-01`, to: today }))}>This year</button>
            <button type="button" className="ui-link" onClick={() => setF((p) => ({ ...p, from: '', to: '' }))}>Any date</button>
          </div>
        </div>
        {(f.from || f.to) && (
          <p className="ui-stop-meta" style={{ margin: 0 }}>
            {dated.length ? `Dates apply to ${dated.map((s) => `${s.label} (${s.dateLabel})`).join(', ')}.` : 'None of the chosen sets have dates.'}
            {chosen.length > dated.length ? ` ${chosen.filter((s) => !s.dateLabel).map((s) => s.label).join(', ')} ${chosen.length - dated.length === 1 ? 'has' : 'have'} no dates and ${chosen.length - dated.length === 1 ? 'comes' : 'come'} in full.` : ''}
          </p>
        )}
        <div className="exp-picks">
          <MultiPick label="Drivers" all="All drivers" options={optionsOf((r) => r.drivers)} value={f.drivers} onChange={(v) => set('drivers', v)} />
          <MultiPick label="Trucks and trailers" all="All units" options={optionsOf((r) => r.trucks)} value={f.trucks} onChange={(v) => set('trucks', v)} />
          <MultiPick label="Customers" all="All customers" options={optionsOf((r) => [r.customer])} value={f.customers} onChange={(v) => set('customers', v)} />
        </div>
        <div className="ui-form-grid">
          <label className="ui-field">
            <span className="ui-field-label">Only rows containing</span>
            <input className="ui-input" value={f.contains} placeholder="e.g. Reno, PO 88, Overdue" onChange={(e) => set('contains', e.target.value)} />
          </label>
          <label className="ui-check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" checked={f.archived} onChange={(e) => set('archived', e.target.checked)} />
            Include archived drivers, trucks, trailers and facilities, and inactive customers
          </label>
        </div>
        <div><button type="button" className="ui-link" onClick={() => setF(NO_FILTERS)}>Clear all filters</button></div>
      </Group>

      <Group title="File" about="Pick the kind of document. Nothing downloads until you review the export.">
        <div className="exp-formats" role="radiogroup" aria-label="File type">
          {FORMATS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={format === x.key} className={`exp-format${format === x.key ? ' is-on' : ''}`} onClick={() => setFormat(x.key)}>
              <strong>{x.label} <span className="muted">{x.ext}</span></strong>
              <span>{x.about}</span>
            </button>
          ))}
        </div>
        <div className="ui-form-grid">
          <label className="ui-field">
            <span className="ui-field-label">File name</span>
            <input className="ui-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {(format === 'pdf' || format === 'docx') && (
            <div className="ui-field">
              <span className="ui-field-label">Page</span>
              <div className="ui-filter" role="radiogroup" aria-label="Page orientation">
                {[true, false].map((l) => (
                  <button key={String(l)} type="button" role="radio" aria-checked={landscape === l} className={`ui-filter-opt${landscape === l ? ' is-active' : ''}`} onClick={() => setLandscape(l)}>
                    {l ? 'Landscape' : 'Portrait'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Group>

      <div className="exp-bar">
        <div>
          <strong>{chosen.length} set{chosen.length === 1 ? '' : 's'} · {total} row{total === 1 ? '' : 's'}</strong>
          <div className="ui-stop-meta" style={{ marginTop: 2 }}>
            {noColumns.length ? `Choose at least one column for ${noColumns.map((r) => r.set.label).join(', ')}.` : done || describeFilters(f)}
          </div>
        </div>
        <button type="button" className="ui-btn ui-btn-primary" disabled={chosen.length === 0 || noColumns.length > 0 || !name.trim()} onClick={() => { setDone(''); setReviewing(true); }}>
          Review export
        </button>
      </div>

      {reviewing && (
        <ReviewDialog
          results={results}
          filters={f}
          format={format}
          name={name.trim()}
          landscape={landscape}
          onDownloaded={(file) => setDone(`Downloaded ${file}.`)}
          onClose={() => setReviewing(false)}
        />
      )}
    </>
  );
}

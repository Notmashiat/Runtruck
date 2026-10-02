import { Fragment, useState } from 'react';
import { fileSize, openDocument } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { RequestDocDialog, UpdateDocDialog } from '../../../components/SafetyDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { byUrgency, driverDocuments, renewBy, renewWindow, type DriverDoc } from '../../../data/compliance';
import type { FleetDriver } from '../../../data/fleet';
import { fmtDate } from '../../../data/invoicing';
import { DOC_FIELDS } from '../../../data/safetyRecords';
import { todayIso } from '../../../lib/clock';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { usePaged } from '../../../lib/paging';

// Release 1.8 (data/releases.ts) brings the per-driver file with updates and
// requests; companies that have not received it keep the flat list.
export function DriverDocumentsTab() {
  return isLive('safety-documents') ? <QualificationFiles /> : <LegacyDriverDocuments />;
}

type FileStatus = 'Cannot drive' | 'Action needed' | 'Expiring' | 'Qualified';
const FILE_STATUSES: FileStatus[] = ['Cannot drive', 'Action needed', 'Expiring', 'Qualified'];
const FILE_TAG: Record<FileStatus, string> = { 'Cannot drive': 'tag-outline', 'Action needed': 'tag-outline', Expiring: 'tag-accent', Qualified: 'tag-green' };
const MUST_HAVE = ['CDL', 'Medical card'];

interface DriverRow {
  driver: FleetDriver;
  docs: DriverDoc[];
  status: FileStatus;
  problems: DriverDoc[];
  next?: DriverDoc;
  files: number;
  requested: number;
}

function QualificationFiles() {
  const { query, drivers, driverFiles, docRequests, saveDocRequest } = useAppShell();
  const [open, setOpen] = useState<string | null>(null);
  const [updating, setUpdating] = useState<{ driver: FleetDriver; document: string } | null>(null);
  const [requesting, setRequesting] = useState<{ driverId?: string; documents?: string[] } | null>(null);
  const today = todayIso();
  const all = driverDocuments(drivers);
  const openRequests = docRequests.filter((r) => r.status === 'Requested');

  const rowsAll: DriverRow[] = drivers.filter((d) => !d.archived).map((driver) => {
    const docs = all.filter((x) => x.driverId === driver.id).sort(byUrgency);
    const problems = docs.filter((x) => x.status === 'Expired' || x.status === 'Missing');
    const status: FileStatus = problems.some((x) => MUST_HAVE.includes(x.document)) ? 'Cannot drive' : problems.length ? 'Action needed' : docs.some((x) => x.status === 'Expiring') ? 'Expiring' : 'Qualified';
    const next = docs.filter((x) => x.date && !x.onFile && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const files = driverFiles.filter((f) => f.driverId === driver.id).reduce((s, f) => s + f.files.length, 0);
    return { driver, docs, status, problems, next, files, requested: openRequests.filter((r) => r.driverId === driver.id).length };
  });
  const expiring = all.filter((x) => x.status === 'Expiring');
  const cannot = rowsAll.filter((r) => r.status === 'Cannot drive');
  const lateRequests = openRequests.filter((r) => r.due < today);

  const kpis = [
    { label: 'Fully qualified', value: `${rowsAll.filter((r) => r.status === 'Qualified' || r.status === 'Expiring').length}/${rowsAll.length}`, note: 'Active drivers with a complete file' },
    { label: 'Cannot drive', value: String(cannot.length), note: cannot.map((r) => `${r.driver.name.split(' ').at(-1)} · ${r.problems.filter((p) => MUST_HAVE.includes(p.document)).map((p) => p.document).join(', ')}`).join(' · ') || 'CDL and medical card current for all' },
    { label: `Expiring (${renewWindow()} d)`, value: String(expiring.length), note: `Renew before ${fmtDate(renewBy(), true)}` },
    { label: 'Open requests', value: String(openRequests.length), note: lateRequests.length ? `${lateRequests.length} past due` : openRequests.length ? 'All on time' : 'None waiting' },
  ];

  const filters: FilterDef<DriverRow>[] = [
    { key: 'status', label: 'File status', type: 'select', get: (r) => r.status, options: FILE_STATUSES },
    { key: 'type', label: 'Driver type', type: 'select', get: (r) => String(r.driver.details.driverType ?? '') },
    { key: 'requested', label: 'Requests', type: 'toggle', get: (r) => r.requested > 0, hint: 'Only drivers with an open request' },
  ];
  const sort = useSort(
    usePageFilters(rowsAll.filter((r) => matchesQuery({ name: r.driver.name, unit: r.driver.unit, docs: r.docs.map((x) => x.document).join(' ') }, query)), filters),
    { name: (r) => r.driver.name, status: (r) => FILE_STATUSES.indexOf(r.status), next: (r) => r.next?.date ?? '9999', problems: (r) => r.problems.length },
  );
  const rows = sort.key ? sort.rows : [...sort.rows].sort((a, b) => FILE_STATUSES.indexOf(a.status) - FILE_STATUSES.indexOf(b.status));
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows);

  const mailto = (driverId: string, docs: string[], message: string) => {
    const email = String(drivers.find((d) => d.id === driverId)?.details.email ?? '');
    return email ? `mailto:${email}?subject=${encodeURIComponent(`Documents needed: ${docs.join(', ')}`)}&body=${encodeURIComponent(message)}` : '';
  };

  return (
    <>
      <Kpis items={kpis} />

      {openRequests.length > 0 && (
        <Card title="Open document requests" flush>
          <table className="ui-table">
            <thead><tr><th>Driver</th><th>Documents</th><th>Due</th><th>How</th><th>Requested</th><th className="num" aria-label="Actions" /></tr></thead>
            <tbody>
              {openRequests.map((r) => {
                const link = mailto(r.driverId, r.documents, r.message);
                return (
                  <tr key={r.id}>
                    <td className="strong">{r.driver}<div className="ui-stop-meta">{r.id}</div></td>
                    <td>{r.documents.join(', ')}</td>
                    <td>{fmtDate(r.due)}{r.due < today && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>Past due</div>}</td>
                    <td>{r.via}</td>
                    <td>{fmtDate(r.created.slice(0, 10))}<div className="ui-stop-meta">{r.by}</div></td>
                    <td className="num">
                      <span className="pay-actions">
                        {link && <a className="ui-link" href={link}>Email</a>}
                        <button type="button" className="ui-link" onClick={() => { const d = drivers.find((x) => x.id === r.driverId); if (d) setUpdating({ driver: d, document: r.documents[0] }); }}>Received…</button>
                        <button type="button" className="ui-link is-danger" onClick={() => { if (window.confirm(`Cancel the request to ${r.driver}?`)) saveDocRequest({ ...r, status: 'Cancelled', doneOn: today }); }}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Driver qualification files" flush action={<span className="ui-stop-meta" style={{ marginTop: 0 }}>49 CFR 391.51 · kept for each driver</span>}>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Driver</SortTh><SortTh sort={sort} k="problems">Needs attention</SortTh><SortTh sort={sort} k="next">Next to renew</SortTh>
              <th>Files</th><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((r) => {
              const isOpen = open === r.driver.id;
              return (
                <Fragment key={r.driver.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpen(isOpen ? null : r.driver.id)} aria-expanded={isOpen}>
                    <td className="strong">{r.driver.name}<div className="ui-stop-meta">{r.driver.id} · {String(r.driver.details.driverType ?? '') || 'Driver'}{r.driver.unit && r.driver.unit !== '—' ? ` · ${r.driver.unit}` : ''}</div></td>
                    <td>{r.problems.length ? r.problems.map((p) => `${p.document} ${p.status.toLowerCase()}`).join(', ') : '—'}{r.requested > 0 && <div className="ui-stop-meta">{r.requested} request{r.requested === 1 ? '' : 's'} open</div>}</td>
                    <td>{r.next ? `${r.next.document} · ${fmtDate(r.next.date)}` : '—'}</td>
                    <td>{r.files || '—'}</td>
                    <td className="num"><Tag label={r.status} tagClass={FILE_TAG[r.status]} /></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Dates come from the driver record (Fleet › Drivers); Update changes them there.</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setRequesting({ driverId: r.driver.id, documents: r.docs.filter((x) => x.status !== 'Valid').map((x) => x.document) })}>Request documents</button>
                          </div>
                          {r.status === 'Cannot drive' && <div className="ui-errors" style={{ marginBottom: 12 }}>{r.driver.name} must not drive until the {r.problems.filter((p) => MUST_HAVE.includes(p.document)).map((p) => p.document).join(' and ')} {r.problems.filter((p) => MUST_HAVE.includes(p.document)).length > 1 ? 'are' : 'is'} current (49 CFR 391.11, 391.41).</div>}
                          <table className="ui-table ui-table-inner">
                            <thead><tr><th>Document</th><th>Date</th><th>Files</th><th>Status</th><th className="num" aria-label="Actions" /></tr></thead>
                            <tbody>
                              {r.docs.map((x) => {
                                const f = DOC_FIELDS[x.document];
                                const file = driverFiles.find((y) => y.id === `${r.driver.id}|${x.document}`);
                                return (
                                  <tr key={x.document}>
                                    <td className="strong">{x.document}<div className="ui-stop-meta">{f?.rule}</div></td>
                                    <td>{x.onFile ? `Taken ${fmtDate(x.date)}` : x.date ? `${f?.kind === 'done' ? 'Due' : 'Expires'} ${fmtDate(x.date)}` : '—'}</td>
                                    <td>
                                      {file?.files.length ? file.files.map((doc) => (
                                        <div key={doc.id}><button type="button" className="crm-doc-open" onClick={() => { void openDocument(doc); }}>{doc.name}</button> <span className="ui-stop-meta" style={{ display: 'inline' }}>{fileSize(doc.size)}</span></div>
                                      )) : <span className="ui-stop-meta" style={{ marginTop: 0 }}>None attached</span>}
                                    </td>
                                    <td><Tag label={x.status} tagClass={x.tagClass} /></td>
                                    <td className="num">
                                      <span className="pay-actions">
                                        <button type="button" className="ui-link" onClick={() => setUpdating({ driver: r.driver, document: x.document })}>Update…</button>
                                        <button type="button" className="ui-link" onClick={() => setRequesting({ driverId: r.driver.id, documents: [x.document] })}>Request</button>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">{rowsAll.length ? 'Nothing matches the search or filters.' : 'No active drivers. Add them in Fleet › Drivers.'}</div>}
      </Card>

      {updating && <UpdateDocDialog driver={updating.driver} document={updating.document} onClose={() => setUpdating(null)} />}
      {requesting && <RequestDocDialog driverId={requesting.driverId} documents={requesting.documents} onClose={() => setRequesting(null)} />}
    </>
  );
}

// — before 1.8: the flat list —

// Every qualification document of every active driver, worked out from the
// dates on their driver record (Fleet › Drivers › Edit), most urgent first.
const STATUS_ORDER = ['Expired', 'Missing', 'Expiring', 'Valid'];

const FILTERS: FilterDef<DriverDoc>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (d) => d.status, options: STATUS_ORDER },
  { key: 'document', label: 'Document', type: 'select', get: (d) => d.document },
  { key: 'driver', label: 'Driver', type: 'select', get: (d) => d.driver },
  { key: 'date', label: 'Expires / due', type: 'dates', get: (d) => (d.onFile ? '' : d.date) },
];

function LegacyDriverDocuments() {
  const { query, drivers } = useAppShell();
  const docs = driverDocuments(drivers).sort(byUrgency);
  const of = (status: string) => docs.filter((d) => d.status === status);
  const list = (status: string) => of(status).map((d) => `${d.driver.split(' ').at(-1)} · ${d.document}`).join(', ') || 'None';

  const kpis = [
    { label: 'Documents', value: String(docs.length), note: `${new Set(docs.map((d) => d.driverId)).size} active drivers on file` },
    { label: `Expiring (${renewWindow()} d)`, value: String(of('Expiring').length), note: `Renew before ${fmtDate(renewBy(), true)}` },
    { label: 'Expired', value: String(of('Expired').length), note: list('Expired') },
    { label: 'Missing', value: String(of('Missing').length), note: list('Missing') },
  ];
  const sort = useSort(usePageFilters(docs.filter((d) => matchesQuery(d, query)), FILTERS), { status: (d) => STATUS_ORDER.indexOf(d.status), date: (d) => (d.onFile ? '' : d.date) });
  const rows = sort.rows;
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows);

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Driver qualification files" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="document">Document</SortTh><SortTh sort={sort} k="date">Expires / due</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((d) => (
              <tr key={`${d.driverId} ${d.document}`}>
                <td className="strong">{d.driver}</td>
                <td>{d.document}</td>
                <td>{d.onFile ? `On file · taken ${fmtDate(d.date)}` : d.date ? fmtDate(d.date) : '—'}</td>
                <td className="num"><Tag label={d.status} tagClass={d.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">{docs.length ? 'Nothing matches the search or filters.' : 'No active drivers.'}</div>}
      </Card>
    </>
  );
}

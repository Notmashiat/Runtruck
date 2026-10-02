import { Fragment, useState, type ReactNode } from 'react';
import { BillDocuments } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { ViolationActionDialog, ViolationDialog, WorkOrderDialog } from '../../../components/SafetyDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import type { FormValues } from '../../../data/fleet';
import { fmtDate, usd } from '../../../data/invoicing';
import { USER } from '../../../data/mock';
import { VIOLATIONS, type Violation } from '../../../data/safety';
import { BASICS, CLEAN, VIOLATION_TAG, countsAgainst, daysBetween, isClean, isRemoved, timeWeight, weightedPoints, type ViolationRecord } from '../../../data/safetyRecords';
import { isoDateAt, todayIso } from '../../../lib/clock';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Release 1.8 (data/releases.ts) brings logged inspections with BASIC points,
// challenges and coaching; companies that have not received it keep the list.
export function ViolationsTab() {
  return isLive('safety-violations') ? <Inspections /> : <LegacyViolations />;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dayOf = (iso: string) => (/T12:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : isoDateAt(new Date(iso)));
const STATUSES = ['Open', 'Contested', 'Closed', 'Clean'];
const statusOf = (v: ViolationRecord) => (isClean(v) ? 'Clean' : v.status);

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

function Inspections() {
  const { query, violations, saveViolation, workOrders } = useAppShell();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<ViolationRecord | null>(null);
  const [action, setAction] = useState<{ kind: 'contest' | 'close' | 'coach'; v: ViolationRecord } | null>(null);
  const [toShop, setToShop] = useState<{ v: ViolationRecord; prefill: FormValues } | null>(null);
  const today = todayIso();

  const window24 = violations.filter((v) => daysBetween(v.date, today) <= 730);
  const last12 = violations.filter((v) => daysBetween(v.date, today) <= 365);
  const oos12 = last12.filter((v) => v.oos && countsAgainst(v));
  const unresolved = violations.filter((v) => !isClean(v) && v.status !== 'Closed');
  const points = window24.reduce((s, v) => s + weightedPoints(v, today), 0);

  const kpis = [
    { label: 'Inspections (12 mo)', value: String(last12.length), note: `${last12.filter((v) => !countsAgainst(v)).length} clean or removed · ${last12.filter(countsAgainst).length} with violations` },
    { label: 'Out-of-service rate', value: last12.length ? `${Math.round((oos12.length / last12.length) * 100)}%` : '—', note: `${oos12.length} of ${last12.length} inspections · last 12 months` },
    { label: 'Open & contested', value: String(unresolved.length), note: unresolved.map((v) => `${v.driver.split(' ').at(-1)} ${v.code || v.basic}`).join(' · ') || 'Nothing waiting' },
    { label: 'Weighted points (24 mo)', value: String(points), note: 'Severity × time weight, all BASICs' },
  ];

  // Per BASIC and per driver, over the 24 months FMCSA counts.
  const byBasic = BASICS.map((b) => {
    const list = window24.filter((v) => v.basic === b && countsAgainst(v));
    return { basic: b, count: list.length, oos: list.filter((v) => v.oos).length, points: list.reduce((s, v) => s + weightedPoints(v, today), 0), last: list.map((v) => v.date).sort().pop() ?? '' };
  });
  const maxPoints = Math.max(1, ...byBasic.map((b) => b.points));
  const byDriver = [...new Set(window24.filter(countsAgainst).map((v) => v.driver))].map((name) => {
    const list = window24.filter((v) => v.driver === name && countsAgainst(v));
    return { name, count: list.length, points: list.reduce((s, v) => s + weightedPoints(v, today), 0), coached: list.filter((v) => v.coached).length };
  }).sort((a, b) => b.points - a.points);

  const filters: FilterDef<ViolationRecord>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (v) => statusOf(v), options: STATUSES },
    { key: 'basic', label: 'BASIC', type: 'select', get: (v) => v.basic, options: [CLEAN, ...BASICS] },
    { key: 'driver', label: 'Driver', type: 'select', get: (v) => v.driver },
    { key: 'truck', label: 'Truck', type: 'select', get: (v) => v.truck },
    { key: 'state', label: 'State', type: 'select', get: (v) => v.state },
    { key: 'oos', label: 'Out of service', type: 'toggle', get: (v) => v.oos, hint: 'Only out-of-service inspections' },
    { key: 'date', label: 'Date', type: 'dates', get: (v) => v.date },
  ];
  const sort = useSort(
    usePageFilters(violations.filter((v) => matchesQuery({ ...v, documents: v.documents.map((d) => d.name).join(' '), log: '' }, query)), filters),
    { points: (v) => weightedPoints(v, today), status: (v) => STATUSES.indexOf(statusOf(v)) },
  );
  const rows = sort.key ? sort.rows : [...sort.rows].sort((a, b) => b.date.localeCompare(a.date));

  const log = (v: ViolationRecord, act: string, note: string, patch: Partial<ViolationRecord> = {}) =>
    saveViolation({ ...v, ...patch, updated: new Date().toISOString(), log: [...v.log, { at: new Date().toISOString(), by: USER.name, action: act, note }] });

  return (
    <>
      <Kpis items={kpis} />

      <div className="safety-split">
        <Card title="BASICs · last 24 months" flush>
          <table className="ui-table">
            <thead><tr><th>BASIC</th><th className="num">Violations</th><th className="num">OOS</th><th>Weighted points</th><th>Last</th></tr></thead>
            <tbody>
              {byBasic.map((b) => (
                <tr key={b.basic} className={b.count ? '' : 'is-off'}>
                  <td className="strong">{b.basic}</td>
                  <td className="num">{b.count}</td>
                  <td className="num">{b.oos}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="ui-bar-track" style={{ width: 90, flex: 'none' }}><div className="ui-bar-fill" style={{ width: `${(b.points / maxPoints) * 100}%` }} /></div>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{b.points}</span>
                    </div>
                  </td>
                  <td>{b.last ? fmtDate(b.last) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ui-stop-meta safety-foot">Approximate. FMCSA’s SMS also divides by your inspections or miles and compares you with similar carriers; check your official percentiles on the FMCSA SMS site.</p>
        </Card>
        <Card title="Drivers by points" flush>
          <table className="ui-table">
            <thead><tr><th>Driver</th><th className="num">Violations</th><th className="num">Points</th><th className="num">Coached</th></tr></thead>
            <tbody>
              {byDriver.map((d) => (
                <tr key={d.name}><td className="strong">{d.name}</td><td className="num">{d.count}</td><td className="num">{d.points}</td><td className="num">{d.coached}/{d.count}</td></tr>
              ))}
            </tbody>
          </table>
          {byDriver.length === 0 && <div className="ui-empty">No violations in 24 months.</div>}
        </Card>
      </div>

      <Card title="Roadside inspections & violations" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="date">Date</SortTh><SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="basic">Result</SortTh>
              <SortTh sort={sort} k="location">Where</SortTh><SortTh sort={sort} k="points" num>Points</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const st = statusOf(v);
              const isOpen = open === v.id;
              const clean = isClean(v);
              const wo = workOrders.find((w) => w.id === v.workOrderId);
              return (
                <Fragment key={v.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpen(isOpen ? null : v.id)} aria-expanded={isOpen}>
                    <td>{fmtDate(v.date)}<div className="ui-stop-meta">{v.id}</div></td>
                    <td className="strong">{v.driver}<div className="ui-stop-meta">{[v.truck, v.trailer].filter(Boolean).join(' / ')}</div></td>
                    <td>{clean ? 'Clean inspection' : v.basic}<div className="ui-stop-meta">{clean ? v.level : `${v.code} · ${v.description}`}</div></td>
                    <td className="muted">{v.location}{v.state ? `, ${v.state}` : ''}</td>
                    <td className="num">{clean ? '—' : weightedPoints(v, today)}{!clean && <div className="ui-stop-meta">{isRemoved(v) ? 'Removed: does not count' : `${v.severity}${v.oos ? ' + 2 OOS' : ''} × ${timeWeight(v.date, today)}`}</div>}</td>
                    <td className="num"><Tag label={st} tagClass={VIOLATION_TAG[st as keyof typeof VIOLATION_TAG]} />{v.oos && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>Out of service</div>}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Logged {fmtDate(dayOf(v.created))}{v.reportNumber ? ` · report ${v.reportNumber}` : ''}</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(v)}>Edit</button>
                            {!clean && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAction({ kind: 'coach', v })}>Coach driver</button>}
                            {!clean && v.basic === 'Vehicle Maintenance' && !v.workOrderId && (
                              <button type="button" className="ui-btn ui-btn-sm" onClick={() => setToShop({ v, prefill: { unit: v.truck || v.trailer, type: 'Repair', description: `${v.description} (${v.code}, ${v.id})`, priority: v.oos ? 'Out of service' : 'Urgent', source: 'Roadside inspection', driver: v.driver, dueDate: today } })}>Create work order</button>
                            )}
                            {v.status === 'Open' && !clean && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAction({ kind: 'contest', v })}>Challenge (DataQs)</button>}
                            {(v.status === 'Open' || v.status === 'Contested') && !clean && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setAction({ kind: 'close', v })}>Close…</button>}
                            {v.status === 'Closed' && !clean && <button type="button" className="ui-btn ui-btn-sm" onClick={() => log(v, 'Reopened', '', { status: 'Open', resolution: '' })}>Reopen</button>}
                          </div>
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Inspection">{v.level}<div className="ui-stop-meta">{v.reportNumber ? `Report ${v.reportNumber}` : 'No report number'}</div></Fact>
                            <Fact k="Where">{[v.location, v.state].filter(Boolean).join(', ')}</Fact>
                            <Fact k="Driver & equipment">{v.driver}<div className="ui-stop-meta">{[v.truck, v.trailer].filter(Boolean).join(' / ')}</div></Fact>
                            {!clean && <Fact k="Violation">{`${v.code} · ${v.description}`}<div className="ui-stop-meta">{v.basic}</div></Fact>}
                            {!clean && <Fact k="Points">{`${weightedPoints(v, today)} weighted`}<div className="ui-stop-meta">Severity {v.severity}{v.oos ? ' + 2 out of service' : ''} × time weight {timeWeight(v.date, today)} · drops off {fmtDate(`${Number(v.date.slice(0, 4)) + 2}${v.date.slice(4)}`)}</div></Fact>}
                            {v.fine > 0 && <Fact k="Fine">{usd(v.fine)}<div className="ui-stop-meta">Paid by: {v.finePaidBy}</div></Fact>}
                            {v.dataQs && <Fact k="DataQs">{v.dataQs}</Fact>}
                            {v.resolution && <Fact k="Outcome">{v.resolution}</Fact>}
                            {v.coached && <Fact k="Driver coached">{fmtDate(v.coached)}</Fact>}
                            {wo && <Fact k="Work order">{`${wo.id} · ${wo.status}`}<div className="ui-stop-meta">{wo.shop}</div></Fact>}
                            {v.notes && <Fact k="Notes">{v.notes}</Fact>}
                          </div>
                          <BillDocuments docs={v.documents} owner={`${v.id} ${v.driver}`} hint="Inspection report, citation, photos, repair receipt" onChange={(documents) => saveViolation({ ...v, documents, updated: new Date().toISOString() })} />
                          <div className="ui-label" style={{ margin: '14px 0 6px' }}>Log</div>
                          <ul className="crm-log">
                            {[...v.log].reverse().map((l, i) => (
                              <li key={i} className={l.action === 'Closed' ? 'is-on' : ''}>
                                <strong>{l.action}</strong><span>{l.note}</span><span className="ui-stop-meta" style={{ marginTop: 0 }}>{when(l.at)} · {l.by}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{violations.length ? 'Nothing matches the search or filters.' : 'No inspections yet. + Log Violation records the first one, clean inspections too.'}</div>}
      </Card>

      {editing && <ViolationDialog record={editing} onClose={() => setEditing(null)} />}
      {action && <ViolationActionDialog record={action.v} kind={action.kind} onClose={() => setAction(null)} />}
      {toShop && <WorkOrderDialog prefill={toShop.prefill} link={{ violationId: toShop.v.id }} onSaved={(id) => log(toShop.v, 'Work order', id, { workOrderId: id })} onClose={() => setToShop(null)} />}
    </>
  );
}

// — before 1.8: the read-only list —

const OPEN = VIOLATIONS.filter((v) => v.status === 'Open');
const CONTESTED = VIOLATIONS.filter((v) => v.status === 'Contested');
const CLOSED = VIOLATIONS.filter((v) => v.status === 'Closed');
const POINTS = VIOLATIONS.reduce((sum, v) => sum + v.severityPoints, 0);

const KPIS = [
  { label: 'Open', value: String(OPEN.length), note: 'Corrective action pending' },
  { label: 'Points (12 mo)', value: String(POINTS), note: `CSA severity · ${VIOLATIONS.length} violations` },
  { label: 'Contested', value: String(CONTESTED.length), note: 'DataQ challenge filed' },
  { label: 'Closed', value: String(CLOSED.length), note: 'Resolved, on file' },
];

const FILTERS: FilterDef<Violation>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (v) => v.status, options: ['Open', 'Contested', 'Closed'] },
  { key: 'driver', label: 'Driver', type: 'select', get: (v) => v.driver },
  { key: 'unit', label: 'Unit', type: 'select', get: (v) => v.unit },
  { key: 'type', label: 'Violation type', type: 'select', get: (v) => v.type },
  { key: 'date', label: 'Date', type: 'dates', get: (v) => isoOf(v.date) },
  { key: 'points', label: 'Severity points', type: 'range', get: (v) => v.severityPoints },
];

function LegacyViolations() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(VIOLATIONS.filter((v) => matchesQuery(v, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Roadside inspections & violations" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="date">Date</SortTh><SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="severityPoints" num>Points</SortTh><SortTh sort={sort} k="location">Location</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={`${v.date} ${v.driver} ${v.type}`}>
                <td>{v.date}</td>
                <td className="strong">{v.driver}</td>
                <td>{v.unit}</td>
                <td>{v.type}</td>
                <td className="num">{v.severityPoints}</td>
                <td className="muted">{v.location}</td>
                <td className="num"><Tag label={v.status} tagClass={v.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

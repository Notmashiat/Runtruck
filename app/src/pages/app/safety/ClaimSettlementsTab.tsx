import { Fragment, useState, type ReactNode } from 'react';
import { BillDocuments } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { ClaimActionDialog, ClaimDialog } from '../../../components/SafetyDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { fmtDate, usd, usd0 } from '../../../data/invoicing';
import { USER } from '../../../data/mock';
import { CLAIMS, money, type Claim } from '../../../data/safety';
import {
  CLAIM_STATUSES, CLAIM_TAG, CLAIM_TYPES, cargoDeadlines, daysBetween, isAccident, isCargo, netCost, paidOf, recordable, type ClaimRecord,
} from '../../../data/safetyRecords';
import { isoDateAt, todayIso } from '../../../lib/clock';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Release 1.8 (data/releases.ts) brings managed claims with the cargo-claim
// clock and the accident register; companies that have not received it keep the list.
export function ClaimSettlementsTab() {
  return isLive('safety-claims') ? <Claims /> : <LegacyClaims />;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dayOf = (iso: string) => (/T12:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : isoDateAt(new Date(iso)));
const isOpenClaim = (c: ClaimRecord) => c.status === 'Open' || c.status === 'Under review';

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

function Claims() {
  const { query, claims, saveClaim } = useAppShell();
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClaimRecord | null>(null);
  const [action, setAction] = useState<{ kind: 'pay' | 'close' | 'recover'; c: ClaimRecord } | null>(null);
  const today = todayIso();
  const year = today.slice(0, 4);

  const openClaims = claims.filter(isOpenClaim);
  const deadlines = openClaims.flatMap((c) => {
    const d = cargoDeadlines(c, today);
    return [
      ...(d.ack && daysBetween(today, d.ack.due) <= 7 ? [{ c, what: 'acknowledge', ...d.ack }] : []),
      ...(d.resolve && daysBetween(today, d.resolve.due) <= 14 ? [{ c, what: 'decide', ...d.resolve }] : []),
    ];
  });
  const payments = claims.flatMap((c) => c.payments.map((p) => ({ c, p }))).filter((x) => x.p.date.startsWith(year));
  const register = claims.filter((c) => recordable(c) && daysBetween(c.incidentDate, today) <= 365 * 3);
  const register12 = register.filter((c) => daysBetween(c.incidentDate, today) <= 365);

  const kpis = [
    { label: 'Open claims', value: String(openClaims.length), note: `${usd0(openClaims.reduce((s, c) => s + c.reserve, 0))} reserved · ${openClaims.filter((c) => c.status === 'Under review').length} under review` },
    { label: 'Cargo claim deadlines', value: String(deadlines.length), note: deadlines.map((x) => `${x.c.id} ${x.what} ${x.late ? 'late' : `by ${fmtDate(x.due)}`}`).join(' · ') || 'Nothing due · 49 CFR 370' },
    { label: `Paid in ${year}`, value: usd0(payments.reduce((s, x) => s + x.p.amount, 0)), note: `${usd0(payments.filter((x) => x.p.by === 'Company').reduce((s, x) => s + x.p.amount, 0))} by the company · ${usd0(payments.filter((x) => x.p.by === 'Insurance').reduce((s, x) => s + x.p.amount, 0))} by insurance` },
    { label: 'DOT recordable accidents', value: String(register12.length), note: `Last 12 months · ${register.length} in the 3-year register` },
  ];

  const filters: FilterDef<ClaimRecord>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (c) => c.status, options: CLAIM_STATUSES },
    { key: 'type', label: 'Type', type: 'select', get: (c) => c.type, options: CLAIM_TYPES },
    { key: 'driver', label: 'Driver', type: 'select', get: (c) => c.driver },
    { key: 'claimant', label: 'Claimant', type: 'select', get: (c) => c.claimant },
    { key: 'recordable', label: 'DOT recordable', type: 'toggle', get: (c) => recordable(c), hint: 'Only accidents for the register' },
    { key: 'date', label: 'Incident date', type: 'dates', get: (c) => c.incidentDate },
    { key: 'reserve', label: 'Reserve', type: 'range', get: (c) => c.reserve, prefix: '$' },
  ];
  const list = showClosed ? claims : claims.filter((c) => isOpenClaim(c) || c.id === open);
  const sort = useSort(
    usePageFilters(list.filter((c) => matchesQuery({ ...c, documents: c.documents.map((d) => d.name).join(' '), log: '', payments: '' }, query)), filters),
    { paid: (c) => paidOf(c), status: (c) => CLAIM_STATUSES.indexOf(c.status) },
  );
  const rows = sort.key ? sort.rows : [...sort.rows].sort((a, b) => b.incidentDate.localeCompare(a.incidentDate));

  const log = (c: ClaimRecord, act: string, note: string, patch: Partial<ClaimRecord> = {}) =>
    saveClaim({ ...c, ...patch, updated: new Date().toISOString(), log: [...c.log, { at: new Date().toISOString(), by: USER.name, action: act, note }] });

  return (
    <>
      <Kpis items={kpis} />

      <Card
        title={showClosed ? 'All claims' : 'Open claims'}
        flush
        action={<button type="button" className="ui-link" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Hide closed' : `Show settled & closed (${claims.length - openClaims.length})`}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Claim</SortTh><SortTh sort={sort} k="incidentDate">Incident</SortTh><SortTh sort={sort} k="claimant">Claimant</SortTh>
              <SortTh sort={sort} k="reserve" num>Claimed · reserve</SortTh><SortTh sort={sort} k="paid" num>Paid</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const isOpen = open === c.id;
              const dl = cargoDeadlines(c, today);
              const live = isOpenClaim(c);
              return (
                <Fragment key={c.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}${live ? '' : ' is-off'}`} onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                    <td className="strong">{c.id}<div className="ui-stop-meta">{c.type}</div></td>
                    <td>{fmtDate(c.incidentDate)}<div className="ui-stop-meta">{[c.driver, [c.truck, c.trailer].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}</div></td>
                    <td>{c.claimant}<div className="ui-stop-meta">{c.load ? `Load ${c.load}` : ''}</div></td>
                    <td className="num">{usd(c.amountClaimed)}<div className="ui-stop-meta">{usd(c.reserve)} reserve</div></td>
                    <td className="num">{c.payments.length ? usd(paidOf(c)) : '—'}{c.recovered > 0 && <div className="ui-stop-meta">{usd(c.recovered)} back</div>}</td>
                    <td className="num">
                      <Tag label={c.status} tagClass={CLAIM_TAG[c.status]} />
                      {dl.ack && <div className="ui-stop-meta" style={dl.ack.late ? { color: 'var(--ui-red)' } : undefined}>Acknowledge {dl.ack.late ? 'late' : `by ${fmtDate(dl.ack.due)}`}</div>}
                      {!dl.ack && dl.resolve && <div className="ui-stop-meta" style={dl.resolve.late ? { color: 'var(--ui-red)' } : undefined}>Decide {dl.resolve.late ? 'late' : `by ${fmtDate(dl.resolve.due)}`}</div>}
                      {recordable(c) && <div className="ui-stop-meta">DOT recordable</div>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Opened {fmtDate(dayOf(c.created))}{c.received ? ` · received ${fmtDate(c.received)}` : ''}{c.acknowledgedOn ? ` · acknowledged ${fmtDate(c.acknowledgedOn)}` : ''}</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(c)}>Edit</button>
                            {live && isCargo(c.type) && !c.acknowledgedOn && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm(`Record that ${c.claimant} was sent a written acknowledgment today?`)) log(c, 'Acknowledged', 'Written acknowledgment sent', { acknowledgedOn: today }); }}>Acknowledge</button>}
                            {c.status === 'Open' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => log(c, 'Under review', '', { status: 'Under review' })}>Under review</button>}
                            {live && <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => setAction({ kind: 'close', c })}>Deny / withdraw…</button>}
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAction({ kind: 'recover', c })}>Recovery…</button>
                            {live && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setAction({ kind: 'pay', c })}>Record payment…</button>}
                            {!live && <button type="button" className="ui-btn ui-btn-sm" onClick={() => log(c, 'Reopened', '', { status: 'Open', closedOn: '', closedReason: '' })}>Reopen</button>}
                          </div>
                          {(dl.ack?.late || dl.resolve?.late) && <div className="ui-errors" style={{ marginBottom: 12 }}>{dl.ack?.late ? `Acknowledgment was due ${fmtDate(dl.ack.due)}` : `A decision (pay, decline or a firm offer) was due ${fmtDate(dl.resolve!.due)}`} · 49 CFR 370.5 / 370.9.</div>}
                          {!live && <div className="ui-note" style={{ marginBottom: 12 }}>{c.status} {c.closedOn ? fmtDate(c.closedOn) : ''} · {c.closedReason}</div>}
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="What happened">{c.description}<div className="ui-stop-meta">{fmtDate(c.incidentDate)}{c.location ? ` · ${c.location}` : ''}</div></Fact>
                            <Fact k="Driver & equipment">{c.driver}<div className="ui-stop-meta">{[c.truck, c.trailer].filter(Boolean).join(' / ')}{c.load ? ` · load ${c.load}` : ''}</div></Fact>
                            <Fact k="Claimant">{c.claimant}<div className="ui-stop-meta">{[c.claimantContact, c.claimantEmail].filter(Boolean).join(' · ')}</div></Fact>
                            <Fact k="Amounts">{`${usd(c.amountClaimed)} claimed · ${usd(c.reserve)} reserve`}<div className="ui-stop-meta">{c.deductible ? `${usd(c.deductible)} deductible` : ''}</div></Fact>
                            <Fact k="Paid">{c.payments.length ? c.payments.map((p) => `${fmtDate(p.date)} ${usd(p.amount)} by ${p.by}${p.reference ? ` (${p.reference})` : ''}`).join(' · ') : ''}<div className="ui-stop-meta">{`Cost to the company ${usd(netCost(c))}`}{c.recovered ? ` after ${usd(c.recovered)} recovered` : ''}</div></Fact>
                            <Fact k="Insurance">{[c.insurer, c.policyNumber].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{c.insurerClaimNo ? `Claim ${c.insurerClaimNo}` : 'Not reported to the insurer'}</div></Fact>
                            {isAccident(c.type) && <Fact k="Accident register">{recordable(c) ? 'DOT recordable (49 CFR 390.15)' : 'Not recordable'}<div className="ui-stop-meta">{[c.fatality && 'fatality', c.injuryTreated && 'injury treated away from scene', c.towAway && 'tow-away', c.hazmatRelease && 'hazmat released'].filter(Boolean).join(', ')}</div></Fact>}
                            {isAccident(c.type) && (c.policeReport || c.citation) && <Fact k="Police">{c.policeReport}<div className="ui-stop-meta">{c.citation}</div></Fact>}
                            <Fact k="Preventable">{c.preventable}</Fact>
                            {c.notes && <Fact k="Notes">{c.notes}</Fact>}
                          </div>
                          <BillDocuments docs={c.documents} owner={`${c.id} ${c.claimant}`} hint="Photos, BOL / POD, police report, estimates, invoice, letters" onChange={(documents) => saveClaim({ ...c, documents, updated: new Date().toISOString() })} />
                          <div className="ui-label" style={{ margin: '14px 0 6px' }}>Log</div>
                          <ul className="crm-log">
                            {[...c.log].reverse().map((l, i) => (
                              <li key={i} className={l.action === 'Denied' || l.action === 'Withdrawn' ? 'is-off' : l.action === 'Settled' ? 'is-on' : ''}>
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
        {rows.length === 0 && <div className="ui-empty">{claims.length ? 'Nothing matches the search or filters.' : 'No claims. + New Claim opens one.'}</div>}
      </Card>

      {register.length > 0 && (
        <Card title="Accident register · last 3 years" flush action={<span className="ui-stop-meta" style={{ marginTop: 0 }}>49 CFR 390.15 · keep for 3 years</span>}>
          <table className="ui-table">
            <thead><tr><th>Date</th><th>Where</th><th>Driver</th><th className="num">Fatalities</th><th className="num">Injuries</th><th>Tow-away</th><th>Hazmat</th><th>Claim</th></tr></thead>
            <tbody>
              {[...register].sort((a, b) => b.incidentDate.localeCompare(a.incidentDate)).map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.incidentDate)}</td><td>{c.location || '—'}</td><td>{c.driver}</td>
                  <td className="num">{c.fatality ? 'Yes' : '—'}</td><td className="num">{c.injuryTreated ? 'Yes' : '—'}</td><td>{c.towAway ? 'Yes' : '—'}</td><td>{c.hazmatRelease ? 'Yes' : '—'}</td>
                  <td><button type="button" className="ui-link" onClick={() => { setShowClosed(true); setOpen(c.id); }}>{c.id}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && <ClaimDialog record={editing} onClose={() => setEditing(null)} />}
      {action && <ClaimActionDialog record={action.c} kind={action.kind} onClose={() => setAction(null)} />}
    </>
  );
}

// — before 1.8: the read-only list —

// "Open" here covers anything not yet resolved, i.e. Open and Under review.
const OPEN = CLAIMS.filter((c) => c.status === 'Open' || c.status === 'Under review');
const SETTLED = CLAIMS.filter((c) => c.status === 'Settled');
const DENIED = CLAIMS.filter((c) => c.status === 'Denied');
const PAID = CLAIMS.filter((c) => c.paid > 0);

const KPIS = [
  { label: 'Open claims', value: String(OPEN.length), note: `${CLAIMS.filter((c) => c.status === 'Under review').length} under review` },
  { label: 'Reserved', value: money(OPEN.reduce((sum, c) => sum + c.reserved, 0)), note: 'On open claims' },
  { label: 'Paid YTD', value: money(PAID.reduce((sum, c) => sum + c.paid, 0)), note: `${PAID.length} settlements` },
  { label: 'Settled', value: String(SETTLED.length), note: `${DENIED.length} denied` },
];

const FILTERS: FilterDef<Claim>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (c) => c.status, options: ['Open', 'Under review', 'Settled', 'Denied'] },
  { key: 'type', label: 'Claim type', type: 'select', get: (c) => c.type },
  { key: 'driver', label: 'Driver', type: 'select', get: (c) => c.driver },
  { key: 'claimant', label: 'Claimant', type: 'select', get: (c) => c.claimant },
  { key: 'date', label: 'Date', type: 'dates', get: (c) => isoOf(c.date) },
  { key: 'reserved', label: 'Reserved', type: 'range', get: (c) => c.reserved, prefix: '$' },
];

function LegacyClaims() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(CLAIMS.filter((c) => matchesQuery(c, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Claims" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Claim</SortTh><SortTh sort={sort} k="date">Date</SortTh><SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="claimant">Claimant</SortTh>
              <SortTh sort={sort} k="reserved" num>Reserved</SortTh><SortTh sort={sort} k="paid" num>Paid</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="strong">{c.id}</td>
                <td>{c.date}</td>
                <td>{c.driver}</td>
                <td>{c.unit}</td>
                <td>{c.type}</td>
                <td>{c.claimant}</td>
                <td className="num">{money(c.reserved)}</td>
                <td className="num">{c.paid > 0 ? money(c.paid) : '—'}</td>
                <td className="num"><Tag label={c.status} tagClass={c.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

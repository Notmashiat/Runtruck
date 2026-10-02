import { Fragment, useState, type ReactNode } from 'react';
import { BillDocuments } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { CloseOnboardingDialog, ContractDialog, OnboardingDialog } from '../../../components/HrDialogs';
import { Kpis } from '../../../components/Kpis';
import { EmployeeDialog } from '../../../components/PayrollDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { driverFromForm, nextId, type FormValues } from '../../../data/fleet';
import { ONBOARDING, type Onboarding } from '../../../data/hr';
import {
  STAGES, agreementFor, credentialWarnings, daysBetween, defaultClauses, isDriverRole, nextStepOf, parseOffer, progressOf, stageOf, stageTag, stepId,
  type OnboardingRecord, type Stage, type Step,
} from '../../../data/hrRecords';
import { TODAY, addDays, fmtDate } from '../../../data/invoicing';
import { mondayOf } from '../../../data/metrics';
import { EMPLOYEE_ROLES } from '../../../data/payroll';
import { USER } from '../../../data/mock';
import { isoDateAt, shortDate, todayIso } from '../../../lib/clock';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { usePaged } from '../../../lib/paging';

// Release 1.7 (data/releases.ts) brings managed onboarding; companies that
// have not received it keep the read-only list.
export function OnboardingTab() {
  return isLive('hr-onboarding') ? <OnboardingBoard /> : <LegacyOnboarding />;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dayOf = (iso: string) => (/T12:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : isoDateAt(new Date(iso)));
const STAGE_ORDER = [...STAGES, 'Ready to hire', 'Hired', 'Not hired', 'Withdrawn'];

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

function Progress({ o }: { o: OnboardingRecord }) {
  const p = progressOf(o);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="ui-bar-track" style={{ width: 100, flex: 'none' }}>
        <div className="ui-bar-fill" style={{ width: `${p.pct}%` }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--ui-muted)', fontVariantNumeric: 'tabular-nums' }}>{p.done}/{p.total}</span>
    </div>
  );
}

function OnboardingBoard() {
  const { query, onboardings, saveOnboarding, drivers, saveDriver, contracts } = useAppShell();
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<OnboardingRecord | null>(null);
  const [closing, setClosing] = useState<OnboardingRecord | null>(null);
  const [toPayroll, setToPayroll] = useState<OnboardingRecord | null>(null);
  const [toContract, setToContract] = useState<OnboardingRecord | null>(null);
  const [adding, setAdding] = useState<{ id: string; stage: Stage; label: string } | null>(null);
  const today = todayIso();

  // A hire stays on the list until they are on payroll, in the fleet (drivers) and have a contract.
  const contractOf = (o: OnboardingRecord) => contracts.find((c) => c.id === o.contractId) ?? contracts.find((c) => c.onboardingId === o.id);
  const fleetOf = (o: OnboardingRecord) => (o.driverId ? drivers.find((d) => d.id === o.driverId) : undefined) ?? drivers.find((d) => d.name.toLowerCase() === o.name.toLowerCase());
  const setupLeft = (o: OnboardingRecord) => o.status !== 'Hired' ? [] : [
    ...(o.employeeId ? [] : ['payroll']), ...(isDriverRole(o.role) && !fleetOf(o) ? ['fleet'] : []), ...(contractOf(o) ? [] : ['contract']),
  ];
  const active = onboardings.filter((o) => o.status === 'In progress');
  const settingUp = onboardings.filter((o) => setupLeft(o).length > 0);
  const closed = onboardings.filter((o) => o.status !== 'In progress' && !settingUp.includes(o));
  const ready = active.filter((o) => stageOf(o) === 'Ready to hire');
  const startingSoon = active.filter((o) => o.targetStart && daysBetween(today, o.targetStart) <= 14);
  const quarterStart = `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  const hiredQuarter = onboardings.filter((o) => o.status === 'Hired' && o.closedOn >= quarterStart);
  const last = (n: string) => n.split(' ').at(-1);
  const warnings = active.flatMap((o) => credentialWarnings(o, today).map((w) => ({ o, w })));

  const kpis = [
    { label: 'In progress', value: String(active.length), note: `${active.filter((o) => isDriverRole(o.role)).length} drivers · ${active.filter((o) => !isDriverRole(o.role)).length} staff` },
    { label: 'Ready to hire', value: String(ready.length), note: ready.map((o) => last(o.name)).join(' · ') || 'Every required step done' },
    { label: 'Starting in 14 days', value: String(startingSoon.length), note: startingSoon.map((o) => `${last(o.name)} ${fmtDate(o.targetStart)}`).join(' · ') || 'None' },
    { label: 'Hired this quarter', value: String(hiredQuarter.length), note: `Since ${fmtDate(quarterStart)}` },
  ];

  const filters: FilterDef<OnboardingRecord>[] = [
    { key: 'stage', label: 'Stage', type: 'select', get: (o) => stageOf(o), options: STAGE_ORDER },
    { key: 'role', label: 'Role', type: 'select', get: (o) => o.role, options: EMPLOYEE_ROLES },
    { key: 'manager', label: 'Hiring manager', type: 'select', get: (o) => o.manager },
    { key: 'source', label: 'Source', type: 'select', get: (o) => o.source },
    { key: 'applied', label: 'Applied', type: 'dates', get: (o) => o.applied },
    { key: 'start', label: 'Target start', type: 'dates', get: (o) => o.targetStart },
    { key: 'progress', label: 'Progress', type: 'range', get: (o) => progressOf(o).pct, suffix: '%' },
  ];
  const sort = useSort(
    // The open row stays put when it is hired or closed, so its next steps stay in view.
    usePageFilters((showClosed ? onboardings : onboardings.filter((o) => active.includes(o) || settingUp.includes(o) || o.id === open)).filter((o) => matchesQuery({ ...o, steps: '', log: '', documents: o.documents.map((d) => d.name).join(' ') }, query)), filters),
    { stage: (o) => STAGE_ORDER.indexOf(stageOf(o)), progress: (o) => progressOf(o).pct, next: (o) => nextStepOf(o)?.label ?? '' },
  );
  const rows = sort.rows;
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows, { key: open, of: (r) => r.id });

  const save = (o: OnboardingRecord, patch: Partial<OnboardingRecord>, action?: string, note = '') =>
    saveOnboarding({ ...o, ...patch, updated: new Date().toISOString(), log: action ? [...o.log, { at: new Date().toISOString(), by: USER.name, action, note }] : o.log });
  const setStep = (o: OnboardingRecord, id: string, patch: Partial<Step>) => save(o, { steps: o.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const tick = (o: OnboardingRecord, s: Step) => setStep(o, s.id, s.done ? { done: false, doneOn: '', by: '' } : { done: true, doneOn: today, by: USER.name });

  const hireNow = (o: OnboardingRecord) => {
    const pending = o.steps.filter((s) => s.required && !s.done);
    const warn = isDriverRole(o.role) ? ' A driver must not be dispatched until the qualification file is complete.' : '';
    if (pending.length && !window.confirm(`${pending.length} required step${pending.length === 1 ? ' is' : 's are'} still open:\n\n${pending.map((s) => `• ${s.label}`).join('\n')}\n\nMark ${o.name} hired anyway?${warn}`)) return;
    if (!pending.length && !window.confirm(`Mark ${o.name} hired, starting ${fmtDate(o.targetStart)}?`)) return;
    save(o, { status: 'Hired', closedOn: today }, 'Hired', `Starts ${fmtDate(o.targetStart)}${pending.length ? ` · ${pending.length} required steps open` : ''}`);
  };

  // The driver's fleet record, with the qualification dates from the checklist.
  const addToFleet = (o: OnboardingRecord) => {
    const existing = fleetOf(o);
    if (existing) {
      save(o, { driverId: existing.id }, 'Linked to fleet', existing.id);
      return;
    }
    const doneOn = (part: string) => o.steps.find((s) => s.done && s.label.includes(part))?.doneOn ?? '';
    const [firstName, ...rest] = o.name.split(' ');
    const offer = parseOffer(o.payOffer);
    const v: FormValues = {
      firstName, lastName: rest.join(' '), phone: o.phone, email: o.email, city: o.city, state: o.state,
      employeeId: o.employeeId, driverType: o.role === 'Owner-operator' ? 'Owner-operator (1099)' : o.role === 'Lease-purchase driver' ? 'Lease-purchase' : 'Company driver (W-2)',
      status: 'Available', hireDate: o.targetStart || today, terminal: o.terminal, dispatcher: o.manager,
      cdlState: o.cdlState, cdlClass: o.cdlClass, cdlExpiry: o.cdlExpiry, endorsements: o.endorsements, medicalExpiry: o.medicalExpiry,
      mvrDate: doneOn('MVR'), drugTestDate: doneOn('drug test'), clearinghouseDate: doneOn('Clearinghouse'), roadTestDate: doneOn('Road test'),
      payType: offer?.payBasis ?? '', payRate: offer ? String(offer.rate) : '', notes: `From onboarding ${o.id}.`,
    };
    const id = nextId('DRV', drivers.map((d) => d.id));
    if (!window.confirm(`Add ${o.name} to Fleet › Drivers as ${id}, with their CDL, medical certificate and qualification dates?`)) return;
    saveDriver(driverFromForm(v, id));
    save(o, { driverId: id }, 'Added to fleet', id);
  };

  const payrollPrefill = (o: OnboardingRecord): FormValues => {
    const offer = parseOffer(o.payOffer);
    return {
      name: o.name, email: o.email, phone: o.phone, city: o.city, state: o.state, role: o.role, workerType: o.workerType, hired: o.targetStart || today,
      ...(offer ? { payBasis: offer.payBasis, rate: String(offer.rate) } : {}),
      ...(isDriverRole(o.role) ? { frequency: 'Weekly' } : { frequency: 'Every 2 weeks', payBasis: offer?.payBasis ?? 'Salary' }),
      notes: `From onboarding ${o.id}.`,
    };
  };
  const contractPrefill = (o: OnboardingRecord): FormValues => {
    const offer = parseOffer(o.payOffer);
    const agreement = agreementFor(o.role, o.workerType);
    return {
      person: o.name, email: o.email, role: o.role, workerType: o.workerType, agreement, employeeId: o.employeeId, start: o.targetStart || today,
      employee: o.employeeId ? `${o.name} · ${o.employeeId}` : '',
      clauses: defaultClauses(agreement, o.role), ...(offer ? { payBasis: offer.payBasis, rate: String(offer.rate) } : {}),
    };
  };

  return (
    <>
      <Kpis items={kpis} />

      {warnings.length > 0 && (
        <div className="ui-errors hr-warnings">
          {warnings.map(({ o, w }) => <div key={`${o.id}${w}`}><strong>{o.name}</strong>: {w}. Get a new copy before they drive.</div>)}
        </div>
      )}

      <Card
        title={showClosed ? 'All onboarding' : 'Onboarding'}
        flush
        action={closed.length > 0 && <button type="button" className="ui-link" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Hide hired & closed' : `Show hired & closed (${closed.length})`}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Candidate</SortTh><SortTh sort={sort} k="role">Role</SortTh><SortTh sort={sort} k="stage">Stage</SortTh>
              <SortTh sort={sort} k="targetStart">Start</SortTh><SortTh sort={sort} k="manager">Manager</SortTh><SortTh sort={sort} k="progress">Progress</SortTh><SortTh sort={sort} k="next">Next step</SortTh>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((o) => {
              const stage = stageOf(o);
              const next = nextStepOf(o);
              const isOpen = open === o.id;
              const inProgress = o.status === 'In progress';
              const warn = credentialWarnings(o, today);
              const contract = contractOf(o);
              const inFleet = fleetOf(o);
              const left = setupLeft(o);
              return (
                <Fragment key={o.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}${o.status === 'Not hired' || o.status === 'Withdrawn' ? ' is-off' : ''}`} onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen}>
                    <td className="strong">{o.name}<div className="ui-stop-meta">{o.id} · applied {fmtDate(o.applied)}</div></td>
                    <td>{o.role}<div className="ui-stop-meta">{o.workerType.startsWith('W-2') ? 'W-2' : '1099'}{o.source ? ` · ${o.source}` : ''}</div></td>
                    <td><Tag label={stage} tagClass={stageTag(stage)} />{warn.length > 0 && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>{warn[0]}</div>}</td>
                    <td>{o.targetStart ? fmtDate(o.targetStart) : '—'}{inProgress && o.targetStart && <div className="ui-stop-meta">{o.targetStart < today ? 'Past' : `in ${daysBetween(today, o.targetStart)} d`}</div>}</td>
                    <td>{o.manager}</td>
                    <td><Progress o={o} /></td>
                    <td className="muted">{inProgress ? next?.label ?? 'Mark hired' : left.length ? `Set up: ${left.join(', ')}` : o.status === 'Hired' ? `Started ${fmtDate(o.targetStart)}` : o.closedReason}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Started {fmtDate(dayOf(o.created))} · {o.manager}{o.closedOn ? ` · ${o.status.toLowerCase()} ${fmtDate(o.closedOn)}` : ''}</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(o)}>Edit</button>
                            {inProgress && <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => setClosing(o)}>Not hired / withdrawn…</button>}
                            {inProgress && <button type="button" className={`ui-btn ui-btn-sm${stage === 'Ready to hire' ? ' ui-btn-primary' : ''}`} onClick={() => hireNow(o)}>Mark hired</button>}
                            {!inProgress && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm(`Reopen ${o.name}'s onboarding?`)) save(o, { status: 'In progress', closedOn: '', closedReason: '' }, 'Reopened'); }}>Reopen</button>}
                          </div>

                          {o.status === 'Hired' && (
                            <div className="hr-handoff">
                              <span className="ui-label">Set them up</span>
                              {o.employeeId ? <span>✓ On payroll · {o.employeeId}</span> : <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setToPayroll(o)}>Add to payroll</button>}
                              {isDriverRole(o.role) && (inFleet ? <span>✓ In Fleet › Drivers · {inFleet.id}</span> : <button type="button" className="ui-btn ui-btn-sm" onClick={() => addToFleet(o)}>Add to Fleet › Drivers</button>)}
                              {contract ? <span>✓ Contract {contract.id} · {contract.status.toLowerCase()}</span> : <button type="button" className="ui-btn ui-btn-sm" onClick={() => setToContract(o)}>Create contract</button>}
                            </div>
                          )}
                          {(o.status === 'Not hired' || o.status === 'Withdrawn') && <div className="ui-note" style={{ marginBottom: 12 }}>{o.status} {fmtDate(o.closedOn)} · {o.closedReason}</div>}

                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Contact">{[o.email, o.phone].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{[o.city, o.state].filter(Boolean).join(', ')}</div></Fact>
                            <Fact k="Position">{`${o.role} · ${o.workerType}`}<div className="ui-stop-meta">{o.terminal}</div></Fact>
                            <Fact k="Offer · start">{[o.payOffer, o.targetStart ? `starts ${fmtDate(o.targetStart)}` : ''].filter(Boolean).join(' · ')}</Fact>
                            {isDriverRole(o.role) && <Fact k="CDL">{[o.cdlClass && `Class ${o.cdlClass}`, o.cdlState, o.cdlExpiry && `expires ${fmtDate(o.cdlExpiry)}`].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{o.endorsements.map((e) => e.split(' ')[0]).join(', ') || 'No endorsements'}</div></Fact>}
                            {isDriverRole(o.role) && <Fact k="Medical certificate">{o.medicalExpiry ? `Expires ${fmtDate(o.medicalExpiry)}` : 'Not on file yet'}</Fact>}
                            {isDriverRole(o.role) && <Fact k="Experience">{o.experienceYears ? `${o.experienceYears} year${o.experienceYears === 1 ? '' : 's'}` : ''}<div className="ui-stop-meta">{o.experience.join(', ')}</div></Fact>}
                            {o.notes && <Fact k="Notes">{o.notes}</Fact>}
                          </div>
                          {warn.length > 0 && <div className="ui-errors" style={{ marginTop: 12 }}>{warn.join(' · ')}</div>}

                          <div className="onb-checklist">
                            {STAGES.filter((st) => o.steps.some((s) => s.stage === st)).map((st) => {
                              const steps = o.steps.filter((s) => s.stage === st);
                              const req = steps.filter((s) => s.required);
                              return (
                                <div key={st} className="onb-stage">
                                  <div className="onb-stage-head">
                                    <span className="ui-label">{st}</span>
                                    <span className="ui-stop-meta" style={{ marginTop: 0 }}>{req.filter((s) => s.done).length}/{req.length} required</span>
                                  </div>
                                  {steps.map((s) => (
                                    <div key={s.id} className={`onb-step${s.done ? ' is-done' : ''}`}>
                                      <label className="ui-check">
                                        <input type="checkbox" checked={s.done} disabled={!inProgress} onChange={() => tick(o, s)} />
                                        <span>{s.label}{!s.required && <span className="ui-stop-meta" style={{ display: 'inline', marginLeft: 6 }}>optional</span>}</span>
                                      </label>
                                      <span className="ui-stop-meta onb-step-meta">
                                        {[s.rule, s.done ? `done ${fmtDate(s.doneOn)} · ${s.by}` : '', s.note].filter(Boolean).join(' · ')}
                                      </span>
                                      {inProgress && (
                                        <span className="pay-actions">
                                          <button type="button" className="ui-link" onClick={() => { const n = window.prompt(`Note on "${s.label}"`, s.note); if (n !== null) setStep(o, s.id, { note: n.trim() }); }}>{s.note ? 'Edit note' : 'Note'}</button>
                                          {!s.required && <button type="button" className="ui-link is-danger" onClick={() => { if (window.confirm(`Remove "${s.label}"?`)) save(o, { steps: o.steps.filter((x) => x.id !== s.id) }); }}>Remove</button>}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                            {inProgress && (
                              adding?.id === o.id ? (
                                <div className="onb-add">
                                  <select className="ui-input" value={adding.stage} aria-label="Stage" onChange={(e) => setAdding({ ...adding, stage: e.target.value as Stage })}>{STAGES.map((st) => <option key={st}>{st}</option>)}</select>
                                  <input className="ui-input" autoFocus placeholder="e.g. Hazmat endorsement training" value={adding.label} aria-label="Step" onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
                                  <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" disabled={!adding.label.trim()} onClick={() => {
                                    save(o, { steps: [...o.steps, { id: stepId(), stage: adding.stage, label: adding.label.trim(), rule: '', required: true, done: false, doneOn: '', by: '', note: '' }] });
                                    setAdding(null);
                                  }}>Add step</button>
                                  <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAdding(null)}>Cancel</button>
                                </div>
                              ) : (
                                <button type="button" className="ui-link" onClick={() => setAdding({ id: o.id, stage: 'Paperwork', label: '' })}>+ Add a step</button>
                              )
                            )}
                          </div>

                          <BillDocuments docs={o.documents} owner={o.name} hint="Application, CDL, MVR, medical certificate, drug test, I-9, W-4" onChange={(documents) => save(o, { documents })} />
                          <div className="ui-label" style={{ margin: '14px 0 6px' }}>Log</div>
                          <ul className="crm-log">
                            {[...o.log].reverse().map((l, i) => (
                              <li key={i} className={l.action === 'Not hired' || l.action === 'Withdrawn' ? 'is-off' : l.action === 'Hired' ? 'is-on' : ''}>
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
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">{onboardings.length ? 'Nothing matches the search or filters.' : 'No one onboarding. + Start Onboarding adds the first new hire.'}</div>}
      </Card>

      {editing && <OnboardingDialog onboarding={editing} onClose={() => setEditing(null)} />}
      {closing && <CloseOnboardingDialog onboarding={closing} onClose={() => setClosing(null)} />}
      {toPayroll && <EmployeeDialog prefill={payrollPrefill(toPayroll)} onSaved={(id) => save(toPayroll, { employeeId: id }, 'Added to payroll', id)} onClose={() => setToPayroll(null)} />}
      {toContract && <ContractDialog prefill={contractPrefill(toContract)} onboardingId={toContract.id} onSaved={(id) => save(toContract, { contractId: id }, 'Contract drafted', id)} onClose={() => setToContract(null)} />}
    </>
  );
}

// — before 1.7: the read-only list —

// Monday to Sunday of this week, as the started dates are written.
const MONDAY = mondayOf(TODAY);
const THIS_WEEK = Array.from({ length: 7 }, (_, i) => shortDate(addDays(MONDAY, i)));

const inProgress = ONBOARDING.filter((o) => o.stage !== 'Complete');
const startingThisWeek = ONBOARDING.filter((o) => THIS_WEEK.includes(o.started));
const awaitingDocs = ONBOARDING.filter((o) => o.docsPending);
const completed = ONBOARDING.filter((o) => o.stage === 'Complete');
const inOrientation = ONBOARDING.filter((o) => o.stage === 'Orientation');

const KPIS = [
  { label: 'In progress', value: String(inProgress.length), note: `${inOrientation.length} in orientation` },
  { label: 'Started this week', value: String(startingThisWeek.length), note: startingThisWeek.map((o) => `${o.candidate.split(' ').at(-1)} ${o.started}`).join(' · ') || 'None since Mon' },
  { label: 'Awaiting documents', value: String(awaitingDocs.length), note: awaitingDocs.map((o) => o.candidate.split(' ').at(-1)).join(' · ') || 'None' },
  { label: 'Completed this quarter', value: String(completed.length), note: `Since ${shortDate(`${TODAY.slice(0, 4)}-${String(Math.floor((Number(TODAY.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`)}` },
];

const LEGACY_STAGES = ['Application', 'Background check', 'Road test', 'Orientation', 'Complete'];

const FILTERS: FilterDef<Onboarding>[] = [
  { key: 'stage', label: 'Stage', type: 'select', get: (o) => o.stage, options: LEGACY_STAGES },
  { key: 'role', label: 'Role', type: 'select', get: (o) => o.role },
  { key: 'owner', label: 'Owner', type: 'select', get: (o) => o.owner },
  { key: 'docs', label: 'Documents', type: 'toggle', get: (o) => o.docsPending, hint: 'Only candidates waiting on documents' },
  { key: 'started', label: 'Started', type: 'dates', get: (o) => isoOf(o.started) },
  { key: 'progress', label: 'Progress', type: 'range', get: (o) => o.progress, suffix: '%' },
];

function LegacyOnboarding() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(ONBOARDING.filter((o) => matchesQuery(o, query)), FILTERS), { stage: (o) => LEGACY_STAGES.indexOf(o.stage) });
  const rows = sort.rows;
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows);

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Onboarding" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="candidate">Candidate</SortTh><SortTh sort={sort} k="role">Role</SortTh><SortTh sort={sort} k="stage">Stage</SortTh><SortTh sort={sort} k="started">Started</SortTh><SortTh sort={sort} k="owner">Owner</SortTh><SortTh sort={sort} k="progress">Progress</SortTh><SortTh sort={sort} k="nextStep">Next step</SortTh>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((o) => (
              <tr key={o.candidate}>
                <td className="strong">{o.candidate}</td>
                <td>{o.role}</td>
                <td><Tag label={o.stage} tagClass={o.tagClass} /></td>
                <td>{o.started}</td>
                <td>{o.owner}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="ui-bar-track" style={{ width: 120, flex: 'none' }}>
                      <div className="ui-bar-fill" style={{ width: `${o.progress}%` }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--ui-muted)', fontVariantNumeric: 'tabular-nums' }}>{o.progress}%</span>
                  </div>
                </td>
                <td className="muted">{o.nextStep}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

import { Fragment, useState, type ReactNode } from 'react';
import { BillDocuments } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { ContractDialog, EndContractDialog, RenewDialog, SignaturesDialog, contractPrefillFromEmployee } from '../../../components/HrDialogs';
import { Kpis } from '../../../components/Kpis';
import { EmployeeDialog } from '../../../components/PayrollDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { CONTRACTS, type Contract } from '../../../data/hr';
import {
  AGREEMENTS, CONTRACT_STATES, CONTRACT_TAG, RENEWAL_WINDOW, contractPay, contractState, currentEnd, daysBetween, isDriverRole, isLease,
  type ContractRecord,
} from '../../../data/hrRecords';
import { TODAY, daysFrom, fmtDate, usd } from '../../../data/invoicing';
import { EMPLOYEE_ROLES, addDays, type Employee } from '../../../data/payroll';
import type { FormValues } from '../../../data/fleet';
import { USER } from '../../../data/mock';
import { currentYear, isoDateAt, todayIso } from '../../../lib/clock';
import { contractDoc } from '../../../lib/contractDoc';
import { downloadPdf } from '../../../lib/pdf';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Release 1.7 (data/releases.ts) brings managed contracts; companies that have
// not received it keep the read-only list.
export function EmployeeContractsTab() {
  return isLive('hr-contracts') ? <Contracts /> : <LegacyContracts />;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dayOf = (iso: string) => (/T12:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : isoDateAt(new Date(iso)));

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

// The introductory-period review: due when the period ends, until it is recorded.
function reviewDue(c: ContractRecord, today: string): string {
  if (!c.probationDays || c.status !== 'Active' || c.log.some((l) => l.action === 'Reviewed')) return '';
  const due = addDays(c.start, c.probationDays);
  return daysBetween(today, due) <= 30 && daysBetween(due, today) <= 60 ? due : '';
}

function Contracts() {
  const { query, contracts, saveContract, employees } = useAppShell();
  const [showEnded, setShowEnded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContractRecord | null>(null);
  const [creating, setCreating] = useState<FormValues | null>(null);
  const [action, setAction] = useState<{ kind: 'sign' | 'renew' | 'end'; c: ContractRecord } | null>(null);
  const [toPayroll, setToPayroll] = useState<ContractRecord | null>(null);
  const today = todayIso();

  const stateOf = (c: ContractRecord) => contractState(c, today);
  const live = contracts.filter((c) => c.status !== 'Ended');
  const ended = contracts.filter((c) => c.status === 'Ended');
  const inForce = live.filter((c) => ['Active', 'Renewal due', 'Ending soon', 'Starts soon'].includes(stateOf(c)));
  const renewals = live.filter((c) => ['Renewal due', 'Ending soon', 'Expired'].includes(stateOf(c)));
  const unsigned = live.filter((c) => c.status === 'Draft' || c.status === 'Sent for signature');
  const reviews = live.filter((c) => reviewDue(c, today));
  const first = (name: string) => name.split(' ')[0];

  // People on payroll with nothing signed or on the way.
  const covered = (e: Employee) => live.some((c) => c.employeeId === e.id || c.person.toLowerCase() === e.name.toLowerCase());
  const missing = employees.filter((e) => e.status === 'Active' && !covered(e));

  const kpis = [
    { label: 'Contracts in force', value: String(inForce.length), note: `${inForce.filter((c) => isDriverRole(c.role)).length} drivers · ${inForce.filter((c) => !isDriverRole(c.role)).length} staff` },
    { label: `Renewals & endings (${RENEWAL_WINDOW} d)`, value: String(renewals.length), note: renewals.map((c) => `${first(c.person)} ${fmtDate(currentEnd(c, today) || c.end)}`).join(' · ') || 'None coming up' },
    { label: 'Awaiting signature', value: String(unsigned.length), note: unsigned.map((c) => `${first(c.person)} · ${c.status === 'Draft' ? 'draft' : 'sent'}`).join(' · ') || 'All signed' },
    { label: 'Intro-period reviews', value: String(reviews.length), note: reviews.map((c) => `${first(c.person)} ${fmtDate(reviewDue(c, today))}`).join(' · ') || 'None due in 30 days' },
  ];

  const filters: FilterDef<ContractRecord>[] = [
    { key: 'state', label: 'Status', type: 'select', get: (c) => stateOf(c), options: CONTRACT_STATES },
    { key: 'agreement', label: 'Agreement', type: 'select', get: (c) => c.agreement, options: AGREEMENTS },
    { key: 'role', label: 'Role', type: 'select', get: (c) => c.role, options: EMPLOYEE_ROLES },
    { key: 'start', label: 'Started', type: 'dates', get: (c) => c.start },
    { key: 'end', label: 'Ends or renews', type: 'dates', get: (c) => currentEnd(c, today) },
  ];
  const sort = useSort(
    usePageFilters((showEnded ? contracts : contracts.filter((c) => c.status !== 'Ended' || c.id === open)).filter((c) => matchesQuery({ ...c, documents: c.documents.map((d) => d.name).join(' '), log: '' }, query)), filters),
    { end: (c) => currentEnd(c, today) || '9999', state: (c) => CONTRACT_STATES.indexOf(stateOf(c)), pay: (c) => c.rate },
  );
  const rows = sort.rows;

  const log = (c: ContractRecord, action: string, note: string, patch: Partial<ContractRecord> = {}) =>
    saveContract({ ...c, ...patch, updated: new Date().toISOString(), log: [...c.log, { at: new Date().toISOString(), by: USER.name, action, note }] });

  const send = (c: ContractRecord) => {
    downloadPdf(contractDoc(c), `${c.id} ${c.person}.pdf`);
    log(c, 'Sent for signature', c.email ? `PDF prepared for ${c.email}` : 'PDF prepared for signing', { status: 'Sent for signature', sentOn: today });
  };

  const employeePrefill = (c: ContractRecord): FormValues => ({
    name: c.person, email: c.email, role: c.role, workerType: c.agreement.startsWith('Employment') || c.agreement.startsWith('Offer') ? 'W-2 employee' : '1099 contractor',
    hired: c.start, payBasis: c.payBasis, rate: String(c.rate), frequency: c.frequency, notes: `From contract ${c.id}.`,
  });

  return (
    <>
      <Kpis items={kpis} />

      {missing.length > 0 && (
        <div className="ui-note hr-missing">
          <span><strong>No contract on file</strong> for {missing.length} {missing.length === 1 ? 'person' : 'people'} on payroll:</span>
          {missing.map((e) => (
            <button key={e.id} type="button" className="ui-link" onClick={() => setCreating(contractPrefillFromEmployee(e))}>{e.name}</button>
          ))}
        </div>
      )}

      <Card
        title={showEnded ? 'All contracts' : 'Employee contracts'}
        flush
        action={ended.length > 0 && <button type="button" className="ui-link" onClick={() => setShowEnded(!showEnded)}>{showEnded ? 'Hide ended' : `Show ended (${ended.length})`}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="person">Person</SortTh><SortTh sort={sort} k="agreement">Agreement</SortTh><SortTh sort={sort} k="start">Start</SortTh>
              <SortTh sort={sort} k="end">Ends / renews</SortTh><SortTh sort={sort} k="pay">Pay</SortTh><SortTh sort={sort} k="state" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const state = stateOf(c);
              const end = currentEnd(c, today);
              const isOpen = open === c.id;
              const due = reviewDue(c, today);
              const emp = employees.find((e) => e.id === c.employeeId);
              return (
                <Fragment key={c.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}${c.status === 'Ended' ? ' is-off' : ''}`} onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                    <td className="strong">{c.person}<div className="ui-stop-meta">{c.id} · {c.role}</div></td>
                    <td>{c.agreement.replace(/ \(.*\)$/, '')}<div className="ui-stop-meta">{c.agreement.match(/\((.*)\)$/)?.[1] ?? c.employment}</div></td>
                    <td>{fmtDate(c.start)}</td>
                    <td>
                      {c.status === 'Ended' ? `Ended ${fmtDate(c.endedOn)}` : end ? fmtDate(end) : 'Ongoing'}
                      {c.status !== 'Ended' && end && <div className="ui-stop-meta">{c.renewal}{end >= today ? ` · in ${daysBetween(today, end)} d` : ''}</div>}
                    </td>
                    <td>{contractPay(c)}<div className="ui-stop-meta">{c.frequency}</div></td>
                    <td className="num"><Tag label={state} tagClass={CONTRACT_TAG[state]} />{due && <div className="ui-stop-meta">Review due {fmtDate(due)}</div>}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>
                              Drafted {fmtDate(dayOf(c.created))}
                              {c.sentOn ? ` · sent ${fmtDate(c.sentOn)}` : ''}
                              {c.personSigned ? ` · ${first(c.person)} signed ${fmtDate(c.personSigned)}` : ''}
                              {c.companySigned ? ` · company signed ${fmtDate(c.companySigned)}` : ''}
                            </div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => downloadPdf(contractDoc(c), `${c.id} ${c.person}.pdf`)}>Download PDF</button>
                            {c.status !== 'Ended' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(c)}>Edit</button>}
                            {c.status === 'Draft' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => send(c)}>Send for signature</button>}
                            {(c.status === 'Draft' || c.status === 'Sent for signature') && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setAction({ kind: 'sign', c })}>Record signatures</button>}
                            {due && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm(`Record ${c.person}'s introductory-period review as done today?`)) log(c, 'Reviewed', `Introductory-period review (${c.probationDays} days)`); }}>Review done</button>}
                            {c.status === 'Active' && c.termType === 'Fixed term' && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setAction({ kind: 'renew', c })}>Renew…</button>}
                            {c.status !== 'Ended' && c.status !== 'Draft' && <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => setAction({ kind: 'end', c })}>End…</button>}
                            {c.status === 'Ended' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm(`Reopen ${c.id}? It goes back to active.`)) log(c, 'Reopened', '', { status: 'Active', endedOn: '', endReason: '' }); }}>Reopen</button>}
                          </div>
                          {c.status === 'Ended' && <div className="ui-note" style={{ marginBottom: 12 }}>Ended {fmtDate(c.endedOn)} · {c.endReason}</div>}
                          {state === 'Expired' && <div className="ui-errors" style={{ marginBottom: 12 }}>The term ended {fmtDate(end)} with no renewal on file. Renew it or end it.</div>}
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Agreement">{c.agreement}<div className="ui-stop-meta">{c.employment}</div></Fact>
                            <Fact k="Term">{c.termType === 'Fixed term' ? `${c.termLength} · ${fmtDate(c.start)} – ${fmtDate(end || c.end)}` : `Ongoing from ${fmtDate(c.start)}`}<div className="ui-stop-meta">{[c.renewal, c.noticeDays ? `${c.noticeDays} days’ notice` : '', c.probationDays ? `${c.probationDays}-day intro period` : ''].filter(Boolean).join(' · ')}</div></Fact>
                            <Fact k="Pay">{contractPay(c)}<div className="ui-stop-meta">{[c.frequency, c.signOnBonus ? `${usd(c.signOnBonus)} sign-on` : '', c.ptoDays ? `${c.ptoDays} days PTO` : ''].filter(Boolean).join(' · ')}</div></Fact>
                            <Fact k="Benefits">{c.benefits.join(', ')}</Fact>
                            {isDriverRole(c.role) && <Fact k="Equipment">{[c.equipment, c.truck].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{c.fuel}</div></Fact>}
                            {isDriverRole(c.role) && (c.leasePayment > 0 || c.escrow > 0 || isLease(c.agreement)) && <Fact k="Lease & escrow">{[c.leasePayment ? `${usd(c.leasePayment)} per settlement` : '', c.escrow ? `${usd(c.escrow)} escrow` : ''].filter(Boolean).join(' · ')}</Fact>}
                            {isDriverRole(c.role) && <Fact k="Insurance">{c.insurance.join(', ')}</Fact>}
                            {isDriverRole(c.role) && (c.homeTime || c.region) && <Fact k="Home time · region">{[c.homeTime, c.region].filter(Boolean).join(' · ')}</Fact>}
                            <Fact k="Clauses">{c.clauses.join(', ')}</Fact>
                            <Fact k="Signs for the company">{[c.companySigner, c.signerTitle].filter(Boolean).join(', ')}</Fact>
                            <Fact k="Payroll">
                              {emp ? `${emp.name} · ${emp.id}${emp.status === 'Archived' ? ' (archived)' : ''}` : (
                                c.status !== 'Ended' ? <button type="button" className="ui-link" onClick={() => setToPayroll(c)}>+ Add to payroll</button> : 'Not on payroll'
                              )}
                            </Fact>
                            {c.onboardingId && <Fact k="Onboarding">{c.onboardingId}</Fact>}
                            {c.notes && <Fact k="Other terms">{c.notes}</Fact>}
                          </div>
                          <BillDocuments docs={c.documents} owner={`${c.id} ${c.person}`} hint="Signed contract, amendments, lease schedule" onChange={(documents) => saveContract({ ...c, documents, updated: new Date().toISOString() })} />
                          <div className="ui-label" style={{ margin: '14px 0 6px' }}>Log</div>
                          <ul className="crm-log">
                            {[...c.log].reverse().map((l, i) => (
                              <li key={i} className={l.action === 'Ended' ? 'is-off' : l.action === 'Signed' || l.action === 'Renewed' || l.action === 'Reopened' ? 'is-on' : ''}>
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
        {rows.length === 0 && <div className="ui-empty">{contracts.length ? 'Nothing matches the search or filters.' : 'No contracts yet. + New Contract drafts the first one.'}</div>}
      </Card>

      {creating && <ContractDialog prefill={creating} onClose={() => setCreating(null)} onSaved={(id) => setOpen(id)} />}
      {editing && <ContractDialog contract={editing} onClose={() => setEditing(null)} />}
      {action?.kind === 'sign' && <SignaturesDialog contract={action.c} onClose={() => setAction(null)} />}
      {action?.kind === 'renew' && <RenewDialog contract={action.c} onClose={() => setAction(null)} />}
      {action?.kind === 'end' && <EndContractDialog contract={action.c} onClose={() => setAction(null)} />}
      {toPayroll && (
        <EmployeeDialog
          prefill={employeePrefill(toPayroll)}
          onSaved={(id) => log(toPayroll, 'Linked to payroll', id, { employeeId: id })}
          onClose={() => setToPayroll(null)}
        />
      )}
    </>
  );
}

// — before 1.7: the read-only list —

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'Oct 1' (this year) or 'Mar 14, 2027' → ISO date.
const iso = (s: string) => {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?$/.exec(s.trim());
  return m ? `${m[3] ?? String(currentYear())}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};
const last = (name: string) => name.split(' ').at(-1);

// Counted from the contract rows; renewals from their renewal dates.
const active = CONTRACTS.filter((c) => c.status === 'Active');
const renewals = CONTRACTS.filter((c) => c.status !== 'Draft' && iso(c.renews) && daysFrom(TODAY, iso(c.renews)) >= 0 && daysFrom(TODAY, iso(c.renews)) <= 30);
const ownerOps = CONTRACTS.filter((c) => c.role === 'Owner-operator');
const drafts = CONTRACTS.filter((c) => c.status === 'Draft');

const KPIS = [
  { label: 'Active contracts', value: String(active.length), note: `${CONTRACTS.length} on file` },
  { label: 'Renewals due (30 d)', value: String(renewals.length), note: renewals.map((c) => `${last(c.employee)} ${c.renews}`).join(' · ') || 'None' },
  { label: 'Owner-operators', value: String(ownerOps.length), note: ownerOps.map((c) => `${last(c.employee)} · ${c.type.toLowerCase()} ${c.status === 'Expiring' ? 'ends' : 'renews'} ${c.renews}`).join(' · ') || 'None' },
  { label: 'Drafts', value: String(drafts.length), note: drafts.map((c) => `${last(c.employee)} · starts ${c.start}`).join(' · ') || 'None' },
];

const FILTERS: FilterDef<Contract>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (c) => c.status, options: ['Active', 'Renewal due', 'Expiring', 'Draft'] },
  { key: 'role', label: 'Role', type: 'select', get: (c) => c.role },
  { key: 'type', label: 'Contract type', type: 'select', get: (c) => c.type },
  { key: 'renews', label: 'Renews or ends', type: 'dates', get: (c) => iso(c.renews) },
  { key: 'start', label: 'Started', type: 'dates', get: (c) => isoOf(c.start) },
];

function LegacyContracts() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(CONTRACTS.filter((c) => matchesQuery(c, query)), FILTERS), { renews: (c) => iso(c.renews) });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Employee contracts" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="employee">Employee</SortTh><SortTh sort={sort} k="role">Role</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="start">Start</SortTh><SortTh sort={sort} k="renews">Renews</SortTh><SortTh sort={sort} k="payBasis">Pay basis</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.employee}>
                <td className="strong">{c.employee}</td>
                <td>{c.role}</td>
                <td>{c.type}</td>
                <td>{c.start}</td>
                <td>{c.renews}</td>
                <td className="muted">{c.payBasis}</td>
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

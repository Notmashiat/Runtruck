import { Fragment, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BillDocuments } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { EmployeeDialog, PayLineDialog } from '../../../components/PayrollDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { dollars, money } from '../../../data/accounting';
import { fmtDate, TODAY, usd, usd0 } from '../../../data/invoicing';
import { mondayOf } from '../../../data/metrics';
import { SETTLE_TAG, SETTLEMENTS, USER } from '../../../data/mock';
import {
  DRIVER_ROLES, EMPLOYEE_ROLES, PAY_BASES, PAY_FREQUENCIES, RUN_TAG, payLabel, runTotals, unitsText,
  type Employee, type PayLine, type PayRun,
} from '../../../data/payroll';
import { isoDateAt, shortDate, todayIso } from '../../../lib/clock';
import { downloadPdf } from '../../../lib/pdf';
import { payStubDoc } from '../../../lib/payStub';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { numberOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Release 1.5 (data/releases.ts) brings full payroll; companies that have not
// received it keep the driver settlements list.
export function PayrollTab() {
  return isLive('payroll') ? <Payroll /> : <Settlements />;
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

function Payroll() {
  const { query, employees, payRuns, savePayRun, deletePayRun, saveEmployee } = useAppShell();
  const [params] = useSearchParams();
  const archivedView = params.get('view') === 'archived';
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [openEmp, setOpenEmp] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adjusting, setAdjusting] = useState<{ run: PayRun; line: PayLine } | null>(null);
  const today = todayIso();
  const year = today.slice(0, 4);

  // Year to date: before RunTruck, plus paid runs this year (held pay is not paid).
  const paidLines = (id: string) => payRuns.filter((r) => r.status === 'Paid' && r.payDate.startsWith(year)).flatMap((r) => r.lines.filter((l) => l.employeeId === id && !l.hold).map((l) => ({ run: r, line: l })));
  const ytdOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    const lines = paidLines(id);
    const gross = (e?.ytdBefore ?? 0) + lines.reduce((s, x) => s + x.line.gross, 0);
    const net = lines.reduce((s, x) => s + x.line.net, 0);
    return { gross, net };
  };
  const lastPaid = (id: string) => payRuns.filter((r) => r.status === 'Paid' && r.lines.some((l) => l.employeeId === id && !l.hold)).map((r) => r.payDate).sort().pop() ?? '';

  const active = employees.filter((e) => e.status === 'Active');
  const archived = employees.filter((e) => e.status === 'Archived');
  const upcoming = payRuns.filter((r) => r.status !== 'Paid').sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
  const next = upcoming[0];
  const month = today.slice(0, 7);
  const paidMonth = payRuns.filter((r) => r.status === 'Paid' && r.payDate.startsWith(month));
  const ytdTotal = employees.reduce((s, e) => s + ytdOf(e.id).gross, 0);
  const drivers = active.filter((e) => DRIVER_ROLES.includes(e.role));

  const kpis = archivedView
    ? [
        { label: 'Archived', value: String(archived.length), note: 'Kept with their pay history' },
        { label: 'Archived this year', value: String(archived.filter((e) => e.log.some((l) => l.action === 'Archived' && l.at.startsWith(year))).length), note: year },
      ]
    : [
        { label: 'Next payday', value: next ? fmtDate(next.payDate) : '—', note: next ? `${next.id} · ${usd0(runTotals(next).net)} net · ${next.status.toLowerCase()}` : 'No run waiting' },
        { label: 'On payroll', value: String(active.length), note: `${drivers.length} drivers · ${active.length - drivers.length} staff` },
        { label: 'Paid this month', value: usd0(paidMonth.reduce((s, r) => s + runTotals(r).net, 0)), note: `${paidMonth.length} run${paidMonth.length === 1 ? '' : 's'} net` },
        { label: 'Payroll YTD', value: usd0(ytdTotal), note: 'Gross, all employees' },
      ];

  // — runs —
  const setStatus = (r: PayRun, status: PayRun['status']) => {
    const now = new Date().toISOString();
    savePayRun({
      ...r, status,
      ...(status === 'Approved' ? { approvedAt: now, approvedBy: USER.name } : {}),
      ...(status === 'Paid' ? { paidAt: now, paidBy: USER.name } : {}),
      ...(status === 'Draft' ? { approvedAt: undefined, approvedBy: undefined, paidAt: undefined, paidBy: undefined } : {}),
    });
  };
  const stubs = (r: PayRun, lines: PayLine[]) => downloadPdf(payStubDoc(r, lines, employees, ytdOf), lines.length === 1 ? `Pay statement ${lines[0].name} ${r.id}.pdf` : `Pay statements ${r.id}.pdf`);

  // Newest pay date first until a column is sorted.
  const runSort = useSort([...payRuns].sort((a, b) => (a.payDate < b.payDate ? 1 : -1)).filter((r) => matchesQuery({ id: r.id, names: r.lines.map((l) => l.name).join(' ') }, query)), {
    net: (r) => runTotals(r).net, gross: (r) => runTotals(r).gross, people: (r) => r.lines.length,
  });
  const runs = runSort.rows;

  // — employees —
  const list = archivedView ? archived : active;
  const empFilters: FilterDef<Employee>[] = [
    { key: 'role', label: 'Role', type: 'select', get: (e) => e.role, options: EMPLOYEE_ROLES },
    { key: 'type', label: 'Worker type', type: 'select', get: (e) => (e.workerType.startsWith('W-2') ? 'W-2' : '1099'), options: ['W-2', '1099'] },
    { key: 'basis', label: 'Paid', type: 'select', get: (e) => e.payBasis, options: PAY_BASES },
    { key: 'schedule', label: 'Pay schedule', type: 'select', get: (e) => e.frequency, options: PAY_FREQUENCIES },
    { key: 'method', label: 'Paid by', type: 'select', get: (e) => e.method },
    { key: 'ytd', label: 'Gross YTD', type: 'range', get: (e) => ytdOf(e.id).gross, prefix: '$' },
  ];
  const empSort = useSort(
    usePageFilters(list.filter((e) => matchesQuery({ ...e, documents: e.documents.map((d) => d.name).join(' '), log: '', recurring: e.recurring.map((i) => i.label).join(' ') }, query)), empFilters),
    { pay: (e) => e.rate, ytd: (e) => ytdOf(e.id).gross, lastPaid: (e) => lastPaid(e.id), archivedAt: (e) => [...e.log].reverse().find((l) => l.action === 'Archived')?.at ?? '' },
  );
  const people = empSort.rows;

  const lineCells = (r: PayRun, l: PayLine) => {
    const plus = l.items.filter((i) => i.kind !== 'Deduction').reduce((s, i) => s + i.amount, 0);
    const minus = l.items.filter((i) => i.kind === 'Deduction').reduce((s, i) => s + i.amount, 0);
    return (
      <tr key={l.employeeId} className={l.hold ? 'is-off' : ''}>
        <td className="strong">{l.name}<div className="ui-stop-meta">{l.role}</div></td>
        <td>{unitsText(l)}{l.loads.length > 0 && <div className="ui-stop-meta">{l.loads.join(', ')}</div>}</td>
        <td className="num">{usd(l.gross)}</td>
        <td className="num">{plus ? `+${usd(plus)}` : '—'}</td>
        <td className="num">{minus || l.tax ? `-${usd(minus + l.tax)}` : '—'}{l.tax > 0 && <div className="ui-stop-meta">tax {usd(l.tax)}</div>}</td>
        <td className="num strong" style={!l.hold && l.net < 0 ? { color: 'var(--ui-red)' } : undefined}>{l.hold ? <Tag label="On hold" tagClass="tag-outline" /> : usd(l.net)}</td>
        <td className="num">
          <span className="pay-actions">
            {r.status === 'Draft' && <button type="button" className="ui-link" onClick={() => setAdjusting({ run: r, line: l })}>Adjust</button>}
            <button type="button" className="ui-link" onClick={() => stubs(r, [l])}>Pay stub</button>
          </span>
        </td>
      </tr>
    );
  };

  return (
    <>
      <Kpis items={kpis} />

      {!archivedView && (
        <Card title="Pay runs" flush>
          <table className="ui-table">
            <thead>
              <tr>
                <SortTh sort={runSort} k="id">Run</SortTh><SortTh sort={runSort} k="start">Period</SortTh><SortTh sort={runSort} k="payDate">Pay date</SortTh>
                <SortTh sort={runSort} k="frequency">Group</SortTh><SortTh sort={runSort} k="people" num>People</SortTh><SortTh sort={runSort} k="gross" num>Gross</SortTh>
                <SortTh sort={runSort} k="net" num>Net</SortTh><SortTh sort={runSort} k="status" num>Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const t = runTotals(r);
                const isOpen = openRun === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpenRun(isOpen ? null : r.id)} aria-expanded={isOpen}>
                      <td className="strong">{r.id}</td>
                      <td>{fmtDate(r.start)} – {fmtDate(r.end)}</td>
                      <td>{fmtDate(r.payDate)}</td>
                      <td>{r.frequency}</td>
                      <td className="num">{r.lines.length}{t.held ? <div className="ui-stop-meta">{t.held} on hold</div> : null}</td>
                      <td className="num">{usd(t.gross)}</td>
                      <td className="num strong">{usd(t.net)}</td>
                      <td className="num"><Tag label={r.status} tagClass={RUN_TAG[r.status]} /></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="ui-expand-cell">
                          <div className="ui-batch">
                            <div className="ui-batch-head">
                              <div className="ui-stop-meta" style={{ marginTop: 0 }}>
                                Created by {r.createdBy} {when(r.created)}
                                {r.approvedAt ? ` · approved by ${r.approvedBy} ${when(r.approvedAt)}` : ''}
                                {r.paidAt ? ` · paid by ${r.paidBy} ${when(r.paidAt)}` : ''}
                              </div>
                              <div style={{ flex: 1 }} />
                              <button type="button" className="ui-btn ui-btn-sm" onClick={() => stubs(r, r.lines.filter((l) => !l.hold))}>All pay stubs (PDF)</button>
                              {r.status === 'Draft' && (
                                <>
                                  <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => { if (window.confirm(`Delete draft ${r.id}?`)) deletePayRun(r.id); }}>Delete draft</button>
                                  <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => {
                                    const short = r.lines.filter((l) => !l.hold && l.net < 0).map((l) => l.name);
                                    if (short.length) { window.alert(`${short.join(', ')}: deductions are more than pay. Adjust or hold before approving.`); return; }
                                    if (window.confirm(`Approve ${r.id}: ${usd(t.net)} net to ${r.lines.length - t.held} people, paid ${fmtDate(r.payDate)}?`)) setStatus(r, 'Approved');
                                  }}>Approve</button>
                                </>
                              )}
                              {r.status === 'Approved' && (
                                <>
                                  <button type="button" className="ui-btn ui-btn-sm" onClick={() => setStatus(r, 'Draft')}>Back to draft</button>
                                  <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => { if (window.confirm(`Mark ${r.id} paid (${usd(t.net)})?`)) setStatus(r, 'Paid'); }}>Mark paid</button>
                                </>
                              )}
                              {r.status === 'Paid' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm(`Undo the payment of ${r.id}? It goes back to approved.`)) setStatus(r, 'Approved'); }}>Undo paid</button>}
                            </div>
                            <table className="ui-table ui-table-inner">
                              <thead><tr><th>Person</th><th>Earned on</th><th className="num">Gross</th><th className="num">Additions</th><th className="num">Deductions & tax</th><th className="num">Net</th><th className="num" aria-label="Actions" /></tr></thead>
                              <tbody>{r.lines.map((l) => lineCells(r, l))}</tbody>
                            </table>
                            <div className="pay-run-total">
                              <span>Gross {usd(t.gross)}</span><span>Additions {usd(t.additions)}</span><span>Deductions {usd(t.deductions)}</span><span>Tax {usd(t.tax)}</span>
                              <strong>Net {usd(t.net)}</strong>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {runs.length === 0 && <div className="ui-empty">{payRuns.length ? 'Nothing matches the search or filters.' : 'No pay runs yet. + New pay run works out the first one.'}</div>}
        </Card>
      )}

      <Card title={archivedView ? 'Archived employees' : 'Employees'} flush>
        <table className="ui-table">
          <thead>
            {archivedView ? (
              <tr>
                <SortTh sort={empSort} k="name">Employee</SortTh><SortTh sort={empSort} k="role">Role</SortTh><SortTh sort={empSort} k="archivedAt">Archived</SortTh>
                <th>Why</th><th>By</th><SortTh sort={empSort} k="lastPaid">Last paid</SortTh><th className="num" aria-label="Actions" />
              </tr>
            ) : (
              <tr>
                <SortTh sort={empSort} k="name">Employee</SortTh><SortTh sort={empSort} k="workerType">Type</SortTh><SortTh sort={empSort} k="pay">Pay</SortTh>
                <SortTh sort={empSort} k="frequency">Schedule</SortTh><SortTh sort={empSort} k="method">Paid by</SortTh><SortTh sort={empSort} k="lastPaid">Last paid</SortTh>
                <SortTh sort={empSort} k="ytd" num>Gross YTD</SortTh>
              </tr>
            )}
          </thead>
          <tbody>
            {people.map((e) => {
              const isOpen = openEmp === e.id;
              const out = [...e.log].reverse().find((l) => l.action === 'Archived');
              const history = payRuns.flatMap((r) => r.lines.filter((l) => l.employeeId === e.id).map((l) => ({ r, l }))).sort((a, b) => (a.r.payDate < b.r.payDate ? 1 : -1));
              return (
                <Fragment key={e.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpenEmp(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <td className="strong">{e.name}<div className="ui-stop-meta">{e.id} · {archivedView ? e.workerType : e.role}</div></td>
                    {archivedView ? (
                      <>
                        <td>{e.role}</td>
                        <td>{out ? fmtDate(dayOf(out.at)) : '—'}</td>
                        <td>{out?.reason ?? '—'}</td>
                        <td>{out?.by ?? '—'}</td>
                        <td>{lastPaid(e.id) ? fmtDate(lastPaid(e.id)) : '—'}</td>
                        <td className="num"><button type="button" className="ui-btn ui-btn-sm" onClick={(ev) => { ev.stopPropagation(); setEditing(e); }}>Restore…</button></td>
                      </>
                    ) : (
                      <>
                        <td>{e.workerType.startsWith('W-2') ? 'W-2' : '1099'}</td>
                        <td>{payLabel(e)}<div className="ui-stop-meta">{e.payBasis}</div></td>
                        <td>{e.frequency}</td>
                        <td>{e.method}{e.accountLast4 ? <div className="ui-stop-meta">····{e.accountLast4}</div> : null}</td>
                        <td>{lastPaid(e.id) ? fmtDate(lastPaid(e.id)) : '—'}</td>
                        <td className="num">{usd0(ytdOf(e.id).gross)}</td>
                      </>
                    )}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Started {e.hired ? fmtDate(e.hired) : '—'} · on payroll since {fmtDate(dayOf(e.created))}</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(e)}>Edit employee</button>
                          </div>
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Role · type">{`${e.role} · ${e.workerType}`}</Fact>
                            <Fact k="Pay">{payLabel(e)}<div className="ui-stop-meta">{e.frequency}{e.payBasis === 'Hourly' ? ` · usually ${e.hoursPerPeriod} h` : ''}{e.workerType.startsWith('W-2') ? ` · withholding ~${e.withholdingPct}%` : ''}</div></Fact>
                            <Fact k="Payout">{`${e.method}${e.bank ? ` · ${e.bank}` : ''}${e.accountLast4 ? ` ····${e.accountLast4}` : ''}`}</Fact>
                            <Fact k="Contact">{[e.email, e.phone].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{[e.street, e.city, [e.state, e.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div></Fact>
                            {DRIVER_ROLES.includes(e.role) && <Fact k="Loads counted for">{e.driver || e.name}</Fact>}
                            <Fact k="Year to date">{`${usd0(ytdOf(e.id).gross)} gross`}<div className="ui-stop-meta">{usd0(ytdOf(e.id).net)} net through RunTruck</div></Fact>
                            <Fact k="Every pay">{e.recurring.length ? e.recurring.map((i) => `${i.label} ${i.kind === 'Deduction' ? '-' : '+'}${usd(i.amount)}`).join(' · ') : ''}</Fact>
                            {e.emergencyContact && <Fact k="Emergency contact">{e.emergencyContact}</Fact>}
                            {e.notes && <Fact k="Notes">{e.notes}</Fact>}
                          </div>
                          <BillDocuments
                            docs={e.documents} owner={e.name} hint="W-4 or W-9, direct deposit form, contract, CDL"
                            onChange={(documents) => saveEmployee({ ...e, documents, updated: new Date().toISOString() })}
                          />
                          <div className="ui-label" style={{ margin: '14px 0 6px' }}>Pay history</div>
                          {history.length === 0 ? (
                            <div className="ui-stop-meta">Not in any pay run yet.</div>
                          ) : (
                            <table className="ui-table ui-table-inner">
                              <thead><tr><th>Run</th><th>Period</th><th>Pay date</th><th>Status</th><th className="num">Gross</th><th className="num">Net</th><th className="num" aria-label="Pay stub" /></tr></thead>
                              <tbody>
                                {history.map(({ r, l }) => (
                                  <tr key={r.id}>
                                    <td className="strong">{r.id}</td>
                                    <td>{fmtDate(r.start)} – {fmtDate(r.end)}</td>
                                    <td>{fmtDate(r.payDate)}</td>
                                    <td>{l.hold ? <Tag label="On hold" tagClass="tag-outline" /> : <Tag label={r.status} tagClass={RUN_TAG[r.status]} />}</td>
                                    <td className="num">{usd(l.gross)}</td>
                                    <td className="num strong">{usd(l.net)}</td>
                                    <td className="num"><button type="button" className="ui-link" onClick={() => stubs(r, [l])}>Pay stub</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {e.log.length > 0 && (
                            <>
                              <div className="ui-label" style={{ margin: '14px 0 6px' }}>Log</div>
                              <ul className="crm-log">
                                {[...e.log].reverse().map((l, i) => (
                                  <li key={i} className={l.action === 'Archived' ? 'is-off' : l.action === 'Restored' ? 'is-on' : ''}>
                                    <strong>{l.action}</strong><span>{l.reason}</span><span className="ui-stop-meta" style={{ marginTop: 0 }}>{when(l.at)} · {l.by}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {people.length === 0 && (
          <div className="ui-empty">
            {list.length ? 'Nothing matches the search.' : archivedView ? 'No archived employees.' : 'No one on payroll yet. + Add employee adds the first person.'}
          </div>
        )}
      </Card>

      {editing && <EmployeeDialog employee={editing} onClose={() => setEditing(null)} />}
      {adjusting && <PayLineDialog run={adjusting.run} line={adjusting.line} onClose={() => setAdjusting(null)} />}
    </>
  );
}

// — before 1.5: driver settlements —

type SettlementRow = (typeof SETTLEMENTS)[number] & { tagClass: string };

const FILTERS: FilterDef<SettlementRow>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (s) => s.status },
  { key: 'basis', label: 'Pay basis', type: 'select', get: (s) => (s.basis.includes('%') ? '% of line haul' : s.basis.includes('/ mi') ? 'Per mile' : 'Other') },
  { key: 'net', label: 'Net pay', type: 'range', get: (s) => numberOf(s.net), prefix: '$' },
  { key: 'miles', label: 'Miles', type: 'range', get: (s) => numberOf(s.miles) },
];

// This week's settlements run Monday to Sunday.
const WEEK = shortDate(mondayOf(TODAY));

function Settlements() {
  const { query, approved, approveAll } = useAppShell();

  // "Approve all" flips every Ready settlement to Approved; holds and paid rows stay as they are.
  const settlementRows = SETTLEMENTS.map((x) => {
    const status = approved && x.status === 'Ready' ? 'Approved' : x.status;
    return { ...x, status, tagClass: SETTLE_TAG[status] };
  });
  const ready = settlementRows.filter((s) => s.status === 'Ready').length;
  const gross = settlementRows.reduce((sum, x) => sum + dollars(x.gross), 0);
  const deductions = settlementRows.reduce((sum, x) => sum + dollars(x.ded), 0);
  const net = settlementRows.reduce((sum, x) => sum + dollars(x.net), 0);
  const sort = useSort(usePageFilters(settlementRows.filter((s) => matchesQuery(s, query)), FILTERS));
  const rows = sort.rows;

  const kpis = [
    { label: 'Drivers', value: String(settlementRows.length), note: approved ? 'Approved for payment' : `${ready} ready to approve` },
    { label: 'Gross', value: money(gross), note: `Week of ${WEEK}` },
    { label: 'Deductions', value: money(Math.abs(deductions)), note: 'Fuel advances and escrow' },
    { label: 'Net payable', value: money(net), note: approved ? 'Approved' : 'Awaiting approval' },
  ];

  return (
    <>
      <Kpis items={kpis} />

      <Card
        title={`Driver settlements · week of ${WEEK}`}
        flush
        action={<button type="button" className="ui-link" onClick={approveAll}>{approved ? 'Approved' : 'Approve all'}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Driver</SortTh><SortTh sort={sort} k="basis">Pay basis</SortTh><SortTh sort={sort} k="loads" num>Loads</SortTh><SortTh sort={sort} k="miles" num>Miles</SortTh>
              <SortTh sort={sort} k="gross" num>Gross</SortTh><SortTh sort={sort} k="ded" num>Deductions</SortTh><SortTh sort={sort} k="net" num>Net</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name}>
                <td className="strong">{s.name}</td>
                <td className="muted">{s.basis}</td>
                <td className="num">{s.loads}</td>
                <td className="num">{s.miles}</td>
                <td className="num">{s.gross}</td>
                <td className="num">{s.ded}</td>
                <td className="num strong">{s.net}</td>
                <td className="num"><Tag label={s.status} tagClass={s.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
        <div className="ui-total">Net payable this week <strong>{money(net)}</strong></div>
      </Card>
    </>
  );
}

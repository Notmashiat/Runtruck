import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import type { FormValues } from '../data/fleet';
import { fmtDate, usd } from '../data/invoicing';
import { deliveryIso, isDelivered, lineHaulOf } from '../data/loads';
import { USER, type Load } from '../data/mock';
import {
  ARCHIVE_REASONS, COMMON_ADDITIONS, COMMON_DEDUCTIONS, DRIVER_ROLES, EMPLOYEE_ROLES, ITEM_KINDS, PAY_BASES, PAY_FREQUENCIES, PAYOUT_METHODS, WORKER_TYPES,
  blankEmployeeForm, defaultPeriod, earns, employeeFromForm, employeeToForm, itemId, lineFor, nextEmployeeId, nextRunId, payLabel, settle, unitLabel, unitsText,
  type DeliveredLoad, type Employee, type ItemKind, type PayFrequency, type PayItem, type PayLine, type PayRun,
} from '../data/payroll';
import { todayIso } from '../lib/clock';
import { PHONE, STATE, ZIP } from '../lib/rules';
import { BillDocuments } from './BillDialogs';
import { Field, useModal } from './FormBits';
import { RecordDialog, type SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');

// Delivered loads, as payroll counts them: by the day each was delivered
// (the real date, with its year) and its driver. Percentage pay is on the
// line haul, not on fuel or accessorials.
export function deliveredLoads(loads: Load[]): DeliveredLoad[] {
  return loads
    .filter((l) => isDelivered(l.status))
    .map((l) => ({
      id: l.id, driver: l.driver, delivered: deliveryIso(l),
      miles: Number(l.miles.replace(/[^\d.]/g, '')) || 0, linehaul: lineHaulOf(l),
    }))
    .filter((l) => l.delivered);
}

// Per-pay additions and deductions: add, change, remove.
// Money box that keeps what is typed ('12.' stays '12.') and starts empty instead of '0'.
function AmountInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <input className="ui-input num" inputMode="decimal" placeholder="0.00" value={text} aria-label="Amount" onChange={(e) => {
      const t = e.target.value.replace(/[^0-9.]/g, '');
      setText(t);
      onChange(Math.round((Number(t) || 0) * 100) / 100);
    }} />
  );
}

export function ItemsEditor({ items, onChange }: { items: PayItem[]; onChange: (items: PayItem[]) => void }) {
  const set = (id: string, patch: Partial<PayItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  return (
    <div className="pay-items">
      <datalist id="pay-item-names">{[...COMMON_DEDUCTIONS, ...COMMON_ADDITIONS].map((n) => <option key={n} value={n} />)}</datalist>
      {items.length === 0 && <div className="ui-stop-meta">None.</div>}
      {items.map((i) => (
        <div key={i.id} className="pay-item">
          <input className="ui-input" list="pay-item-names" value={i.label} placeholder="e.g. Escrow, Detention" aria-label="What it is" onChange={(e) => set(i.id, { label: e.target.value })} />
          <select className="ui-input" value={i.kind} aria-label="Kind" onChange={(e) => set(i.id, { kind: e.target.value as ItemKind })}>{ITEM_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <AmountInput value={i.amount} onChange={(amount) => set(i.id, { amount })} />
          <button type="button" className="ui-icon-btn" aria-label={`Remove ${i.label || 'item'}`} onClick={() => onChange(items.filter((x) => x.id !== i.id))}>×</button>
        </div>
      ))}
      <div className="exp-links">
        <button type="button" className="ui-link" onClick={() => onChange([...items, { id: itemId(), label: '', kind: 'Deduction', amount: 0 }])}>+ Deduction</button>
        <button type="button" className="ui-link" onClick={() => onChange([...items, { id: itemId(), label: '', kind: 'Bonus', amount: 0 }])}>+ Bonus / extra pay</button>
        <button type="button" className="ui-link" onClick={() => onChange([...items, { id: itemId(), label: '', kind: 'Reimbursement', amount: 0 }])}>+ Reimbursement</button>
      </div>
    </div>
  );
}

function employeeSections(drivers: string[], taken: string[]): SectionSpec[] {
  const isDriver = (v: FormValues) => DRIVER_ROLES.includes(val(v, 'role'));
  return [
    {
      title: 'Person',
      help: 'Who they are and how to reach them.',
      fields: [
        { key: 'name', label: 'Full name', required: true, check: (value) => (taken.includes(value.trim().toLowerCase()) ? 'Someone on payroll already has this name' : null) },
        { key: 'role', label: 'Role', type: 'select', required: true, options: EMPLOYEE_ROLES },
        { key: 'workerType', label: 'Worker type', type: 'select', required: true, options: WORKER_TYPES, help: 'W-2 has tax withheld; 1099 contractors are paid gross.' },
        { key: 'hired', label: 'Start date', type: 'date', required: true },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Phone', type: 'tel', check: PHONE },
        { key: 'street', label: 'Home address', wide: true },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State', maxLength: 2, upper: true, check: STATE },
        { key: 'zip', label: 'ZIP', check: ZIP },
        { key: 'emergencyContact', label: 'Emergency contact', placeholder: 'Name and phone' },
      ],
    },
    {
      title: 'Pay',
      help: 'How their pay is worked out each period.',
      fields: [
        { key: 'payBasis', label: 'Paid', type: 'select', required: true, options: PAY_BASES },
        {
          key: 'rate', label: 'Rate', type: 'number', required: true,
          help: 'Per mile: $ a mile · % of line haul: the percent · Per load: $ a load · Hourly: $ an hour · Salary: $ a year',
          check: (value) => (Number(value.replace(/[$,%]/g, '')) > 0 ? null : 'More than 0'),
        },
        { key: 'hoursPerPeriod', label: 'Usual hours per pay period', type: 'number', show: (v) => val(v, 'payBasis') === 'Hourly', help: 'Filled in on each pay run; change it there for overtime or time off.' },
        { key: 'frequency', label: 'Pay schedule', type: 'select', required: true, options: PAY_FREQUENCIES },
        { key: 'driver', label: 'Driver on loads', type: 'select', options: drivers, show: isDriver, help: 'Whose delivered loads count toward pay. Defaults to their name.' },
        { key: 'withholdingPct', label: 'Tax withholding estimate (%)', type: 'number', show: (v) => val(v, 'workerType').startsWith('W-2') },
        { key: 'ytdBefore', label: 'Gross paid this year before RunTruck ($)', type: 'number', help: 'So year-to-date totals are right.' },
      ],
    },
    {
      title: 'Payout',
      help: 'Where their pay goes.',
      fields: [
        { key: 'method', label: 'Pay by', type: 'select', required: true, options: PAYOUT_METHODS },
        { key: 'bank', label: 'Bank', show: (v) => val(v, 'method') === 'Direct deposit' },
        { key: 'accountLast4', label: 'Account (last 4)', show: (v) => val(v, 'method') !== 'Check', check: (value) => (/^\d{4}$/.test(value) ? null : '4 digits') },
      ],
    },
    {
      title: 'Every pay',
      help: 'Deductions, extra pay and reimbursements taken or added every pay (escrow, truck lease, insurance, ELD fee…). One-off items are added on the pay run.',
      fields: [],
    },
    {
      title: 'Documents & notes',
      help: 'W-4 or W-9, direct deposit form, contract, CDL.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

// Add employee and Edit employee (which also archives or restores). `prefill`
// starts a new employee from what is already known (onboarding, a contract).
export function EmployeeDialog({ employee, prefill, onSaved, onClose }: { employee?: Employee; prefill?: FormValues; onSaved?: (id: string) => void; onClose: () => void }) {
  const { employees, saveEmployee, deleteEmployee, drivers, payRuns } = useAppShell();
  const [id] = useState(() => employee?.id ?? nextEmployeeId(employees));
  const [recurring, setRecurring] = useState<PayItem[]>(employee?.recurring ?? []);
  const [docs, setDocs] = useState<BillDocument[]>(employee?.documents ?? []);
  const [initial] = useState<FormValues>(() => (employee ? employeeToForm(employee) : { ...blankEmployeeForm(todayIso()), ...prefill }));
  const [archiving, setArchiving] = useState(false);
  const taken = employees.filter((e) => e.id !== id).map((e) => e.name.toLowerCase());
  const everPaid = Boolean(employee && payRuns.some((r) => r.lines.some((l) => l.employeeId === employee.id)));

  const restore = () => {
    if (!employee || !window.confirm(`Restore ${employee.name} to active payroll?`)) return;
    const now = new Date().toISOString();
    saveEmployee({ ...employee, status: 'Active', updated: now, log: [...employee.log, { at: now, by: USER.name, action: 'Restored', reason: 'Restored by a user' }] });
    onClose();
  };

  return (
    <>
      <RecordDialog
        heading={employee ? `Edit ${employee.name}` : 'New employee'}
        saveLabel={employee ? 'Save changes' : 'Add employee'}
        sections={employeeSections(drivers.filter((d) => !d.archived).map((d) => d.name), taken)}
        initial={initial}
        isNew={!employee}
        recordLabel={employee ? employee.name : 'employee'}
        noun="employee"
        deleteNote="Removed for good, with their documents. People who have been paid can only be archived, so their pay history stays."
        extras={{
          'Every pay': <ItemsEditor items={recurring} onChange={setRecurring} />,
          'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={employee?.name ?? 'New employee'} hint="W-4 or W-9, direct deposit form, contract, CDL" />,
        }}
        footerExtra={
          employee && (employee.status === 'Active'
            ? <button type="button" className="ui-btn ui-btn-danger" onClick={() => setArchiving(true)}>Archive</button>
            : <button type="button" className="ui-btn" onClick={restore}>Restore</button>)
        }
        onSave={(v) => {
          saveEmployee(employeeFromForm(v, id, recurring.filter((i) => i.label.trim() && i.amount), docs, USER.name, employee));
          onSaved?.(id);
        }}
        onDelete={employee && !everPaid ? () => deleteEmployee(employee.id) : undefined}
        onClose={onClose}
      />
      {archiving && employee && <ArchiveEmployeeDialog employee={employee} onClose={() => setArchiving(false)} onDone={onClose} />}
    </>
  );
}

// Archive someone who no longer works here, saying why.
export function ArchiveEmployeeDialog({ employee, onClose, onDone }: { employee: Employee; onClose: () => void; onDone?: () => void }) {
  const { saveEmployee } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [reason, setReason] = useState(ARCHIVE_REASONS[0]);
  const [note, setNote] = useState('');
  const save = () => {
    const now = new Date().toISOString();
    saveEmployee({ ...employee, status: 'Archived', updated: now, log: [...employee.log, { at: now, by: USER.name, action: 'Archived', reason: [reason, note.trim()].filter(Boolean).join(' · ') }] });
    closeNow();
    onDone?.();
  };
  return (
    <dialog ref={ref} className="ui-dialog is-compact" aria-label={`Archive ${employee.name}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Archive</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{employee.name}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>They leave new pay runs but keep their pay history and documents under Archived. You can restore them any time. Unsaved changes in the edit form are not kept.</p>
          </div>
          <Field label="Why" required>
            <select className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)}>{ARCHIVE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
          <Field label="Note" help="Optional: last day, final pay details…">
            <textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-danger-solid" onClick={save}>Archive</button>
        </footer>
      </div>
    </dialog>
  );
}

// New pay run: a period, a pay date and who is in it; pay is worked out from
// delivered loads, hours and salaries, and the run starts as a draft.
export function PayRunDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { employees, payRuns, savePayRun, loads } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const active = employees.filter((e) => e.status === 'Active');
  const firstFreq = (PAY_FREQUENCIES.find((f) => active.some((e) => e.frequency === f)) ?? 'Weekly') as PayFrequency;
  const delivered = deliveredLoads(loads);
  // By default, everyone in the group who earned something in the period.
  const earners = (f: PayFrequency, p: { start: string; end: string }) =>
    active.filter((e) => e.frequency === f).filter((e) => earns(lineFor(e, f, p.start, p.end, delivered))).map((e) => e.id);
  const [frequency, setFrequency] = useState<PayFrequency>(firstFreq);
  const [period, setPeriodState] = useState(() => defaultPeriod(firstFreq));
  const [picked, setPicked] = useState<string[]>(() => earners(firstFreq, defaultPeriod(firstFreq)));
  const setPeriod = (p: typeof period) => {
    setPeriodState(p);
    if (p.start && p.end) setPicked(earners(frequency, p));
  };
  const loadsInPeriod = delivered.filter((l) => l.delivered >= period.start && l.delivered <= period.end).length;
  const group = active.filter((e) => e.frequency === frequency);
  const preview = group.map((e) => lineFor(e, frequency, period.start, period.end, delivered));
  const chosen = preview.filter((l) => picked.includes(l.employeeId));
  const overlap = payRuns.find((r) => r.frequency === frequency && r.start <= period.end && r.end >= period.start);
  const bad = !period.start || !period.end || period.end < period.start || !period.payDate || chosen.length === 0;

  const pickFrequency = (f: PayFrequency) => {
    const p = defaultPeriod(f);
    setFrequency(f);
    setPeriodState(p);
    setPicked(earners(f, p));
  };

  const create = () => {
    const id = nextRunId(payRuns);
    const run: PayRun = {
      id, start: period.start, end: period.end, payDate: period.payDate, frequency, status: 'Draft',
      lines: chosen, created: new Date().toISOString(), createdBy: USER.name,
    };
    savePayRun(run);
    onCreated?.(id);
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-compact payrun-dialog" aria-label="New pay run" onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">New pay run</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{frequency} · {fmtDate(period.start)} – {fmtDate(period.end)}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>Drivers are paid for loads delivered in the period; hourly staff for their usual hours (change them on the run); salaried staff for one period of salary. It starts as a draft you can adjust.</p>
          </div>
          <div className="ui-form-grid is-3">
            <Field label="Pay group">
              <select className="ui-input" value={frequency} onChange={(e) => pickFrequency(e.target.value as PayFrequency)}>
                {PAY_FREQUENCIES.map((f) => <option key={f} value={f}>{f} · {active.filter((e) => e.frequency === f).length} people</option>)}
              </select>
            </Field>
            <Field label="Period from"><input className="ui-input" type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></Field>
            <Field label="Period to"><input className="ui-input" type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></Field>
            <Field label="Pay date"><input className="ui-input" type="date" value={period.payDate} onChange={(e) => setPeriod({ ...period, payDate: e.target.value })} /></Field>
          </div>
          {period.payDate && period.end && period.payDate < period.end && <div className="ui-note">The pay date is before the period ends ({fmtDate(period.end)}). Pay in arrears: pick a date after the period.</div>}
          {overlap && <div className="ui-note">{overlap.id} ({overlap.status.toLowerCase()}) already covers {fmtDate(overlap.start)} – {fmtDate(overlap.end)} for this group.</div>}
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead><tr><th aria-label="Include" /><th>Person</th><th>Pay</th><th className="num">Units</th><th className="num">Gross</th><th className="num">Net</th></tr></thead>
              <tbody>
                {preview.map((l) => {
                  const e = group.find((x) => x.id === l.employeeId) as Employee;
                  const on = picked.includes(l.employeeId);
                  return (
                    <tr key={l.employeeId} className="is-clickable" onClick={() => setPicked(on ? picked.filter((x) => x !== l.employeeId) : [...picked, l.employeeId])}>
                      <td><input type="checkbox" checked={on} onChange={() => undefined} aria-label={`Include ${l.name}`} /></td>
                      <td className="strong">{l.name}<div className="ui-stop-meta">{l.role}</div></td>
                      <td>{payLabel(e)}</td>
                      <td className="num">
                        {l.basis === 'Salary' ? 'Salary' : unitsText(l)}
                        {l.loads.length > 0 && <div className="ui-stop-meta">{l.loads.length} load{l.loads.length === 1 ? '' : 's'}</div>}
                        {!earns(l) && <div className="ui-stop-meta">No loads delivered in this period</div>}
                      </td>
                      <td className="num">{usd(l.gross)}</td>
                      <td className="num strong" style={l.net < 0 ? { color: 'var(--ui-red)' } : undefined}>
                        {usd(l.net)}{l.net < 0 && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>Deductions more than pay</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.length === 0 && <div className="ui-empty">Nobody active is paid {frequency.toLowerCase()}.</div>}
          </div>
          <p className="ui-stop-meta" style={{ margin: 0 }}>
            {loadsInPeriod} load{loadsInPeriod === 1 ? '' : 's'} delivered in this period. People with nothing to pay are left out unless you tick them (their every-pay deductions would make their pay negative).
          </p>
        </section>
        <footer className="ui-dialog-foot">
          <div className="ui-stop-meta" style={{ marginTop: 0 }}>{chosen.length} people · net {usd(chosen.reduce((s, l) => s + l.net, 0))}</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={bad} onClick={create}>Create draft run</button>
        </footer>
      </div>
    </dialog>
  );
}

// Adjust one person's pay on a draft run.
export function PayLineDialog({ run, line, onClose }: { run: PayRun; line: PayLine; onClose: () => void }) {
  const { employees, savePayRun } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const e = employees.find((x) => x.id === line.employeeId);
  const [units, setUnits] = useState(String(line.units));
  const [items, setItems] = useState<PayItem[]>(line.items);
  const [hold, setHold] = useState(line.hold);
  const [note, setNote] = useState(line.note);
  const next = settle({ ...line, units: Number(units.replace(/[$,]/g, '')) || 0, items: items.filter((i) => i.label.trim() || i.amount), hold, note }, e, run.frequency);

  const save = () => {
    savePayRun({ ...run, lines: run.lines.map((l) => (l.employeeId === line.employeeId ? next : l)) });
    closeNow();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-compact payrun-dialog" aria-label={`Adjust ${line.name}`} onClose={(ev) => { if (ownEvent(ev)) onClose(); }} onCancel={(ev) => ownEvent(ev)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">{run.id} · {fmtDate(run.start)} – {fmtDate(run.end)}</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{line.name}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{line.role}{e ? ` · ${payLabel(e)}` : ''}{line.loads.length ? ` · loads ${line.loads.join(', ')}` : ''}</p>
            {next.net < 0 && <div className="ui-errors" style={{ marginTop: 8 }}>Deductions are more than pay. Remove or lower a deduction, or hold this pay.</div>}
          </div>
          <div className="ui-form-grid">
            {line.basis !== 'Salary' ? (
              <Field label={`${unitLabel(line.basis)[0].toUpperCase()}${unitLabel(line.basis).slice(1)}`} help={line.basis === 'Hourly' ? 'Include overtime hours at the regular rate; add an overtime premium as a bonus.' : 'From delivered loads; change it for corrections.'}>
                <input className="ui-input num" inputMode="decimal" value={units} onChange={(ev) => setUnits(ev.target.value)} />
              </Field>
            ) : (
              <Field label="Periods of salary" help="1 is a normal pay; 0.5 for half a period.">
                <input className="ui-input num" inputMode="decimal" value={units} onChange={(ev) => setUnits(ev.target.value)} />
              </Field>
            )}
            <Field label="Note on the pay stub"><input className="ui-input" value={note} onChange={(ev) => setNote(ev.target.value)} /></Field>
          </div>
          <div>
            <div className="ui-label" style={{ marginBottom: 6 }}>Additions and deductions this pay</div>
            <ItemsEditor items={items} onChange={setItems} />
          </div>
          <label className="ui-check"><input type="checkbox" checked={hold} onChange={(ev) => setHold(ev.target.checked)} /> Hold this pay (not paid with the run)</label>
          <div className="pay-summary">
            <span>Gross {usd(next.gross)}</span>
            <span>+ {usd(next.items.filter((i) => i.kind !== 'Deduction').reduce((s, i) => s + i.amount, 0))}</span>
            <span>- {usd(next.items.filter((i) => i.kind === 'Deduction').reduce((s, i) => s + i.amount, 0))}</span>
            {next.tax > 0 && <span>- tax {usd(next.tax)}</span>}
            <strong>Net {usd(next.net)}</strong>
          </div>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>Save</button>
        </footer>
      </div>
    </dialog>
  );
}


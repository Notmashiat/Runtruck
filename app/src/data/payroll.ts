// Accounting › Payroll: everyone the company pays (company drivers,
// owner-operators, dispatch, shop and office staff), how each is paid, and
// pay runs. A pay run works out each person's pay for a period — drivers
// from the loads they delivered (per mile, % of line haul or per load),
// staff from hours or salary — then recurring and one-off additions and
// deductions and estimated tax withholding. Stored per company
// (runtruck-<id>-employees, runtruck-<id>-payruns).
import { nextSerial } from '../lib/ids';
import { addDaysIso } from '../lib/isoDates';
import { reviveList } from '../lib/persist';
import { IS_DEMO } from '../lib/account';
import { shiftIso, todayIso } from '../lib/clock';
import type { BillDocument } from './bills';
import type { FormValues } from './fleet';

export type PayBasis = 'Per mile' | '% of line haul' | 'Flat per load' | 'Hourly' | 'Salary';
export type PayFrequency = 'Weekly' | 'Every 2 weeks' | 'Twice a month' | 'Monthly';
export type ItemKind = 'Deduction' | 'Reimbursement' | 'Bonus';
export type RunStatus = 'Draft' | 'Approved' | 'Paid';

export const PAY_BASES: PayBasis[] = ['Per mile', '% of line haul', 'Flat per load', 'Hourly', 'Salary'];
export const PAY_FREQUENCIES: PayFrequency[] = ['Weekly', 'Every 2 weeks', 'Twice a month', 'Monthly'];
export const EMPLOYEE_ROLES = [
  'Company driver', 'Owner-operator', 'Lease-purchase driver', 'Dispatcher', 'Fleet manager', 'Mechanic', 'Accounting',
  'Safety & compliance', 'Office / admin', 'Manager',
];
export const DRIVER_ROLES = ['Company driver', 'Owner-operator', 'Lease-purchase driver'];
export const WORKER_TYPES = ['W-2 employee', '1099 contractor'];
export const PAYOUT_METHODS = ['Direct deposit', 'Check', 'Pay card'];
export const ITEM_KINDS: ItemKind[] = ['Deduction', 'Reimbursement', 'Bonus'];
export const ARCHIVE_REASONS = ['Resigned', 'Terminated', 'Contract ended', 'Seasonal / laid off', 'Retired', 'Duplicate record', 'Other'];
export const RUN_TAG: Record<RunStatus, string> = { Draft: 'tag-outline', Approved: 'tag-accent', Paid: 'tag-green' };
export const PERIODS_PER_YEAR: Record<PayFrequency, number> = { Weekly: 52, 'Every 2 weeks': 26, 'Twice a month': 24, Monthly: 12 };

// Common per-pay items, offered in the forms.
export const COMMON_DEDUCTIONS = ['Escrow', 'Truck lease payment', 'Occupational accident insurance', 'Health insurance', 'ELD fee', 'Fuel advance', 'Cash advance', 'Damage / claim', 'Garnishment', '401(k)'];
export const COMMON_ADDITIONS = ['Detention', 'Layover', 'Extra stop', 'Tarp pay', 'Breakdown pay', 'Safety bonus', 'Referral bonus', 'Lumper reimbursement', 'Tolls reimbursement', 'Per diem'];

export interface PayItem {
  id: string;
  label: string;
  kind: ItemKind;
  amount: number;
}

export interface EmployeeLog {
  at: string;
  by: string;
  action: 'Added' | 'Archived' | 'Restored';
  reason: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  workerType: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  hired: string;
  // The fleet driver whose loads count (drivers only).
  driver: string;
  payBasis: PayBasis;
  rate: number;
  hoursPerPeriod: number;
  frequency: PayFrequency;
  method: string;
  bank: string;
  accountLast4: string;
  withholdingPct: number;
  // Taken or added every pay.
  recurring: PayItem[];
  // Gross paid before RunTruck pay runs, in the year `ytdBeforeYear` (it
  // counts toward that year's total only, not every year after).
  ytdBefore: number;
  ytdBeforeYear?: number;
  emergencyContact: string;
  notes: string;
  documents: BillDocument[];
  status: 'Active' | 'Archived';
  log: EmployeeLog[];
  created: string;
  updated?: string;
}

export interface PayLine {
  employeeId: string;
  name: string;
  role: string;
  basis: PayBasis;
  // Miles, line haul $, loads, hours, or 1 (salary).
  units: number;
  rate: number;
  gross: number;
  items: PayItem[];
  tax: number;
  net: number;
  loads: string[];
  hold: boolean;
  note: string;
  // The day held pay was released and paid, when that was after the run's pay date.
  paidOn?: string;
}

export interface PayRun {
  id: string;
  start: string;
  end: string;
  payDate: string;
  frequency: PayFrequency;
  status: RunStatus;
  lines: PayLine[];
  created: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  paidAt?: string;
  paidBy?: string;
}

// — money and dates —

// To the cent, with an exact half-cent rounding up (see round2 in data/invoicing.ts).
export const round2 = (n: number) => Math.round(n * 100 + Math.sign(n) * 1e-6) / 100;

// Date arithmetic lives in lib/isoDates.ts (safe on blank or mistyped dates).
export const addDays = addDaysIso;

const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const mondayOf = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7));

// The pay period to offer for a new run, and its pay date.
//
// With `lastEnd` (the end of the group's latest run) the period carries on
// from the day after it, so no days are skipped or paid twice even when a
// run is made late. Without it: the last full period before `today`. The pay
// date is the Friday after the period (weekly groups) or five days after it
// (monthly groups), and never a day that has already passed.
export function defaultPeriod(f: PayFrequency, today = todayIso(), lastEnd = ''): { start: string; end: string; payDate: string } {
  const fridayAfter = (iso: string) => addDays(iso, (5 - dow(iso) + 7) % 7 || 7);
  const notPast = (iso: string) => (iso < today ? today : iso);
  const [y, m, d] = today.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  const monthEnd = (day: string) => iso(Number(day.slice(0, 4)), Number(day.slice(5, 7)) + 1, 0);

  const next = lastEnd ? addDays(lastEnd, 1) : '';
  if (next) {
    if (f === 'Weekly' || f === 'Every 2 weeks') {
      const end = addDays(next, f === 'Weekly' ? 6 : 13);
      return { start: next, end, payDate: notPast(fridayAfter(end)) };
    }
    const day = Number(next.slice(8, 10));
    const end = f === 'Twice a month' && day <= 15 ? `${next.slice(0, 8)}15` : monthEnd(next);
    return { start: next, end, payDate: notPast(addDays(end, 5)) };
  }

  const thisMonday = mondayOf(today);
  if (f === 'Weekly') {
    const start = addDays(thisMonday, -7);
    const end = addDays(thisMonday, -1);
    return { start, end, payDate: notPast(fridayAfter(end)) };
  }
  if (f === 'Every 2 weeks') {
    const start = addDays(thisMonday, -14);
    const end = addDays(thisMonday, -1);
    return { start, end, payDate: notPast(fridayAfter(end)) };
  }
  if (f === 'Twice a month') {
    if (d > 15) return { start: iso(y, m, 1), end: iso(y, m, 15), payDate: notPast(iso(y, m, 20)) };
    return { start: iso(y, m - 1, 16), end: iso(y, m, 0), payDate: notPast(iso(y, m, 5)) };
  }
  return { start: iso(y, m - 1, 1), end: iso(y, m, 0), payDate: notPast(iso(y, m, 5)) };
}

// The end of a pay group's latest run ('' when it has none yet).
export function lastRunEnd(payRuns: PayRun[], f: PayFrequency): string {
  return payRuns.filter((r) => r.frequency === f).map((r) => r.end).sort().pop() ?? '';
}

// '$0.62 / mi' style, for lists.
export function payLabel(e: Pick<Employee, 'payBasis' | 'rate'>): string {
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  switch (e.payBasis) {
    case 'Per mile': return `${money(e.rate)} / mi`;
    case '% of line haul': return `${e.rate}% of line haul`;
    case 'Flat per load': return `${money(e.rate)} / load`;
    case 'Hourly': return `${money(e.rate)} / hr`;
    default: return `${money(e.rate)} / yr`;
  }
}

// '2,140 miles × $0.62', '$5,820 line haul × 25%', '82 hours × $34.50', 'Salary'.
export function unitsText(l: Pick<PayLine, 'basis' | 'units' | 'rate'>): string {
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const n = l.units.toLocaleString('en-US');
  switch (l.basis) {
    case 'Per mile': return `${n} miles × ${money(l.rate)}`;
    case '% of line haul': return `${money(l.units)} line haul × ${l.rate}%`;
    case 'Flat per load': return `${n} load${l.units === 1 ? '' : 's'} × ${money(l.rate)}`;
    case 'Hourly': return `${n} hours × ${money(l.rate)}`;
    default: return l.units === 1 ? 'Salary' : `Salary × ${l.units}`;
  }
}

// Whether a line has anything to pay (no loads and no extra pay = nothing).
export const earns = (l: PayLine) => l.gross + l.items.filter((i) => i.kind !== 'Deduction').reduce((s, i) => s + i.amount, 0) > 0;

export const unitLabel = (b: PayBasis) => (b === 'Per mile' ? 'miles' : b === '% of line haul' ? 'line haul $' : b === 'Flat per load' ? 'loads' : b === 'Hourly' ? 'hours' : 'salary');

// — working out a line —

export interface DeliveredLoad {
  id: string;
  driver: string;
  delivered: string;
  miles: number;
  linehaul: number;
}

export function grossOf(basis: PayBasis, units: number, rate: number, frequency: PayFrequency): number {
  if (basis === '% of line haul') return round2((units * rate) / 100);
  if (basis === 'Salary') return round2((rate / PERIODS_PER_YEAR[frequency]) * units);
  return round2(units * rate);
}

// Recompute a line after its units or items change.
export function settle(line: PayLine, e: Pick<Employee, 'workerType' | 'withholdingPct'> | undefined, frequency: PayFrequency): PayLine {
  const gross = grossOf(line.basis, line.units, line.rate, frequency);
  const plus = line.items.filter((i) => i.kind !== 'Deduction').reduce((s, i) => s + i.amount, 0);
  const minus = line.items.filter((i) => i.kind === 'Deduction').reduce((s, i) => s + i.amount, 0);
  // Bonuses are taxed with pay; reimbursements are not.
  const taxable = gross + line.items.filter((i) => i.kind === 'Bonus').reduce((s, i) => s + i.amount, 0);
  const tax = e && e.workerType.startsWith('W-2') ? round2((taxable * e.withholdingPct) / 100) : 0;
  return { ...line, gross, tax, net: round2(gross + plus - minus - tax) };
}

// A person's line for a period: drivers from the loads they delivered.
export function lineFor(e: Employee, frequency: PayFrequency, start: string, end: string, loads: DeliveredLoad[]): PayLine {
  const mine = loads.filter((l) => l.driver === (e.driver || e.name) && l.delivered >= start && l.delivered <= end);
  const units = e.payBasis === 'Per mile' ? mine.reduce((s, l) => s + l.miles, 0)
    : e.payBasis === '% of line haul' ? mine.reduce((s, l) => s + l.linehaul, 0)
      : e.payBasis === 'Flat per load' ? mine.length
        : e.payBasis === 'Hourly' ? e.hoursPerPeriod : 1;
  const base: PayLine = {
    employeeId: e.id, name: e.name, role: e.role, basis: e.payBasis, units, rate: e.rate, gross: 0,
    items: e.recurring.map((i) => ({ ...i, id: `${i.id}-${start}` })), tax: 0, net: 0,
    loads: DRIVER_ROLES.includes(e.role) ? mine.map((l) => l.id) : [], hold: false, note: '',
  };
  return settle(base, e, frequency);
}

// — what has been paid —

export interface PaidSummary {
  gross: number;
  net: number;
  // The latest day they were paid (any year); '' if never.
  lastPaid: string;
}

// The year `ytdBefore` belongs to: as recorded, or (records from before it
// was recorded) the year the employee was added.
const beforeYear = (e: Employee) => e.ytdBeforeYear ?? Number(e.created.slice(0, 4));

// The day a line was paid: the run's pay date, or the day held pay was released.
export const paidDay = (r: PayRun, l: PayLine) => l.paidOn ?? r.payDate;

// What everyone was paid in a year, in one pass over the pay runs: paid runs
// only, held pay left out, plus what an employee was paid before RunTruck
// when that was in the same year.
export function paidSummary(payRuns: PayRun[], employees: Employee[], year: string): Map<string, PaidSummary> {
  const out = new Map<string, PaidSummary>();
  const at = (id: string) => {
    let s = out.get(id);
    if (!s) {
      s = { gross: 0, net: 0, lastPaid: '' };
      out.set(id, s);
    }
    return s;
  };
  for (const e of employees) if (e.ytdBefore && String(beforeYear(e)) === year) at(e.id).gross += e.ytdBefore;
  for (const r of payRuns) {
    if (r.status !== 'Paid') continue;
    for (const l of r.lines) {
      if (l.hold) continue;
      const day = paidDay(r, l);
      const s = at(l.employeeId);
      if (day > s.lastPaid) s.lastPaid = day;
      if (day.startsWith(year)) {
        s.gross = round2(s.gross + l.gross);
        s.net = round2(s.net + l.net);
      }
    }
  }
  return out;
}

// Year to date as a pay statement shows it: everything paid in the run's
// year up to its pay date, with the statement's own line counted whether or
// not the run is paid yet.
export function ytdAsOf(payRuns: PayRun[], e: Employee | undefined, run: PayRun, line: PayLine): { gross: number; net: number } {
  const year = run.payDate.slice(0, 4);
  let gross = e && e.ytdBefore && String(beforeYear(e)) === year ? e.ytdBefore : 0;
  let net = 0;
  for (const r of payRuns) {
    for (const l of r.lines) {
      if (l.employeeId !== line.employeeId) continue;
      const own = r.id === run.id;
      const day = paidDay(r, l);
      if (own || (r.status === 'Paid' && !l.hold && day.startsWith(year) && day <= run.payDate)) {
        gross += l.gross;
        net += l.net;
      }
    }
  }
  return { gross: round2(gross), net: round2(net) };
}

export const runTotals = (r: PayRun) => {
  const paid = r.lines.filter((l) => !l.hold);
  return {
    gross: round2(paid.reduce((s, l) => s + l.gross, 0)),
    deductions: round2(paid.reduce((s, l) => s + l.items.filter((i) => i.kind === 'Deduction').reduce((a, i) => a + i.amount, 0), 0)),
    additions: round2(paid.reduce((s, l) => s + l.items.filter((i) => i.kind !== 'Deduction').reduce((a, i) => a + i.amount, 0), 0)),
    tax: round2(paid.reduce((s, l) => s + l.tax, 0)),
    net: round2(paid.reduce((s, l) => s + l.net, 0)),
    held: r.lines.length - paid.length,
  };
};

export function nextRunId(list: PayRun[]): string {
  return `PR-${nextSerial('PR', list.map((r) => r.id), 1000)}`;
}
export function nextEmployeeId(list: Employee[]): string {
  return `EMP-${nextSerial('EMP', list.map((e) => e.id), 1000)}`;
}
export const itemId = () => `PI-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// — the employee form —

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const num = (v: FormValues, k: string) => Number(str(v, k).replace(/[$,%]/g, '')) || 0;

export function blankEmployeeForm(today: string): FormValues {
  return {
    name: '', role: 'Company driver', workerType: 'W-2 employee', email: '', phone: '', street: '', city: '', state: '', zip: '', hired: today,
    driver: '', payBasis: 'Per mile', rate: '', hoursPerPeriod: '80', frequency: 'Weekly', method: 'Direct deposit', bank: '', accountLast4: '',
    withholdingPct: '18', ytdBefore: '', emergencyContact: '', notes: '',
  };
}

export function employeeToForm(e: Employee): FormValues {
  return {
    name: e.name, role: e.role, workerType: e.workerType, email: e.email, phone: e.phone, street: e.street, city: e.city, state: e.state, zip: e.zip,
    hired: e.hired, driver: e.driver, payBasis: e.payBasis, rate: String(e.rate), hoursPerPeriod: String(e.hoursPerPeriod), frequency: e.frequency,
    method: e.method, bank: e.bank, accountLast4: e.accountLast4, withholdingPct: String(e.withholdingPct), ytdBefore: e.ytdBefore ? String(e.ytdBefore) : '',
    emergencyContact: e.emergencyContact, notes: e.notes,
  };
}

export function employeeFromForm(v: FormValues, id: string, recurring: PayItem[], documents: BillDocument[], by: string, prev?: Employee): Employee {
  const now = new Date().toISOString();
  const role = str(v, 'role');
  return {
    id, name: str(v, 'name'), role, workerType: str(v, 'workerType'), email: str(v, 'email'), phone: str(v, 'phone'),
    street: str(v, 'street'), city: str(v, 'city'), state: str(v, 'state').toUpperCase(), zip: str(v, 'zip'), hired: str(v, 'hired'),
    driver: DRIVER_ROLES.includes(role) ? str(v, 'driver') || str(v, 'name') : '',
    payBasis: str(v, 'payBasis') as PayBasis, rate: num(v, 'rate'), hoursPerPeriod: num(v, 'hoursPerPeriod') || 80,
    frequency: str(v, 'frequency') as PayFrequency, method: str(v, 'method'), bank: str(v, 'bank'), accountLast4: str(v, 'accountLast4'),
    withholdingPct: str(v, 'workerType').startsWith('W-2') ? num(v, 'withholdingPct') : 0, recurring, ytdBefore: num(v, 'ytdBefore'),
    // The year the "before RunTruck" figure is for: kept, unless the figure was changed (then it is for this year).
    ytdBeforeYear: prev && prev.ytdBefore === num(v, 'ytdBefore') ? prev.ytdBeforeYear ?? Number(prev.created.slice(0, 4)) : Number(todayIso().slice(0, 4)),
    emergencyContact: str(v, 'emergencyContact'), notes: str(v, 'notes'), documents,
    status: prev?.status ?? 'Active', log: prev ? prev.log : [{ at: now, by, action: 'Added', reason: 'Added to payroll' }],
    created: prev?.created ?? now, updated: prev ? now : undefined,
  };
}

export function reviveEmployees(raw: unknown): Employee[] | null {
  return reviveList<Employee>('employees', raw, (e) => typeof e.id === 'string' && typeof e.name === 'string' && Array.isArray(e.log), (e) => ({
    ...e, recurring: e.recurring ?? [], documents: e.documents ?? [], rate: Number(e.rate) || 0, ytdBefore: Number(e.ytdBefore) || 0,
  }));
}

export function reviveRuns(raw: unknown): PayRun[] | null {
  return reviveList<PayRun>('pay runs', raw, (r) => typeof r.id === 'string' && Array.isArray(r.lines) && typeof r.payDate === 'string', (r) => ({
    ...r, lines: r.lines.filter(Boolean).map((l) => ({ ...l, items: Array.isArray(l.items) ? l.items : [], loads: Array.isArray(l.loads) ? l.loads : [] })),
  }));
}

// — demo payroll (RunTruck's own workspace only) —

const made = (iso: string) => `${iso}T12:00:00.000Z`;
const item = (label: string, kind: ItemKind, amount: number): PayItem => ({ id: `PI-${label.replace(/\W/g, '').toLowerCase()}`, label, kind, amount });
const person = (p: Partial<Employee> & Pick<Employee, 'id' | 'name' | 'role' | 'payBasis' | 'rate' | 'frequency' | 'hired'>): Employee => ({
  workerType: 'W-2 employee', email: '', phone: '', street: '', city: 'Modesto', state: 'CA', zip: '95354', driver: '', hoursPerPeriod: 80,
  method: 'Direct deposit', bank: 'Valley Commerce Bank', accountLast4: '', withholdingPct: 18, recurring: [], ytdBefore: 0, emergencyContact: '',
  notes: '', documents: [], status: 'Active', created: made(shiftIso('2026-01-05')),
  log: [{ at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Added', reason: 'Imported into RunTruck' }],
  ...p,
});

const DEMO_EMPLOYEES = (): Employee[] => [
  person({ id: 'EMP-1001', name: 'Marcus Hale', role: 'Company driver', driver: 'Marcus Hale', payBasis: 'Per mile', rate: 0.62, frequency: 'Weekly', hired: '2022-03-14', email: 'marcus.hale@sunridgefreight.com', phone: '(209) 555-0141', accountLast4: '4410', recurring: [item('Escrow', 'Deduction', 50), item('Health insurance', 'Deduction', 45)], ytdBefore: 48200 }),
  person({ id: 'EMP-1002', name: 'Dara Whitfield', role: 'Company driver', driver: 'Dara Whitfield', payBasis: 'Per mile', rate: 0.6, frequency: 'Weekly', hired: '2021-08-02', email: 'dara.whitfield@sunridgefreight.com', phone: '(209) 555-0142', accountLast4: '7783', recurring: [item('Health insurance', 'Deduction', 45)], ytdBefore: 46100 }),
  person({ id: 'EMP-1003', name: 'Ellis Nakamura', role: 'Company driver', driver: 'Ellis Nakamura', payBasis: '% of line haul', rate: 25, frequency: 'Weekly', hired: '2023-10-01', phone: '(209) 555-0143', accountLast4: '2091', recurring: [item('Occupational accident insurance', 'Deduction', 32)], ytdBefore: 43800 }),
  person({ id: 'EMP-1004', name: 'Priya Raman', role: 'Company driver', driver: 'Priya Raman', payBasis: 'Per mile', rate: 0.58, frequency: 'Weekly', hired: '2024-09-20', phone: '(209) 555-0144', accountLast4: '5530', ytdBefore: 40900 }),
  person({ id: 'EMP-1005', name: 'Ana Cortez', role: 'Company driver', driver: 'Ana Cortez', payBasis: 'Per mile', rate: 0.58, frequency: 'Weekly', hired: '2026-01-12', phone: '(209) 555-0145', method: 'Pay card', accountLast4: '0917', ytdBefore: 31200 }),
  person({ id: 'EMP-1006', name: 'Tobias Frey', role: 'Lease-purchase driver', workerType: '1099 contractor', driver: 'Tobias Frey', payBasis: '% of line haul', rate: 72, frequency: 'Weekly', hired: '2023-11-15', phone: '(209) 555-0146', accountLast4: '3348', withholdingPct: 0, recurring: [item('Truck lease payment', 'Deduction', 450), item('Occupational accident insurance', 'Deduction', 38), item('ELD fee', 'Deduction', 25), item('Escrow', 'Deduction', 100)], ytdBefore: 98400 }),
  person({ id: 'EMP-1007', name: 'Jamal Reed', role: 'Company driver', driver: 'Jamal Reed', payBasis: 'Per mile', rate: 0.56, frequency: 'Weekly', hired: shiftIso('2026-09-08'), phone: '(209) 555-0147', method: 'Check', notes: 'In orientation; first loads next week.' }),
  person({ id: 'EMP-1008', name: 'Rosa Medina', role: 'Dispatcher', payBasis: 'Salary', rate: 68000, frequency: 'Every 2 weeks', hired: '2020-06-06', email: 'rosa.medina@sunridgefreight.com', accountLast4: '6621', withholdingPct: 20, recurring: [item('Health insurance', 'Deduction', 110), item('401(k)', 'Deduction', 130)], ytdBefore: 47100 }),
  person({ id: 'EMP-1009', name: 'Evan Brooks', role: 'Dispatcher', payBasis: 'Salary', rate: 52000, frequency: 'Every 2 weeks', hired: shiftIso('2026-07-27'), email: 'evan.brooks@sunridgefreight.com', accountLast4: '1185', ytdBefore: 7900 }),
  person({ id: 'EMP-1010', name: 'Luis Ortega', role: 'Mechanic', payBasis: 'Hourly', rate: 34.5, hoursPerPeriod: 80, frequency: 'Every 2 weeks', hired: '2023-02-09', accountLast4: '9054', recurring: [item('Tool allowance', 'Reimbursement', 40)], ytdBefore: 51800 }),
  person({ id: 'EMP-1011', name: 'Grace Whitman', role: 'Accounting', payBasis: 'Salary', rate: 61000, frequency: 'Every 2 weeks', hired: '2024-04-15', email: 'grace.whitman@sunridgefreight.com', accountLast4: '2276', withholdingPct: 20, ytdBefore: 42300 }),
  person({ id: 'EMP-1012', name: 'Daniel Soto', role: 'Safety & compliance', payBasis: 'Salary', rate: 58000, frequency: 'Every 2 weeks', hired: '2025-01-06', email: 'daniel.soto@sunridgefreight.com', accountLast4: '8840', ytdBefore: 40200 }),
  person({
    id: 'EMP-1013', name: 'Carl Jensen', role: 'Company driver', driver: 'Carl Jensen', payBasis: 'Per mile', rate: 0.57, frequency: 'Weekly', hired: '2022-05-02', accountLast4: '6003', ytdBefore: 28700, status: 'Archived',
    log: [
      { at: made(shiftIso('2026-01-05')), by: 'Rosa Medina', action: 'Added', reason: 'Imported into RunTruck' },
      { at: made(shiftIso('2026-07-17')), by: 'Rosa Medina', action: 'Archived', reason: 'Resigned · Moved to a local carrier closer to home.' },
    ],
  }),
];

// Last week's driver run (paid), from the settlements on file.
const paidLine = (e: Employee, units: number, items: PayItem[], loads: string[]): PayLine => settle({ employeeId: e.id, name: e.name, role: e.role, basis: e.payBasis, units, rate: e.rate, gross: 0, items, tax: 0, net: 0, loads, hold: false, note: '' }, e, e.frequency);

const DEMO_RUNS = (people: Employee[]): PayRun[] => {
  const by = (id: string) => people.find((p) => p.id === id) as Employee;
  const week = defaultPeriod('Weekly', addDays(todayIso(), -7));
  const twoWeeks = defaultPeriod('Every 2 weeks', addDays(todayIso(), -7));
  const drivers: PayLine[] = [
    paidLine(by('EMP-1001'), 2140, [item('Escrow', 'Deduction', 50), item('Health insurance', 'Deduction', 45), item('Detention', 'Bonus', 75)], ['L-40199', 'L-40202']),
    paidLine(by('EMP-1002'), 1980, [item('Health insurance', 'Deduction', 45)], ['L-40200', 'L-40204']),
    paidLine(by('EMP-1003'), 5820, [item('Occupational accident insurance', 'Deduction', 32), item('Fuel advance', 'Deduction', 150)], ['L-40201', 'L-40205']),
    paidLine(by('EMP-1004'), 1420, [item('Lumper reimbursement', 'Reimbursement', 120)], ['L-40203']),
    paidLine(by('EMP-1005'), 1180, [], ['L-40206']),
    paidLine(by('EMP-1006'), 4410, [item('Truck lease payment', 'Deduction', 450), item('Occupational accident insurance', 'Deduction', 38), item('ELD fee', 'Deduction', 25), item('Escrow', 'Deduction', 100)], ['L-40199']),
  ];
  const office: PayLine[] = ['EMP-1008', 'EMP-1009', 'EMP-1010', 'EMP-1011', 'EMP-1012'].map((id) => {
    const e = by(id);
    return paidLine(e, e.payBasis === 'Hourly' ? 82 : 1, e.recurring.map((i) => ({ ...i })), []);
  });
  const paidAt = (iso: string) => made(iso);
  return [
    { id: 'PR-1001', start: twoWeeks.start, end: twoWeeks.end, payDate: twoWeeks.payDate, frequency: 'Every 2 weeks', status: 'Paid', lines: office, created: paidAt(addDays(twoWeeks.end, 1)), createdBy: 'Grace Whitman', approvedAt: paidAt(addDays(twoWeeks.end, 2)), approvedBy: 'Rosa Medina', paidAt: paidAt(twoWeeks.payDate), paidBy: 'Grace Whitman' },
    { id: 'PR-1002', start: week.start, end: week.end, payDate: week.payDate, frequency: 'Weekly', status: 'Paid', lines: drivers, created: paidAt(addDays(week.end, 1)), createdBy: 'Grace Whitman', approvedAt: paidAt(addDays(week.end, 2)), approvedBy: 'Rosa Medina', paidAt: paidAt(week.payDate), paidBy: 'Grace Whitman' },
  ];
};

export const EMPLOYEE_SEED: Employee[] = !IS_DEMO ? [] : DEMO_EMPLOYEES();
export const PAYRUN_SEED: PayRun[] = !IS_DEMO ? [] : DEMO_RUNS(EMPLOYEE_SEED);

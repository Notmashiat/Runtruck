// Safety (release 1.8): maintenance work orders, driver qualification file
// updates and requests, roadside inspections and violations, and cargo and
// accident claims. Stored per company (runtruck-<id>-workorders,
// -violations, -claims, -docrequests, -driverfiles).
import { nextSerial } from '../lib/ids';
import { reviveList } from '../lib/persist';
import { IS_DEMO } from '../lib/account';
import { shiftIso, todayIso } from '../lib/clock';
import type { BillDocument } from './bills';
import type { FormValues } from './fleet';
import { addDays } from './payroll';

export interface SafetyLog {
  at: string;
  by: string;
  action: string;
  note: string;
}

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const num = (v: FormValues, k: string) => Number(str(v, k).replace(/[$,]/g, '')) || 0;
const made = (iso: string) => `${iso}T12:00:00.000Z`;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const nextNum = (prefix: string, ids: string[], start = 1000) => `${prefix}-${nextSerial(prefix, ids, start)}`;
const logNow = (by: string, action: string, note = ''): SafetyLog => ({ at: new Date().toISOString(), by, action, note });

// — maintenance —

export const SERVICE_TYPES = [
  'Preventive maintenance (PM A)', 'Preventive maintenance (PM B)', 'DOT annual inspection', 'Repair', 'Brakes', 'Tires',
  'Engine / aftertreatment', 'Electrical / lights', 'Reefer unit service', 'Trailer service', 'Recall / warranty', 'Roadside breakdown', 'Body / damage',
];
export const PRIORITIES = ['Routine', 'Soon', 'Urgent', 'Out of service'];
export const WO_SOURCES = ['PM schedule', 'Driver vehicle inspection report (DVIR)', 'Roadside inspection', 'Driver report', 'Breakdown', 'Recall notice', 'Other'];
export type WorkOrderStatus = 'Scheduled' | 'In shop' | 'Waiting on parts' | 'Done' | 'Cancelled';
export type WorkOrderState = 'Overdue' | 'Due soon' | 'Scheduled' | 'In shop' | 'Waiting on parts' | 'Done' | 'Cancelled';
export const WO_STATES: WorkOrderState[] = ['Overdue', 'Due soon', 'In shop', 'Waiting on parts', 'Scheduled', 'Done', 'Cancelled'];
export const WO_TAG: Record<WorkOrderState, string> = {
  Overdue: 'tag-outline', 'Due soon': 'tag-outline', Scheduled: 'tag-accent', 'In shop': 'tag-accent', 'Waiting on parts': 'tag-outline', Done: 'tag-green', Cancelled: 'tag-neutral',
};

export interface WorkOrderCompletion {
  date: string;
  odometer: number;
  parts: number;
  labor: number;
  invoice: string;
  notes: string;
}

export interface WorkOrder {
  id: string;
  unit: string;
  unitKind: 'Truck' | 'Trailer';
  type: string;
  description: string;
  priority: string;
  source: string;
  dueDate: string;
  dueOdometer: number;
  shop: string;
  estimate: number;
  driver: string;
  outOfService: boolean;
  repeatDays: number;
  repeatMiles: number;
  status: WorkOrderStatus;
  completed?: WorkOrderCompletion;
  billId: string;
  violationId: string;
  documents: BillDocument[];
  notes: string;
  log: SafetyLog[];
  created: string;
  updated?: string;
}

export const woCost = (w: WorkOrder) => (w.completed ? w.completed.parts + w.completed.labor : w.estimate);

export function woState(w: WorkOrder, odometer: number | undefined, today = todayIso()): WorkOrderState {
  if (w.status === 'Done' || w.status === 'Cancelled' || w.status === 'In shop' || w.status === 'Waiting on parts') return w.status;
  const byDate = w.dueDate ? daysBetween(today, w.dueDate) : Infinity;
  const byMiles = w.dueOdometer && odometer ? w.dueOdometer - odometer : Infinity;
  if (byDate < 0 || byMiles < 0) return 'Overdue';
  if (byDate <= 14 || byMiles <= 1000) return 'Due soon';
  return 'Scheduled';
}

export const nextWorkOrderId = (list: { id: string }[]) => nextNum('WO', list.map((w) => w.id));

// The usual repeat for a service type (days, miles).
export function repeatFor(type: string, unitKind: string): { days: number; miles: number } {
  if (type === 'DOT annual inspection') return { days: 365, miles: 0 };
  if (type.startsWith('Preventive maintenance (PM A)')) return { days: 0, miles: unitKind === 'Truck' ? 25000 : 0 };
  if (type.startsWith('Preventive maintenance (PM B)')) return { days: 0, miles: unitKind === 'Truck' ? 50000 : 0 };
  if (type === 'Reefer unit service') return { days: 180, miles: 0 };
  if (type === 'Trailer service') return { days: 180, miles: 0 };
  return { days: 0, miles: 0 };
}

export function blankWorkOrderForm(today: string, prefill: FormValues = {}): FormValues {
  return {
    unit: '', type: 'Repair', description: '', priority: 'Routine', source: 'Driver report', dueDate: addDays(today, 7), dueOdometer: '',
    shop: '', estimate: '', driver: '', outOfService: 'No', repeatDays: '', repeatMiles: '', notes: '', ...prefill,
  };
}

export function workOrderToForm(w: WorkOrder): FormValues {
  const n = (x: number) => (x ? String(x) : '');
  return {
    unit: w.unit, type: w.type, description: w.description, priority: w.priority, source: w.source, dueDate: w.dueDate, dueOdometer: n(w.dueOdometer),
    shop: w.shop, estimate: n(w.estimate), driver: w.driver, outOfService: w.outOfService ? 'Yes' : 'No', repeatDays: n(w.repeatDays), repeatMiles: n(w.repeatMiles), notes: w.notes,
  };
}

export function workOrderFromForm(v: FormValues, id: string, unitKind: 'Truck' | 'Trailer', documents: BillDocument[], by: string, prev?: WorkOrder, extra: Partial<WorkOrder> = {}): WorkOrder {
  const now = new Date().toISOString();
  return {
    id, unit: str(v, 'unit'), unitKind, type: str(v, 'type'), description: str(v, 'description'), priority: str(v, 'priority'), source: str(v, 'source'),
    dueDate: str(v, 'dueDate'), dueOdometer: num(v, 'dueOdometer'), shop: str(v, 'shop'), estimate: num(v, 'estimate'), driver: str(v, 'driver'),
    outOfService: str(v, 'outOfService') === 'Yes' || str(v, 'priority') === 'Out of service', repeatDays: num(v, 'repeatDays'), repeatMiles: num(v, 'repeatMiles'),
    status: prev?.status ?? 'Scheduled', completed: prev?.completed, billId: prev?.billId ?? '', violationId: prev?.violationId ?? '',
    documents, notes: str(v, 'notes'),
    log: prev ? [...prev.log, logNow(by, 'Edited')] : [logNow(by, 'Opened', str(v, 'source'))],
    created: prev?.created ?? now, updated: prev ? now : undefined,
    ...extra,
  };
}

// — driver qualification file —

// Which field on the driver record each document lives in, and whether the date is an expiry or when it was done.
export const DOC_FIELDS: Record<string, { key: string; kind: 'expires' | 'done'; rule: string }> = {
  CDL: { key: 'cdlExpiry', kind: 'expires', rule: '49 CFR 391.11' },
  'Medical card': { key: 'medicalExpiry', kind: 'expires', rule: '49 CFR 391.41–391.45' },
  'Hazmat endorsement': { key: 'hazmatExpiry', kind: 'expires', rule: '49 CFR 383.141' },
  'TWIC card': { key: 'twicExpiry', kind: 'expires', rule: '49 CFR 1572' },
  'MVR review': { key: 'mvrDate', kind: 'done', rule: '49 CFR 391.25 · every 12 months' },
  'Annual review': { key: 'annualReviewDate', kind: 'done', rule: '49 CFR 391.25 · every 12 months' },
  'Clearinghouse query': { key: 'clearinghouseDate', kind: 'done', rule: '49 CFR 382.701 · every 12 months' },
  'Pre-employment drug test': { key: 'drugTestDate', kind: 'done', rule: '49 CFR 382.301' },
};
export const DOC_NAMES = Object.keys(DOC_FIELDS);

export interface DriverFile {
  // `${driverId}|${document}`
  id: string;
  driverId: string;
  document: string;
  files: BillDocument[];
  history: SafetyLog[];
}

export type RequestStatus = 'Requested' | 'Received' | 'Cancelled';
export interface DocRequest {
  id: string;
  driverId: string;
  driver: string;
  documents: string[];
  due: string;
  via: string;
  message: string;
  status: RequestStatus;
  doneOn: string;
  created: string;
  by: string;
}
export const REQUEST_VIA = ['Email', 'Text message', 'Driver app', 'In person'];
export const nextRequestId = (list: { id: string }[]) => nextNum('DR', list.map((r) => r.id));

// — roadside inspections and violations —

export const BASICS = [
  'Unsafe Driving', 'Hours-of-Service Compliance', 'Vehicle Maintenance', 'Controlled Substances / Alcohol', 'Hazardous Materials Compliance',
  'Driver Fitness', 'Crash Indicator',
];
export const CLEAN = 'No violations (clean inspection)';
export const INSPECTION_LEVELS = [
  'Level I · Full inspection', 'Level II · Walk-around', 'Level III · Driver only', 'Level IV · Special', 'Level V · Vehicle only', 'Level VI · Radioactive',
];
export const RESOLUTIONS = ['Corrected', 'Removed through DataQs', 'Upheld', 'Fine paid', 'Dismissed in court', 'Other'];
export type ViolationStatus = 'Open' | 'Contested' | 'Closed';
export const VIOLATION_TAG: Record<ViolationStatus | 'Clean', string> = { Open: 'tag-outline', Contested: 'tag-accent', Closed: 'tag-neutral', Clean: 'tag-green' };

export interface ViolationRecord {
  id: string;
  date: string;
  driver: string;
  truck: string;
  trailer: string;
  state: string;
  location: string;
  reportNumber: string;
  level: string;
  basic: string;
  code: string;
  description: string;
  severity: number;
  oos: boolean;
  fine: number;
  finePaidBy: string;
  status: ViolationStatus;
  dataQs: string;
  resolution: string;
  coached: string;
  workOrderId: string;
  documents: BillDocument[];
  notes: string;
  log: SafetyLog[];
  created: string;
  updated?: string;
}

export const isClean = (v: Pick<ViolationRecord, 'basic'>) => v.basic === CLEAN;
// CSA-style time weight: 3 in the last 6 months, 2 at 6–12 months, 1 at 12–24 months.
export function timeWeight(date: string, today = todayIso()): number {
  const days = daysBetween(date, today);
  return days < 0 ? 3 : days <= 182 ? 3 : days <= 365 ? 2 : days <= 730 ? 1 : 0;
}
// Severity with the out-of-service bump (+2), times the time weight.
export const weightedPoints = (v: ViolationRecord, today = todayIso()) => (isClean(v) ? 0 : (Math.min(10, v.severity) + (v.oos ? 2 : 0)) * timeWeight(v.date, today));
export const nextViolationId = (list: { id: string }[]) => nextNum('INS', list.map((v) => v.id));

export function blankViolationForm(today: string, prefill: FormValues = {}): FormValues {
  return {
    date: today, driver: '', truck: '', trailer: '', state: '', location: '', reportNumber: '', level: INSPECTION_LEVELS[1],
    basic: 'Vehicle Maintenance', code: '', description: '', severity: '', oos: 'No', fine: '', finePaidBy: 'Company', notes: '', ...prefill,
  };
}
export function violationToForm(v: ViolationRecord): FormValues {
  return {
    date: v.date, driver: v.driver, truck: v.truck, trailer: v.trailer, state: v.state, location: v.location, reportNumber: v.reportNumber, level: v.level,
    basic: v.basic, code: v.code, description: v.description, severity: v.severity ? String(v.severity) : '', oos: v.oos ? 'Yes' : 'No',
    fine: v.fine ? String(v.fine) : '', finePaidBy: v.finePaidBy, notes: v.notes,
  };
}
export function violationFromForm(v: FormValues, id: string, documents: BillDocument[], by: string, prev?: ViolationRecord): ViolationRecord {
  const now = new Date().toISOString();
  const clean = str(v, 'basic') === CLEAN;
  return {
    id, date: str(v, 'date'), driver: str(v, 'driver'), truck: str(v, 'truck'), trailer: str(v, 'trailer'), state: str(v, 'state').toUpperCase(), location: str(v, 'location'),
    reportNumber: str(v, 'reportNumber'), level: str(v, 'level'), basic: str(v, 'basic'), code: clean ? '' : str(v, 'code'), description: clean ? '' : str(v, 'description'),
    severity: clean ? 0 : Math.min(10, num(v, 'severity')), oos: !clean && str(v, 'oos') === 'Yes', fine: clean ? 0 : num(v, 'fine'), finePaidBy: str(v, 'finePaidBy'),
    status: clean ? 'Closed' : prev?.status ?? 'Open', dataQs: prev?.dataQs ?? '', resolution: clean ? 'Clean inspection' : prev?.resolution ?? '', coached: prev?.coached ?? '',
    workOrderId: prev?.workOrderId ?? '', documents, notes: str(v, 'notes'),
    log: prev ? [...prev.log, logNow(by, 'Edited')] : [logNow(by, clean ? 'Clean inspection logged' : 'Logged', [str(v, 'level'), str(v, 'reportNumber')].filter(Boolean).join(' · '))],
    created: prev?.created ?? now, updated: prev ? now : undefined,
  };
}

// — claims —

export const CLAIM_TYPES = ['Cargo damage', 'Cargo shortage', 'Cargo theft', 'Temperature / spoilage', 'Accident · property damage', 'Accident · bodily injury', 'Own equipment damage', 'Workers’ comp'];
export type ClaimStatus = 'Open' | 'Under review' | 'Settled' | 'Denied' | 'Withdrawn';
export const CLAIM_STATUSES: ClaimStatus[] = ['Open', 'Under review', 'Settled', 'Denied', 'Withdrawn'];
export const CLAIM_TAG: Record<ClaimStatus, string> = { Open: 'tag-outline', 'Under review': 'tag-accent', Settled: 'tag-green', Denied: 'tag-neutral', Withdrawn: 'tag-neutral' };
export const PAID_BY = ['Insurance', 'Company', 'Driver deduction'];
export const isCargo = (type: string) => type.startsWith('Cargo') || type.startsWith('Temperature');
export const isAccident = (type: string) => type.startsWith('Accident');

export interface ClaimPayment {
  date: string;
  amount: number;
  by: string;
  reference: string;
}

export interface ClaimRecord {
  id: string;
  type: string;
  incidentDate: string;
  received: string;
  load: string;
  driver: string;
  truck: string;
  trailer: string;
  location: string;
  claimant: string;
  claimantContact: string;
  claimantEmail: string;
  amountClaimed: number;
  reserve: number;
  insurer: string;
  policyNumber: string;
  insurerClaimNo: string;
  deductible: number;
  // DOT accident register (49 CFR 390.15): a fatality, an injury treated away from the scene, or a tow-away.
  fatality: boolean;
  injuryTreated: boolean;
  towAway: boolean;
  hazmatRelease: boolean;
  policeReport: string;
  citation: string;
  preventable: string;
  description: string;
  status: ClaimStatus;
  acknowledgedOn: string;
  payments: ClaimPayment[];
  recovered: number;
  closedOn: string;
  closedReason: string;
  documents: BillDocument[];
  notes: string;
  log: SafetyLog[];
  created: string;
  updated?: string;
}

export const recordable = (c: Pick<ClaimRecord, 'type' | 'fatality' | 'injuryTreated' | 'towAway'>) => isAccident(c.type) && (c.fatality || c.injuryTreated || c.towAway);
export const paidOf = (c: ClaimRecord, by?: string) => c.payments.filter((p) => !by || p.by === by).reduce((s, p) => s + p.amount, 0);
// What it cost the company: what the company paid, less what came back.
export const netCost = (c: ClaimRecord) => paidOf(c, 'Company') - c.recovered;

// Cargo claims (49 CFR 370.5, 370.9): acknowledge within 30 days of receipt; pay, decline or offer within 120 days.
export function cargoDeadlines(c: ClaimRecord, today = todayIso()): { ack?: { due: string; late: boolean }; resolve?: { due: string; late: boolean } } {
  if (!isCargo(c.type) || !c.received) return {};
  const open = c.status === 'Open' || c.status === 'Under review';
  const ackDue = addDays(c.received, 30);
  const resolveDue = addDays(c.received, 120);
  return {
    ack: !c.acknowledgedOn && open ? { due: ackDue, late: today > ackDue } : undefined,
    resolve: open ? { due: resolveDue, late: today > resolveDue } : undefined,
  };
}

export const nextClaimId = (list: { id: string }[]) => nextNum('CLM', list.map((c) => c.id), 1100);

export function blankClaimForm(today: string, prefill: FormValues = {}): FormValues {
  return {
    type: 'Cargo damage', incidentDate: today, received: today, load: '', driver: '', truck: '', trailer: '', location: '',
    claimant: '', claimantContact: '', claimantEmail: '', amountClaimed: '', reserve: '', insurer: '', policyNumber: '', insurerClaimNo: '', deductible: '',
    harm: [], policeReport: '', citation: '', preventable: 'Under review', description: '', notes: '', ...prefill,
  };
}
export const HARM = ['Fatality', 'Injury treated away from the scene', 'Vehicle towed away', 'Hazmat released'];
export function claimToForm(c: ClaimRecord): FormValues {
  const n = (x: number) => (x ? String(x) : '');
  return {
    type: c.type, incidentDate: c.incidentDate, received: c.received, load: c.load, driver: c.driver, truck: c.truck, trailer: c.trailer, location: c.location,
    claimant: c.claimant, claimantContact: c.claimantContact, claimantEmail: c.claimantEmail, amountClaimed: n(c.amountClaimed), reserve: n(c.reserve),
    insurer: c.insurer, policyNumber: c.policyNumber, insurerClaimNo: c.insurerClaimNo, deductible: n(c.deductible),
    harm: [c.fatality && HARM[0], c.injuryTreated && HARM[1], c.towAway && HARM[2], c.hazmatRelease && HARM[3]].filter(Boolean) as string[],
    policeReport: c.policeReport, citation: c.citation, preventable: c.preventable, description: c.description, notes: c.notes,
  };
}
export function claimFromForm(v: FormValues, id: string, documents: BillDocument[], by: string, prev?: ClaimRecord): ClaimRecord {
  const now = new Date().toISOString();
  const harm = Array.isArray(v.harm) ? (v.harm as string[]) : [];
  const accident = isAccident(str(v, 'type'));
  return {
    id, type: str(v, 'type'), incidentDate: str(v, 'incidentDate'), received: str(v, 'received'), load: str(v, 'load'), driver: str(v, 'driver'),
    truck: str(v, 'truck'), trailer: str(v, 'trailer'), location: str(v, 'location'), claimant: str(v, 'claimant'), claimantContact: str(v, 'claimantContact'),
    claimantEmail: str(v, 'claimantEmail'), amountClaimed: num(v, 'amountClaimed'), reserve: num(v, 'reserve'), insurer: str(v, 'insurer'),
    policyNumber: str(v, 'policyNumber'), insurerClaimNo: str(v, 'insurerClaimNo'), deductible: num(v, 'deductible'),
    fatality: accident && harm.includes(HARM[0]), injuryTreated: accident && harm.includes(HARM[1]), towAway: accident && harm.includes(HARM[2]), hazmatRelease: accident && harm.includes(HARM[3]),
    policeReport: accident ? str(v, 'policeReport') : '', citation: accident ? str(v, 'citation') : '', preventable: str(v, 'preventable'),
    description: str(v, 'description'), status: prev?.status ?? 'Open', acknowledgedOn: prev?.acknowledgedOn ?? '', payments: prev?.payments ?? [],
    recovered: prev?.recovered ?? 0, closedOn: prev?.closedOn ?? '', closedReason: prev?.closedReason ?? '', documents, notes: str(v, 'notes'),
    log: prev ? [...prev.log, logNow(by, 'Edited')] : [logNow(by, 'Opened', `${str(v, 'type')}${str(v, 'claimant') ? ` · ${str(v, 'claimant')}` : ''}`)],
    created: prev?.created ?? now, updated: prev ? now : undefined,
  };
}

// — revivers —

// One record at a time (lib/persist.ts): a damaged record is set aside, the rest are kept.
export const reviveWorkOrders = (raw: unknown) =>
  reviveList<WorkOrder>('work orders', raw, (x) => typeof x.id === 'string' && typeof x.unit === 'string', (w) => ({ ...w, documents: w.documents ?? [], log: w.log ?? [] }));
export const reviveViolations = (raw: unknown) =>
  reviveList<ViolationRecord>('violations', raw, (x) => typeof x.id === 'string' && typeof x.basic === 'string' && typeof x.date === 'string', (v) => ({ ...v, documents: v.documents ?? [], log: v.log ?? [] }));
export const reviveClaims = (raw: unknown) =>
  reviveList<ClaimRecord>('claims', raw, (x) => typeof x.id === 'string' && Array.isArray(x.payments), (c) => ({ ...c, documents: c.documents ?? [], log: c.log ?? [] }));
export const reviveRequests = (raw: unknown) => reviveList<DocRequest>('document requests', raw, (x) => typeof x.id === 'string' && Array.isArray(x.documents));
export const reviveDriverFiles = (raw: unknown) =>
  reviveList<DriverFile>('driver files', raw, (x) => typeof x.id === 'string' && Array.isArray(x.files), (f) => ({ ...f, history: f.history ?? [] }));

// — demo records (RunTruck's own workspace only) —

const d = (iso: string) => shiftIso(iso);
const sys = (iso: string, action: string, note = '', by = 'Daniel Soto'): SafetyLog => ({ at: made(iso), by, action, note });

const wo = (p: Partial<WorkOrder> & Pick<WorkOrder, 'id' | 'unit' | 'type' | 'description' | 'shop' | 'estimate'>): WorkOrder => ({
  unitKind: /^T-/.test(p.unit) ? 'Truck' : 'Trailer', priority: 'Routine', source: 'PM schedule', dueDate: '', dueOdometer: 0, driver: '', outOfService: false,
  repeatDays: 0, repeatMiles: 0, status: 'Scheduled', billId: '', violationId: '', documents: [], notes: '', created: made(addDays(todayIso(), -10)),
  log: [sys(addDays(todayIso(), -10), 'Opened', p.source ?? 'PM schedule')], ...p,
});

const DEMO_WORK_ORDERS = (): WorkOrder[] => {
  const t = todayIso();
  return [
    wo({ id: 'WO-1001', unit: 'T-118', type: 'Engine / aftertreatment', description: 'Turbocharger replacement — loss of boost, check engine light', priority: 'Out of service', source: 'Breakdown', dueDate: addDays(t, 2), shop: 'Sunridge shop · Modesto', estimate: 4850, driver: 'Tobias Frey', outOfService: true, status: 'Waiting on parts', notes: 'Turbo on back order from the dealer; ETA two days.', log: [sys(addDays(t, -4), 'Opened', 'Breakdown'), sys(addDays(t, -3), 'In shop'), sys(addDays(t, -2), 'Waiting on parts', 'Turbo back-ordered')] }),
    wo({ id: 'WO-1002', unit: 'FB-12', type: 'DOT annual inspection', description: 'Annual inspection (49 CFR 396.17) — expires this week', dueDate: addDays(t, 1), shop: 'Sunridge shop · Modesto', estimate: 150, repeatDays: 365, status: 'In shop', log: [sys(addDays(t, -7), 'Opened', 'PM schedule'), sys(addDays(t, -1), 'In shop')] }),
    wo({ id: 'WO-1003', unit: 'T-121', type: 'Brakes', description: 'Brake out of adjustment — axle 2 right (from roadside inspection INS-1002)', priority: 'Urgent', source: 'Roadside inspection', dueDate: addDays(t, -3), shop: 'Sunridge shop · Modesto', estimate: 420, driver: 'Ellis Nakamura', violationId: 'INS-1002' }),
    wo({ id: 'WO-1004', unit: 'T-114', type: 'Preventive maintenance (PM A)', description: 'PM A: oil and filters, grease, brake and tire check', dueOdometer: 529800, shop: 'Sunridge shop · Modesto', estimate: 640, repeatMiles: 25000 }),
    wo({ id: 'WO-1005', unit: 'RF-27', type: 'Reefer unit service', description: 'Thermo King 6,000-hour service and download', dueDate: addDays(t, 10), shop: 'Thermo King · Fresno', estimate: 710, repeatDays: 180 }),
    wo({ id: 'WO-1006', unit: 'T-107', type: 'DOT annual inspection', description: 'Annual inspection (49 CFR 396.17)', dueDate: addDays(t, 16), shop: 'Valley Truck Center · Stockton', estimate: 185, repeatDays: 365 }),
    wo({ id: 'WO-1007', unit: 'T-103', type: 'Tires', description: 'Rotate steers, replace two drive tires at 4/32"', source: 'Driver vehicle inspection report (DVIR)', dueOdometer: 342000, shop: 'Sunridge shop · Modesto', estimate: 1260, driver: 'Priya Raman' }),
    wo({
      id: 'WO-1000', unit: 'T-109', type: 'DOT annual inspection', description: 'Annual inspection (49 CFR 396.17)', dueDate: addDays(t, -12), shop: 'Valley Truck Center · Stockton', estimate: 185, repeatDays: 365,
      status: 'Done', completed: { date: addDays(t, -12), odometer: 141220, parts: 0, labor: 185, invoice: 'VTC-55821', notes: 'Passed. Decal applied.' },
      log: [sys(addDays(t, -20), 'Opened', 'PM schedule'), sys(addDays(t, -12), 'Completed', '$185.00 · VTC-55821')],
    }),
    wo({
      id: 'WO-0999', unit: 'T-107', type: 'Electrical / lights', description: 'Replace left rear clearance lamp and pigtail (from INS-1004)', source: 'Roadside inspection', shop: 'Sunridge shop · Modesto', estimate: 90, violationId: 'INS-1004',
      status: 'Done', completed: { date: d('2026-07-31'), odometer: 398400, parts: 38, labor: 55, invoice: '', notes: 'Lamp and pigtail replaced.' },
      created: made(d('2026-07-30')), log: [sys(d('2026-07-30'), 'Opened', 'Roadside inspection'), sys(d('2026-07-31'), 'Completed', '$93.00')],
    }),
  ];
};

const vio = (p: Partial<ViolationRecord> & Pick<ViolationRecord, 'id' | 'date' | 'driver' | 'truck' | 'basic'>): ViolationRecord => ({
  trailer: '', state: '', location: '', reportNumber: '', level: INSPECTION_LEVELS[1], code: '', description: '', severity: 0, oos: false, fine: 0, finePaidBy: 'Company',
  status: 'Open', dataQs: '', resolution: '', coached: '', workOrderId: '', documents: [], notes: '', created: made(p.date), log: [sys(p.date, 'Logged', p.reportNumber ?? '')], ...p,
});

const DEMO_VIOLATIONS = (): ViolationRecord[] => [
  vio({ id: 'INS-1001', date: d('2026-08-31'), driver: 'Tobias Frey', truck: 'T-118', trailer: 'DV-14', state: 'CO', location: 'I-70 port of entry · Loma', reportNumber: 'CO0LOMA26083', level: INSPECTION_LEVELS[2], basic: 'Hours-of-Service Compliance', code: '395.8(e)', description: 'False report of driver’s record of duty status', severity: 1, notes: 'Log edit not annotated.' }),
  vio({ id: 'INS-1002', date: d('2026-08-28'), driver: 'Ellis Nakamura', truck: 'T-121', trailer: 'FB-12', state: 'CA', location: 'I-5 scale · Cottonwood', reportNumber: 'CAHP26082811', level: INSPECTION_LEVELS[0], basic: 'Vehicle Maintenance', code: '393.47(e)', description: 'Clamp or roto-chamber type brake(s) out of adjustment', severity: 4, workOrderId: 'WO-1003' }),
  vio({ id: 'INS-1003', date: d('2026-08-19'), driver: 'Marcus Hale', truck: 'T-114', state: 'NV', location: 'US-95 port of entry · Winnemucca', reportNumber: 'NV26081904', level: INSPECTION_LEVELS[2], basic: 'Hours-of-Service Compliance', code: '395.3(a)(2)', description: 'Driving beyond the 14-hour duty period', severity: 7, oos: true, status: 'Contested', dataQs: 'RDR-2026-114882', notes: 'ELD shows personal conveyance; challenged with the ELD log and dispatch record.', log: [sys(d('2026-08-19'), 'Logged'), sys(d('2026-08-22'), 'Contested', 'DataQs RDR-2026-114882')] }),
  vio({ id: 'INS-1004', date: d('2026-07-30'), driver: 'Dara Whitfield', truck: 'T-107', trailer: 'DV-51', state: 'CA', location: 'I-80 scale · Truckee', reportNumber: 'CAHP26073007', level: INSPECTION_LEVELS[1], basic: 'Vehicle Maintenance', code: '393.9', description: 'Inoperative required lamp', severity: 6, status: 'Closed', resolution: 'Corrected', workOrderId: 'WO-0999', log: [sys(d('2026-07-30'), 'Logged'), sys(d('2026-07-31'), 'Closed', 'Corrected · WO-0999')] }),
  vio({ id: 'INS-1005', date: d('2026-07-12'), driver: 'Priya Raman', truck: 'T-103', trailer: 'RF-27', state: 'AZ', location: 'I-10 port of entry · Ehrenberg', reportNumber: 'AZ26071209', level: INSPECTION_LEVELS[0], basic: CLEAN, status: 'Closed', resolution: 'Clean inspection' }),
  vio({ id: 'INS-1006', date: d('2026-06-12'), driver: 'Tobias Frey', truck: 'T-118', state: 'CO', location: 'I-70 · Grand Junction', reportNumber: 'COSP26061233', level: INSPECTION_LEVELS[2], basic: 'Unsafe Driving', code: '392.2SLLS2', description: 'Speeding 6–10 mph over the limit', severity: 4, fine: 135, finePaidBy: 'Driver', status: 'Closed', resolution: 'Fine paid', coached: d('2026-06-15'), log: [sys(d('2026-06-12'), 'Logged'), sys(d('2026-06-15'), 'Driver coached', 'Speed management review'), sys(d('2026-06-20'), 'Closed', 'Fine paid')] }),
  vio({ id: 'INS-1007', date: d('2026-05-06'), driver: 'Ellis Nakamura', truck: 'T-121', state: 'OR', location: 'I-84 port of entry · Ontario', reportNumber: 'OR26050621', level: INSPECTION_LEVELS[2], basic: 'Hours-of-Service Compliance', code: '395.8(f)(1)', description: 'Driver’s record of duty status not current', severity: 1, status: 'Closed', resolution: 'Corrected', coached: d('2026-05-08') }),
  vio({ id: 'INS-1008', date: d('2026-04-22'), driver: 'Dara Whitfield', truck: 'T-107', state: 'UT', location: 'I-80 port of entry · Echo', reportNumber: 'UT26042215', level: INSPECTION_LEVELS[1], basic: CLEAN, status: 'Closed', resolution: 'Clean inspection' }),
  vio({ id: 'INS-1009', date: d('2026-03-18'), driver: 'Ana Cortez', truck: 'T-109', trailer: 'FB-04', state: 'OR', location: 'I-5 scale · Ashland', reportNumber: 'OR26031844', level: INSPECTION_LEVELS[1], basic: 'Vehicle Maintenance', code: '393.75(c)', description: 'Tire tread depth less than 2/32 inch', severity: 8, oos: true, status: 'Closed', resolution: 'Corrected' }),
];

const claim = (p: Partial<ClaimRecord> & Pick<ClaimRecord, 'id' | 'type' | 'incidentDate' | 'driver' | 'claimant'>): ClaimRecord => ({
  received: p.incidentDate, load: '', truck: '', trailer: '', location: '', claimantContact: '', claimantEmail: '', amountClaimed: 0, reserve: 0,
  insurer: 'Great Plains Mutual', policyNumber: 'GPM-CA-448120', insurerClaimNo: '', deductible: 2500, fatality: false, injuryTreated: false, towAway: false, hazmatRelease: false,
  policeReport: '', citation: '', preventable: 'Under review', description: '', status: 'Open', acknowledgedOn: '', payments: [], recovered: 0, closedOn: '', closedReason: '',
  documents: [], notes: '', created: made(p.received ?? p.incidentDate), log: [sys(p.received ?? p.incidentDate, 'Opened', `${p.type} · ${p.claimant}`, 'Rosa Medina')], ...p,
});

const DEMO_CLAIMS = (): ClaimRecord[] => [
  claim({ id: 'CLM-1112', type: 'Cargo damage', incidentDate: d('2026-08-26'), received: d('2026-08-29'), load: 'L-40220', driver: 'Ellis Nakamura', truck: 'T-121', trailer: 'FB-12', location: 'Boise, ID (delivery)', claimant: 'Cascade Building Supply', claimantContact: 'Dana Whitlock', amountClaimed: 6800, reserve: 6800, description: 'Two bundles of lumber shifted and split; consignee noted damage on the delivery receipt.', insurerClaimNo: 'GPM-26-30418' }),
  claim({ id: 'CLM-1111', type: 'Temperature / spoilage', incidentDate: d('2026-08-14'), received: d('2026-08-15'), load: 'L-40218', driver: 'Marcus Hale', truck: 'T-114', trailer: 'RF-88', location: 'Reno, NV (delivery)', claimant: 'Northgate Foods', amountClaimed: 4200, reserve: 4200, status: 'Under review', acknowledgedOn: d('2026-08-18'), description: 'Produce arrived at 41°F against a 34°F set point. Reefer download requested.', log: [sys(d('2026-08-15'), 'Opened', 'Temperature / spoilage · Northgate Foods', 'Rosa Medina'), sys(d('2026-08-18'), 'Acknowledged', 'Letter sent to Northgate Foods', 'Rosa Medina')] }),
  claim({
    id: 'CLM-1110', type: 'Accident · property damage', incidentDate: d('2026-07-22'), driver: 'Dara Whitfield', truck: 'T-107', trailer: 'DV-51', location: 'Wasatch Crossdock, Salt Lake City, UT', claimant: 'Wasatch Crossdock', amountClaimed: 2900, reserve: 2900,
    description: 'Backed into a dock door frame while docking.', preventable: 'Preventable', status: 'Settled', payments: [{ date: d('2026-08-12'), amount: 2650, by: 'Company', reference: 'Check 10482' }], closedOn: d('2026-08-12'), closedReason: 'Paid in full',
    log: [sys(d('2026-07-22'), 'Opened', 'Accident · property damage', 'Rosa Medina'), sys(d('2026-08-12'), 'Payment', '$2,650.00 by Company · Check 10482', 'Grace Whitman'), sys(d('2026-08-12'), 'Settled', 'Paid in full', 'Grace Whitman')],
  }),
  claim({ id: 'CLM-1109', type: 'Cargo shortage', incidentDate: d('2026-06-30'), received: d('2026-07-02'), load: 'L-40210', driver: 'Tobias Frey', truck: 'T-118', trailer: 'DV-14', claimant: 'Sierra Ag Partners', amountClaimed: 1450, reserve: 0, acknowledgedOn: d('2026-07-06'), status: 'Denied', closedOn: d('2026-07-28'), closedReason: 'Shipper load and count; seal intact on delivery', description: 'Consignee reported 6 cases short.' }),
  claim({
    id: 'CLM-1108', type: 'Accident · bodily injury', incidentDate: d('2026-05-09'), driver: 'Ana Cortez', truck: 'T-109', trailer: 'FB-04', location: 'SR-99 · Fresno, CA', claimant: 'Third party · R. Delgado', amountClaimed: 25000, reserve: 25000,
    injuryTreated: true, towAway: true, policeReport: 'CHP 26-0509-1173', preventable: 'Not preventable', insurerClaimNo: 'GPM-26-11907', description: 'Passenger car changed lanes into the trailer; other driver taken to hospital.',
    status: 'Settled', payments: [{ date: d('2026-08-01'), amount: 18500, by: 'Insurance', reference: 'GPM settlement' }, { date: d('2026-08-01'), amount: 2500, by: 'Company', reference: 'Deductible' }], closedOn: d('2026-08-01'), closedReason: 'Settled by insurer',
  }),
  claim({ id: 'CLM-1107', type: 'Cargo damage', incidentDate: d('2026-03-03'), received: d('2026-03-05'), load: 'L-40203', driver: 'Priya Raman', truck: 'T-103', trailer: 'RF-27', claimant: 'Northgate Foods', amountClaimed: 3100, reserve: 3100, acknowledgedOn: d('2026-03-09'), status: 'Settled', payments: [{ date: d('2026-04-02'), amount: 2875, by: 'Company', reference: 'ACH' }], recovered: 400, closedOn: d('2026-04-02'), closedReason: 'Paid, salvage sold' }),
];

const DEMO_REQUESTS = (): DocRequest[] => [
  { id: 'DR-1001', driverId: 'DRV-104', driver: 'Priya Raman', documents: ['CDL'], due: addDays(todayIso(), 10), via: 'Email', message: 'Please send a copy of your renewed CDL.', status: 'Requested', doneOn: '', created: made(addDays(todayIso(), -3)), by: 'Daniel Soto' },
];

export const WORK_ORDER_SEED: WorkOrder[] = !IS_DEMO ? [] : DEMO_WORK_ORDERS();
export const VIOLATION_SEED: ViolationRecord[] = !IS_DEMO ? [] : DEMO_VIOLATIONS();
export const CLAIM_SEED: ClaimRecord[] = !IS_DEMO ? [] : DEMO_CLAIMS();
export const REQUEST_SEED: DocRequest[] = !IS_DEMO ? [] : DEMO_REQUESTS();

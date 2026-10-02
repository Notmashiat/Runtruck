// HR › Employee Contracts and HR › Onboarding (release 1.7).
// A contract is the agreement with one person: the kind of agreement, its
// term and renewal, pay and benefits, equipment and lease terms for drivers,
// the clauses it includes, and who signed it when. Onboarding takes a new
// hire from application to their first day with a checklist built for their
// role — for drivers, the driver qualification file the FMCSA requires
// (49 CFR 391 and 382) — then puts them on payroll, the fleet and a contract.
// Stored per company (runtruck-<id>-contracts, runtruck-<id>-onboarding).
import { IS_DEMO } from '../lib/account';
import { shiftIso, todayIso } from '../lib/clock';
import type { BillDocument } from './bills';
import type { FormValues } from './fleet';
import { DRIVER_ROLES, addDays, type PayBasis, type PayFrequency } from './payroll';

// — shared —

export interface HrLog {
  at: string;
  by: string;
  action: string;
  note: string;
}

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const num = (v: FormValues, k: string) => Number(str(v, k).replace(/[$,%]/g, '')) || 0;
const list = (v: FormValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
const made = (iso: string) => `${iso}T12:00:00.000Z`;

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
export const isDriverRole = (role: string) => DRIVER_ROLES.includes(role);

// — contracts —

export const AGREEMENTS = [
  'Employment agreement (W-2)',
  'Independent contractor agreement (1099)',
  'Owner-operator lease (49 CFR 376)',
  'Lease-purchase agreement',
  'Offer letter',
];
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Seasonal', 'Temporary'];
export const TERM_TYPES = ['Ongoing (at-will)', 'Fixed term'];
export const TERM_LENGTHS = ['3 months', '6 months', '1 year', '2 years', '3 years', '4 years'];
export const RENEWALS = ['Renews automatically', 'Renew by hand', 'Ends at term'];
export const BENEFITS = [
  'Health insurance', 'Dental & vision', '401(k) match', 'Paid time off', 'Paid holidays', 'Life insurance', 'Per diem',
  'Safety & fuel bonuses', 'Rider & pet policy', 'Home time guarantee',
];
export const EQUIPMENT = ['Company truck', 'Contractor’s own truck', 'Leased from the company'];
export const FUEL_TERMS = ['Company pays fuel', 'Contractor pays fuel', 'Fuel card, deducted from settlement'];
export const INSURANCE_TERMS = [
  'Company: auto liability & cargo', 'Company: workers’ comp', 'Contractor: bobtail / non-trucking liability',
  'Contractor: occupational accident', 'Contractor: physical damage on the truck',
];
export const CLAUSES = [
  'At-will employment', 'Confidentiality', 'Non-solicitation', 'Non-compete', 'Drug & alcohol policy (49 CFR 382)',
  'Employee handbook acknowledged', 'Damage / claim deductions authorized', 'Escrow held and refunded (49 CFR 376.12(k))',
  'Equipment returned on exit', 'Arbitration of disputes',
];
export const END_REASONS = ['Resigned', 'Terminated', 'Term ended, not renewed', 'Replaced by a new contract', 'Lease paid off / truck purchased', 'Other'];

export type ContractStatus = 'Draft' | 'Sent for signature' | 'Active' | 'Ended';
// What the list shows, worked out from the status and the dates.
export type ContractState = 'Draft' | 'Awaiting signature' | 'Starts soon' | 'Active' | 'Renewal due' | 'Ending soon' | 'Expired' | 'Ended';
export const CONTRACT_STATES: ContractState[] = ['Draft', 'Awaiting signature', 'Starts soon', 'Active', 'Renewal due', 'Ending soon', 'Expired', 'Ended'];
export const CONTRACT_TAG: Record<ContractState, string> = {
  Draft: 'tag-neutral', 'Awaiting signature': 'tag-outline', 'Starts soon': 'tag-accent', Active: 'tag-green',
  'Renewal due': 'tag-outline', 'Ending soon': 'tag-outline', Expired: 'tag-outline', Ended: 'tag-neutral',
};
// How far ahead renewals and endings show up.
export const RENEWAL_WINDOW = 60;

export interface ContractRecord {
  id: string;
  person: string;
  employeeId: string;
  email: string;
  role: string;
  agreement: string;
  employment: string;
  start: string;
  termType: string;
  termLength: string;
  end: string;
  renewal: string;
  noticeDays: number;
  probationDays: number;
  payBasis: PayBasis;
  rate: number;
  frequency: PayFrequency;
  signOnBonus: number;
  benefits: string[];
  ptoDays: number;
  // Drivers: the truck and who pays for what.
  equipment: string;
  truck: string;
  leasePayment: number;
  escrow: number;
  fuel: string;
  insurance: string[];
  homeTime: string;
  region: string;
  clauses: string[];
  companySigner: string;
  signerTitle: string;
  sentOn: string;
  personSigned: string;
  companySigned: string;
  status: ContractStatus;
  endedOn: string;
  endReason: string;
  onboardingId: string;
  documents: BillDocument[];
  notes: string;
  log: HrLog[];
  created: string;
  updated?: string;
}

const lengthMonths = (t: string) => {
  const n = Number(t.split(' ')[0]) || 0;
  return t.includes('year') ? n * 12 : n;
};

// The end date in force today: a contract that renews by itself rolls forward a term at a time.
export function currentEnd(c: Pick<ContractRecord, 'termType' | 'end' | 'renewal' | 'termLength'>, today = todayIso()): string {
  if (c.termType !== 'Fixed term' || !c.end) return '';
  let end = c.end;
  const months = lengthMonths(c.termLength);
  if (c.renewal === 'Renews automatically' && months > 0) while (end < today) end = addMonths(end, months);
  return end;
}

export function contractState(c: ContractRecord, today = todayIso()): ContractState {
  if (c.status === 'Ended') return 'Ended';
  if (c.status === 'Draft') return 'Draft';
  if (c.status === 'Sent for signature') return 'Awaiting signature';
  if (c.start > today) return 'Starts soon';
  const end = currentEnd(c, today);
  if (!end) return 'Active';
  if (end < today) return 'Expired';
  if (daysBetween(today, end) <= RENEWAL_WINDOW) return c.renewal === 'Ends at term' ? 'Ending soon' : 'Renewal due';
  return 'Active';
}

// '$0.62 / mi', '72% of line haul', '$68,000 / yr'.
export function contractPay(c: Pick<ContractRecord, 'payBasis' | 'rate'>): string {
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  switch (c.payBasis) {
    case 'Per mile': return `${money(c.rate)} / mi`;
    case '% of line haul': return `${c.rate}% of line haul`;
    case 'Flat per load': return `${money(c.rate)} / load`;
    case 'Hourly': return `${money(c.rate)} / hr`;
    default: return `${money(c.rate)} / yr`;
  }
}

// '$0.58 / mi' → Per mile 0.58; '75% of line haul'; '$52,000 / yr'; '$34.50 / hr'; '$250 / load'.
export function parseOffer(text: string): { payBasis: PayBasis; rate: number } | null {
  const n = Number((/[\d,]+(\.\d+)?/.exec(text)?.[0] ?? '').replace(/,/g, ''));
  if (!n) return null;
  const t = text.toLowerCase();
  if (t.includes('%')) return { payBasis: '% of line haul', rate: n };
  if (/\/\s*(mi|mile)/.test(t) || t.includes('cpm')) return { payBasis: 'Per mile', rate: n };
  if (/\/\s*(hr|hour)/.test(t)) return { payBasis: 'Hourly', rate: n };
  if (/\/\s*load/.test(t)) return { payBasis: 'Flat per load', rate: n };
  if (/\/\s*(yr|year)/.test(t) || n >= 10000) return { payBasis: 'Salary', rate: n };
  return null;
}

export const isLease = (agreement: string) => agreement.startsWith('Owner-operator') || agreement.startsWith('Lease-purchase');

export function nextContractId(all: { id: string }[]): string {
  return `CT-${Math.max(1000, ...all.map((c) => Number(c.id.replace(/\D/g, '')) || 0)) + 1}`;
}

// The agreement that usually goes with a role and worker type.
export function agreementFor(role: string, workerType: string): string {
  if (role === 'Lease-purchase driver') return AGREEMENTS[3];
  if (role === 'Owner-operator') return AGREEMENTS[2];
  return workerType.startsWith('1099') ? AGREEMENTS[1] : AGREEMENTS[0];
}

export function defaultClauses(agreement: string): string[] {
  if (isLease(agreement)) return ['Confidentiality', 'Drug & alcohol policy (49 CFR 382)', 'Damage / claim deductions authorized', 'Escrow held and refunded (49 CFR 376.12(k))', 'Equipment returned on exit'];
  if (agreement.startsWith('Independent')) return ['Confidentiality', 'Non-solicitation'];
  return ['At-will employment', 'Confidentiality', 'Drug & alcohol policy (49 CFR 382)', 'Employee handbook acknowledged'];
}

export function blankContractForm(today: string, signer: string, prefill: FormValues = {}): FormValues {
  const role = str(prefill, 'role') || 'Company driver';
  const agreement = str(prefill, 'agreement') || agreementFor(role, str(prefill, 'workerType') || 'W-2 employee');
  const lease = isLease(agreement);
  return {
    person: '', employeeId: '', email: '', role, agreement, employment: 'Full-time',
    start: today, termType: lease ? 'Fixed term' : 'Ongoing (at-will)', termLength: '1 year', end: lease ? addMonths(today, 12) : '', renewal: lease ? 'Renew by hand' : 'Renews automatically',
    noticeDays: lease ? '30' : '14', probationDays: lease ? '' : '90',
    payBasis: lease ? '% of line haul' : isDriverRole(role) ? 'Per mile' : 'Salary', rate: '', frequency: isDriverRole(role) ? 'Weekly' : 'Every 2 weeks',
    signOnBonus: '', benefits: lease ? [] : ['Health insurance', 'Paid time off', 'Paid holidays'], ptoDays: lease ? '' : '10',
    equipment: lease ? (agreement.startsWith('Lease') ? 'Leased from the company' : 'Contractor’s own truck') : 'Company truck', truck: '',
    leasePayment: '', escrow: '', fuel: lease ? 'Fuel card, deducted from settlement' : 'Company pays fuel',
    insurance: lease ? ['Company: auto liability & cargo', 'Contractor: bobtail / non-trucking liability', 'Contractor: occupational accident'] : ['Company: auto liability & cargo', 'Company: workers’ comp'],
    homeTime: '', region: '', clauses: defaultClauses(agreement), companySigner: signer, signerTitle: 'Operations manager', notes: '',
    ...prefill,
  };
}

export function contractToForm(c: ContractRecord): FormValues {
  const n = (x: number) => (x ? String(x) : '');
  return {
    person: c.person, employeeId: c.employeeId, email: c.email, role: c.role, agreement: c.agreement, employment: c.employment,
    start: c.start, termType: c.termType, termLength: c.termLength, end: c.end, renewal: c.renewal, noticeDays: n(c.noticeDays), probationDays: n(c.probationDays),
    payBasis: c.payBasis, rate: n(c.rate), frequency: c.frequency, signOnBonus: n(c.signOnBonus), benefits: c.benefits, ptoDays: n(c.ptoDays),
    equipment: c.equipment, truck: c.truck, leasePayment: n(c.leasePayment), escrow: n(c.escrow), fuel: c.fuel, insurance: c.insurance,
    homeTime: c.homeTime, region: c.region, clauses: c.clauses, companySigner: c.companySigner, signerTitle: c.signerTitle, notes: c.notes,
  };
}

export function contractFromForm(v: FormValues, id: string, documents: BillDocument[], by: string, prev?: ContractRecord, extra: Partial<ContractRecord> = {}): ContractRecord {
  const now = new Date().toISOString();
  const role = str(v, 'role');
  const fixed = str(v, 'termType') === 'Fixed term';
  const start = str(v, 'start');
  const driver = isDriverRole(role);
  return {
    id, person: str(v, 'person'), employeeId: str(v, 'employeeId'), email: str(v, 'email'), role, agreement: str(v, 'agreement'), employment: str(v, 'employment'),
    start, termType: str(v, 'termType'), termLength: fixed ? str(v, 'termLength') : '',
    end: fixed ? str(v, 'end') || addMonths(start, lengthMonths(str(v, 'termLength')) || 12) : '', renewal: fixed ? str(v, 'renewal') : '',
    noticeDays: num(v, 'noticeDays'), probationDays: num(v, 'probationDays'),
    payBasis: str(v, 'payBasis') as PayBasis, rate: num(v, 'rate'), frequency: str(v, 'frequency') as PayFrequency, signOnBonus: num(v, 'signOnBonus'),
    benefits: list(v, 'benefits'), ptoDays: num(v, 'ptoDays'),
    equipment: driver ? str(v, 'equipment') : '', truck: driver ? str(v, 'truck') : '', leasePayment: driver ? num(v, 'leasePayment') : 0, escrow: driver ? num(v, 'escrow') : 0,
    fuel: driver ? str(v, 'fuel') : '', insurance: driver ? list(v, 'insurance') : [], homeTime: driver ? str(v, 'homeTime') : '', region: driver ? str(v, 'region') : '',
    clauses: list(v, 'clauses'), companySigner: str(v, 'companySigner'), signerTitle: str(v, 'signerTitle'),
    sentOn: prev?.sentOn ?? '', personSigned: prev?.personSigned ?? '', companySigned: prev?.companySigned ?? '',
    status: prev?.status ?? 'Draft', endedOn: prev?.endedOn ?? '', endReason: prev?.endReason ?? '', onboardingId: prev?.onboardingId ?? '',
    documents, notes: str(v, 'notes'),
    log: prev ? [...prev.log, { at: now, by, action: 'Edited', note: 'Terms updated' }] : [{ at: now, by, action: 'Drafted', note: '' }],
    created: prev?.created ?? now, updated: prev ? now : undefined,
    ...extra,
  };
}

export function reviveContracts(raw: unknown): ContractRecord[] | null {
  return Array.isArray(raw) && raw.every((c) => c && typeof c.id === 'string' && typeof c.person === 'string' && Array.isArray(c.log))
    ? (raw as ContractRecord[]).map((c) => ({ ...c, documents: c.documents ?? [], benefits: c.benefits ?? [], insurance: c.insurance ?? [], clauses: c.clauses ?? [] }))
    : null;
}

// — onboarding —

export const STAGES = ['Application', 'Screening', 'Background & safety', 'Medical & drug test', 'Road test', 'Paperwork', 'Orientation'] as const;
export type Stage = (typeof STAGES)[number];
export type OnboardingStatus = 'In progress' | 'Hired' | 'Not hired' | 'Withdrawn';
export const SOURCES = ['Referral', 'Job board', 'Company website', 'Recruiter', 'Social media', 'Driving school', 'Walk-in', 'Rehire'];
export const CLOSE_REASONS: Record<'Not hired' | 'Withdrawn', string[]> = {
  'Not hired': ['Failed drug test', 'MVR or safety history', 'Clearinghouse violation', 'Failed road test', 'Not enough experience', 'Medical certificate', 'Position filled', 'Other'],
  Withdrawn: ['Took another job', 'Pay or home time', 'No response', 'Personal reasons', 'Other'],
};
export const EXPERIENCE = ['Dry van', 'Reefer', 'Flatbed', 'Tanker', 'Hazmat', 'Doubles / triples', 'Team driving', 'Local / regional', 'Over the road'];

export interface Step {
  id: string;
  stage: Stage;
  label: string;
  // The rule behind it, shown under the step (e.g. '49 CFR 391.23').
  rule: string;
  required: boolean;
  done: boolean;
  doneOn: string;
  by: string;
  note: string;
}

export interface OnboardingRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  role: string;
  workerType: string;
  manager: string;
  source: string;
  applied: string;
  targetStart: string;
  payOffer: string;
  terminal: string;
  // Drivers.
  cdlClass: string;
  cdlState: string;
  cdlExpiry: string;
  endorsements: string[];
  medicalExpiry: string;
  experienceYears: number;
  experience: string[];
  steps: Step[];
  status: OnboardingStatus;
  closedOn: string;
  closedReason: string;
  // What it became.
  employeeId: string;
  driverId: string;
  contractId: string;
  documents: BillDocument[];
  notes: string;
  log: HrLog[];
  created: string;
  updated?: string;
}

type Template = [Stage, string, string, boolean];

const DRIVER_SCREENING: Template[] = [
  ['Application', 'Employment application received', '49 CFR 391.21', true],
  ['Application', 'Phone screen / interview', '', true],
  ['Screening', 'Copy of CDL on file', '', true],
  ['Screening', 'Background check consent signed', 'FCRA', true],
  ['Screening', 'PSP report reviewed', 'FMCSA Pre-Employment Screening Program', false],
  ['Background & safety', 'MVR from every state licensed in, last 3 years', '49 CFR 391.23(a)(1)', true],
  ['Background & safety', 'Safety performance history from DOT employers, last 3 years', '49 CFR 391.23(a)(2)', true],
  ['Background & safety', 'FMCSA Clearinghouse full query', '49 CFR 382.701', true],
  ['Background & safety', 'Criminal background check', '', false],
  ['Medical & drug test', 'DOT pre-employment drug test: negative result', '49 CFR 382.301', true],
  ['Medical & drug test', 'DOT medical examiner’s certificate on file', '49 CFR 391.43', true],
  ['Road test', 'Road test certificate (or CDL accepted in lieu)', '49 CFR 391.31 / 391.33', true],
];
const W2_PAPERWORK: Template[] = [
  ['Paperwork', 'Offer accepted / contract signed', '', true],
  ['Paperwork', 'Form I-9 employment eligibility', 'Within 3 days of the first day', true],
  ['Paperwork', 'Form W-4 tax withholding', '', true],
  ['Paperwork', 'Direct deposit form', '', true],
  ['Paperwork', 'Handbook and drug & alcohol policy acknowledged', '49 CFR 382.601', true],
  ['Paperwork', 'Emergency contact on file', '', true],
];
const CONTRACTOR_PAPERWORK: Template[] = [
  ['Paperwork', 'Lease / contractor agreement signed', '49 CFR 376.12', true],
  ['Paperwork', 'Form W-9', '', true],
  ['Paperwork', 'Certificate of insurance: bobtail / non-trucking liability', '', true],
  ['Paperwork', 'Occupational accident insurance', '', true],
  ['Paperwork', 'Truck annual DOT inspection', '49 CFR 396.17', true],
  ['Paperwork', 'Truck registration, IRP plates and 2290 (HVUT) proof', '', true],
  ['Paperwork', 'Drug & alcohol policy acknowledged', '49 CFR 382.601', true],
  ['Paperwork', 'Settlement deposit details', '', true],
];
const DRIVER_ORIENTATION: Template[] = [
  ['Orientation', 'Safety orientation', '', true],
  ['Orientation', 'ELD and driver app set up', '49 CFR 395.8', true],
  ['Orientation', 'Fuel card issued', '', false],
  ['Orientation', 'Truck assigned', '', true],
  ['Orientation', 'Ride-along / first load with a trainer', '', false],
];
const OFFICE: Template[] = [
  ['Application', 'Application or résumé received', '', true],
  ['Application', 'Interview', '', true],
  ['Screening', 'References checked', '', false],
  ['Screening', 'Background check', '', false],
  ['Paperwork', 'Offer letter signed', '', true],
  ['Paperwork', 'Form I-9 employment eligibility', 'Within 3 days of the first day', true],
  ['Paperwork', 'Form W-4 tax withholding', '', true],
  ['Paperwork', 'Direct deposit form', '', true],
  ['Paperwork', 'Employee handbook acknowledged', '', true],
  ['Paperwork', 'Emergency contact on file', '', true],
  ['Orientation', 'RunTruck account set up (Settings › Team)', '', true],
  ['Orientation', 'Equipment issued (laptop, phone, keys)', '', false],
  ['Orientation', 'Training / shadowing', '', true],
  ['Orientation', '30 / 60 / 90-day check-ins booked', '', false],
];
const SHOP: Template[] = [
  ['Screening', 'Driver’s license copy (to move trucks)', '', true],
  ['Orientation', 'Shop safety and tools orientation', '', true],
];

export function checklistFor(role: string, workerType: string): Step[] {
  const contractor = role === 'Owner-operator' || role === 'Lease-purchase driver' || (isDriverRole(role) && workerType.startsWith('1099'));
  const rows: Template[] = isDriverRole(role)
    ? [...DRIVER_SCREENING, ...(contractor ? CONTRACTOR_PAPERWORK : W2_PAPERWORK), ...DRIVER_ORIENTATION.map((t): Template => (contractor && t[1] === 'Truck assigned' ? ['Orientation', 'Truck added to the fleet and lettered', '49 CFR 390.21', true] : t))]
    : role === 'Mechanic' ? [...OFFICE, ...SHOP] : OFFICE;
  const sorted = [...rows].sort((a, b) => STAGES.indexOf(a[0]) - STAGES.indexOf(b[0]));
  return sorted.map(([stage, label, rule, required], i) => ({ id: `S${i + 1}`, stage, label, rule, required, done: false, doneOn: '', by: '', note: '' }));
}

export const stepId = () => `S-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Where a hire is: the first stage with a required step still open.
export function stageOf(o: OnboardingRecord): string {
  if (o.status !== 'In progress') return o.status;
  const open = o.steps.find((s) => s.required && !s.done);
  return open ? open.stage : 'Ready to hire';
}
export function progressOf(o: OnboardingRecord): { done: number; total: number; pct: number } {
  const req = o.steps.filter((s) => s.required);
  const done = req.filter((s) => s.done).length;
  return { done, total: req.length, pct: req.length ? Math.round((done / req.length) * 100) : 100 };
}
export const nextStepOf = (o: OnboardingRecord) => o.steps.find((s) => s.required && !s.done);
export const ONBOARDING_TAG: Record<string, string> = {
  'Ready to hire': 'tag-green', Hired: 'tag-green', 'Not hired': 'tag-neutral', Withdrawn: 'tag-neutral',
};
export const stageTag = (stage: string) => ONBOARDING_TAG[stage] ?? (stage === 'Application' ? 'tag-neutral' : 'tag-accent');

// Credentials that run out within 30 days of the start date (or already have).
export function credentialWarnings(o: Pick<OnboardingRecord, 'role' | 'cdlExpiry' | 'medicalExpiry' | 'targetStart'>, today = todayIso()): string[] {
  if (!isDriverRole(o.role)) return [];
  const by = o.targetStart && o.targetStart > today ? o.targetStart : today;
  const out: string[] = [];
  const check = (label: string, iso: string) => {
    if (!iso) return;
    if (iso < today) out.push(`${label} expired`);
    else if (daysBetween(by, iso) <= 30) out.push(`${label} expires within 30 days of starting`);
  };
  check('CDL', o.cdlExpiry);
  check('Medical certificate', o.medicalExpiry);
  return out;
}

export function nextOnboardingId(all: { id: string }[]): string {
  return `ON-${Math.max(1000, ...all.map((c) => Number(c.id.replace(/\D/g, '')) || 0)) + 1}`;
}

export function blankOnboardingForm(today: string, manager: string): FormValues {
  return {
    name: '', email: '', phone: '', city: '', state: '', role: 'Company driver', workerType: 'W-2 employee', manager, source: 'Referral',
    applied: today, targetStart: addDays(today, 14), payOffer: '', terminal: '',
    cdlClass: 'A', cdlState: '', cdlExpiry: '', endorsements: [], medicalExpiry: '', experienceYears: '', experience: [], notes: '',
  };
}

export function onboardingToForm(o: OnboardingRecord): FormValues {
  return {
    name: o.name, email: o.email, phone: o.phone, city: o.city, state: o.state, role: o.role, workerType: o.workerType, manager: o.manager,
    source: o.source, applied: o.applied, targetStart: o.targetStart, payOffer: o.payOffer, terminal: o.terminal,
    cdlClass: o.cdlClass, cdlState: o.cdlState, cdlExpiry: o.cdlExpiry, endorsements: o.endorsements, medicalExpiry: o.medicalExpiry,
    experienceYears: o.experienceYears ? String(o.experienceYears) : '', experience: o.experience, notes: o.notes,
  };
}

export function onboardingFromForm(v: FormValues, id: string, steps: Step[], documents: BillDocument[], by: string, prev?: OnboardingRecord): OnboardingRecord {
  const now = new Date().toISOString();
  const role = str(v, 'role');
  const driver = isDriverRole(role);
  return {
    id, name: str(v, 'name'), email: str(v, 'email'), phone: str(v, 'phone'), city: str(v, 'city'), state: str(v, 'state').toUpperCase(),
    role, workerType: str(v, 'workerType'), manager: str(v, 'manager'), source: str(v, 'source'), applied: str(v, 'applied'), targetStart: str(v, 'targetStart'),
    payOffer: str(v, 'payOffer'), terminal: str(v, 'terminal'),
    cdlClass: driver ? str(v, 'cdlClass') : '', cdlState: driver ? str(v, 'cdlState').toUpperCase() : '', cdlExpiry: driver ? str(v, 'cdlExpiry') : '',
    endorsements: driver ? list(v, 'endorsements') : [], medicalExpiry: driver ? str(v, 'medicalExpiry') : '',
    experienceYears: driver ? num(v, 'experienceYears') : 0, experience: driver ? list(v, 'experience') : [],
    steps, status: prev?.status ?? 'In progress', closedOn: prev?.closedOn ?? '', closedReason: prev?.closedReason ?? '',
    employeeId: prev?.employeeId ?? '', driverId: prev?.driverId ?? '', contractId: prev?.contractId ?? '',
    documents, notes: str(v, 'notes'),
    log: prev ? [...prev.log, { at: now, by, action: 'Edited', note: 'Details updated' }] : [{ at: now, by, action: 'Started', note: `Onboarding as ${role}` }],
    created: prev?.created ?? now, updated: prev ? now : undefined,
  };
}

export function reviveOnboarding(raw: unknown): OnboardingRecord[] | null {
  return Array.isArray(raw) && raw.every((o) => o && typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.steps))
    ? (raw as OnboardingRecord[]).map((o) => ({ ...o, documents: o.documents ?? [], endorsements: o.endorsements ?? [], experience: o.experience ?? [], log: o.log ?? [] }))
    : null;
}

// — demo records (RunTruck's own workspace only) —

const d = (iso: string) => shiftIso(iso);

function contract(p: Partial<ContractRecord> & Pick<ContractRecord, 'id' | 'person' | 'role' | 'agreement' | 'start' | 'payBasis' | 'rate' | 'frequency'>): ContractRecord {
  const signed = p.status !== 'Draft' && p.status !== 'Sent for signature';
  return {
    employeeId: '', email: '', employment: 'Full-time', termType: 'Ongoing (at-will)', termLength: '', end: '', renewal: '', noticeDays: 14, probationDays: 90,
    signOnBonus: 0, benefits: ['Health insurance', 'Paid time off', 'Paid holidays'], ptoDays: 10, equipment: '', truck: '', leasePayment: 0, escrow: 0,
    fuel: '', insurance: [], homeTime: '', region: '', clauses: defaultClauses(p.agreement), companySigner: 'Rosa Medina', signerTitle: 'Operations manager',
    sentOn: p.start, personSigned: signed ? p.start : '', companySigned: signed ? p.start : '', status: 'Active', endedOn: '', endReason: '', onboardingId: '',
    documents: [], notes: '', created: made(p.start),
    log: [
      { at: made(p.start), by: 'Rosa Medina', action: 'Drafted', note: '' },
      ...(signed ? [{ at: made(p.start), by: 'Rosa Medina', action: 'Signed', note: 'Signed by both sides' }] : []),
    ],
    ...p,
  };
}

const driverTerms = (truck: string): Partial<ContractRecord> => ({
  equipment: 'Company truck', truck, fuel: 'Company pays fuel', insurance: ['Company: auto liability & cargo', 'Company: workers’ comp'],
  homeTime: 'Home every weekend', region: 'West Coast regional', benefits: ['Health insurance', 'Dental & vision', 'Paid time off', 'Safety & fuel bonuses'],
});

const DEMO_CONTRACTS = (): ContractRecord[] => {
  const today = todayIso();
  return [
    contract({ id: 'CT-1001', person: 'Marcus Hale', employeeId: 'EMP-1001', role: 'Company driver', agreement: AGREEMENTS[0], start: '2022-03-14', payBasis: 'Per mile', rate: 0.62, frequency: 'Weekly', ...driverTerms('T-114'), signOnBonus: 2500 }),
    contract({ id: 'CT-1002', person: 'Dara Whitfield', employeeId: 'EMP-1002', role: 'Company driver', agreement: AGREEMENTS[0], start: '2021-08-02', payBasis: 'Per mile', rate: 0.6, frequency: 'Weekly', ...driverTerms('T-107') }),
    // Fixed term, renewed by hand: comes up for renewal this month.
    contract({ id: 'CT-1003', person: 'Ellis Nakamura', employeeId: 'EMP-1003', role: 'Company driver', agreement: AGREEMENTS[0], start: '2023-10-01', termType: 'Fixed term', termLength: '1 year', end: addDays(today, 24), renewal: 'Renew by hand', payBasis: '% of line haul', rate: 25, frequency: 'Weekly', ...driverTerms('T-121') }),
    contract({ id: 'CT-1004', person: 'Priya Raman', employeeId: 'EMP-1004', role: 'Company driver', agreement: AGREEMENTS[0], start: '2024-09-20', termType: 'Fixed term', termLength: '1 year', end: addDays(today, 41), renewal: 'Renew by hand', payBasis: 'Per mile', rate: 0.58, frequency: 'Weekly', ...driverTerms('T-103') }),
    contract({ id: 'CT-1005', person: 'Ana Cortez', employeeId: 'EMP-1005', role: 'Company driver', agreement: AGREEMENTS[0], start: d('2026-01-12'), payBasis: 'Per mile', rate: 0.58, frequency: 'Weekly', ...driverTerms('T-109'), signOnBonus: 1500 }),
    contract({
      id: 'CT-1006', person: 'Tobias Frey', employeeId: 'EMP-1006', role: 'Lease-purchase driver', agreement: AGREEMENTS[3], start: '2023-11-15', termType: 'Fixed term', termLength: '3 years',
      end: addDays(today, 52), renewal: 'Ends at term', noticeDays: 30, probationDays: 0, payBasis: '% of line haul', rate: 72, frequency: 'Weekly', benefits: [], ptoDays: 0,
      equipment: 'Leased from the company', truck: 'T-118', leasePayment: 450, escrow: 2500, fuel: 'Fuel card, deducted from settlement',
      insurance: ['Company: auto liability & cargo', 'Contractor: bobtail / non-trucking liability', 'Contractor: occupational accident', 'Contractor: physical damage on the truck'],
      homeTime: 'Driver’s choice', region: 'Western states', notes: 'Truck title transfers when the last lease payment clears.',
    }),
    contract({ id: 'CT-1007', person: 'Rosa Medina', employeeId: 'EMP-1008', email: 'rosa.medina@sunridgefreight.com', role: 'Dispatcher', agreement: AGREEMENTS[0], start: '2020-06-06', payBasis: 'Salary', rate: 68000, frequency: 'Every 2 weeks', benefits: ['Health insurance', 'Dental & vision', '401(k) match', 'Paid time off', 'Paid holidays'], ptoDays: 15, companySigner: 'Owner', signerTitle: 'President' }),
    contract({ id: 'CT-1008', person: 'Luis Ortega', employeeId: 'EMP-1010', role: 'Mechanic', agreement: AGREEMENTS[0], start: '2023-02-09', payBasis: 'Hourly', rate: 34.5, frequency: 'Every 2 weeks', clauses: [...defaultClauses(AGREEMENTS[0]), 'Equipment returned on exit'] }),
    // Started this summer: the 90-day review is due.
    contract({ id: 'CT-1009', person: 'Evan Brooks', employeeId: 'EMP-1009', email: 'evan.brooks@sunridgefreight.com', role: 'Dispatcher', agreement: AGREEMENTS[0], start: d('2026-07-27'), payBasis: 'Salary', rate: 52000, frequency: 'Every 2 weeks', onboardingId: 'ON-1006' }),
    // Sent, not back yet.
    contract({ id: 'CT-1010', person: 'Jamal Reed', employeeId: 'EMP-1007', role: 'Company driver', agreement: AGREEMENTS[0], start: d('2026-09-08'), payBasis: 'Per mile', rate: 0.56, frequency: 'Weekly', ...driverTerms(''), status: 'Sent for signature', sentOn: d('2026-09-08'), onboardingId: 'ON-1001' }),
    contract({
      id: 'CT-1011', person: 'Carl Jensen', employeeId: 'EMP-1013', role: 'Company driver', agreement: AGREEMENTS[0], start: '2022-05-02', payBasis: 'Per mile', rate: 0.57, frequency: 'Weekly', ...driverTerms(''),
      status: 'Ended', endedOn: d('2026-07-17'), endReason: 'Resigned · Moved to a local carrier closer to home.',
    }),
  ].map((c) => (c.status === 'Ended' ? { ...c, log: [...c.log, { at: made(c.endedOn), by: 'Rosa Medina', action: 'Ended', note: c.endReason }] } : c));
};

// Steps done up to (and including) the first `n` required ones, with their dates.
function progressed(role: string, workerType: string, n: number, from: string, extra: (s: Step) => Partial<Step> = () => ({})): Step[] {
  let left = n;
  let day = 0;
  return checklistFor(role, workerType).map((s) => {
    if (left <= 0) return { ...s, ...extra(s) };
    if (s.required) left -= 1;
    day += 1;
    return { ...s, done: true, doneOn: addDays(from, Math.min(day, 20)), by: 'Rosa Medina', ...extra(s) };
  });
}

function hire(p: Partial<OnboardingRecord> & Pick<OnboardingRecord, 'id' | 'name' | 'role' | 'applied' | 'steps'>): OnboardingRecord {
  return {
    email: '', phone: '', city: 'Modesto', state: 'CA', workerType: 'W-2 employee', manager: 'Rosa Medina', source: 'Referral',
    targetStart: addDays(p.applied, 21), payOffer: '', terminal: 'Modesto, CA — main yard',
    cdlClass: isDriverRole(p.role) ? 'A' : '', cdlState: isDriverRole(p.role) ? 'CA' : '', cdlExpiry: '', endorsements: [], medicalExpiry: '', experienceYears: 0, experience: [],
    status: 'In progress', closedOn: '', closedReason: '', employeeId: '', driverId: '', contractId: '', documents: [], notes: '', created: made(p.applied),
    log: [{ at: made(p.applied), by: p.manager ?? 'Rosa Medina', action: 'Started', note: `Onboarding as ${p.role}` }],
    ...p,
  };
}

const DEMO_ONBOARDING = (): OnboardingRecord[] => {
  const today = todayIso();
  const jamal = d('2026-08-17');
  const sofia = d('2026-08-24');
  const derek = d('2026-08-28');
  const kevin = d('2026-09-01');
  const maya = addDays(today, -5);
  const evan = d('2026-07-13');
  return [
    hire({
      id: 'ON-1001', name: 'Jamal Reed', role: 'Company driver', applied: jamal, targetStart: d('2026-09-08'), source: 'Driving school', phone: '(209) 555-0147',
      payOffer: '$0.56 / mi', cdlExpiry: '2030-02-11', medicalExpiry: '2028-01-20', experienceYears: 1, experience: ['Dry van', 'Reefer'],
      steps: progressed('Company driver', 'W-2 employee', 22, jamal), employeeId: 'EMP-1007', contractId: 'CT-1010',
      notes: 'Ride-along with Ana Cortez before first solo load.',
    }),
    hire({
      id: 'ON-1002', name: 'Sofia Nguyen', role: 'Company driver', applied: sofia, targetStart: addDays(today, 6), manager: 'Luis Ortega', source: 'Job board', phone: '(209) 555-0188', email: 'sofia.nguyen@example.com',
      payOffer: '$0.58 / mi', cdlExpiry: '2029-06-30', medicalExpiry: addDays(today, 18), experienceYears: 4, experience: ['Reefer', 'Over the road'], endorsements: ['N — Tanker'],
      steps: progressed('Company driver', 'W-2 employee', 9, sofia),
    }),
    hire({
      id: 'ON-1003', name: 'Derek Holt', role: 'Owner-operator', workerType: '1099 contractor', applied: derek, targetStart: addDays(today, 12), source: 'Recruiter', phone: '(559) 555-0123',
      payOffer: '75% of line haul', cdlExpiry: '2028-11-02', medicalExpiry: '2027-05-14', experienceYears: 11, experience: ['Dry van', 'Flatbed', 'Over the road'], endorsements: ['H — Hazmat', 'N — Tanker'],
      steps: progressed('Owner-operator', '1099 contractor', 5, derek), notes: 'Own 2021 Peterbilt 579. Waiting on MVR consent and insurance certificate.',
    }),
    hire({
      id: 'ON-1004', name: 'Kevin Brandt', role: 'Company driver', applied: kevin, targetStart: addDays(today, 9), source: 'Company website', phone: '(209) 555-0174',
      payOffer: '$0.57 / mi', cdlExpiry: '2027-08-19', experienceYears: 2, experience: ['Dry van', 'Local / regional'],
      steps: progressed('Company driver', 'W-2 employee', 6, kevin, (s) => (s.label.startsWith('DOT medical') ? { note: 'Asked for a copy of his medical card' } : {})),
    }),
    hire({
      id: 'ON-1005', name: 'Maya Patel', role: 'Company driver', applied: maya, targetStart: addDays(today, 21), source: 'Social media', email: 'maya.patel@example.com',
      cdlExpiry: '2031-03-08', experienceYears: 3, experience: ['Dry van', 'Reefer'], steps: progressed('Company driver', 'W-2 employee', 1, maya),
    }),
    hire({
      id: 'ON-1006', name: 'Evan Brooks', role: 'Dispatcher', applied: evan, targetStart: d('2026-07-27'), source: 'Referral', email: 'evan.brooks@sunridgefreight.com', payOffer: '$52,000 / yr',
      steps: progressed('Dispatcher', 'W-2 employee', 99, evan), status: 'Hired', closedOn: d('2026-07-27'), employeeId: 'EMP-1009', contractId: 'CT-1009',
    }),
    hire({
      id: 'ON-1007', name: 'Trent Wallace', role: 'Company driver', applied: d('2026-08-03'), source: 'Job board', steps: progressed('Company driver', 'W-2 employee', 7, d('2026-08-03')),
      status: 'Not hired', closedOn: d('2026-08-14'), closedReason: 'Clearinghouse violation · Unresolved return-to-duty process.',
    }),
  ].map((o) => (o.status === 'In progress' ? o : { ...o, log: [...o.log, { at: made(o.closedOn), by: 'Rosa Medina', action: o.status, note: o.closedReason || 'Started work' }] }));
};

export const CONTRACT_SEED: ContractRecord[] = !IS_DEMO ? [] : DEMO_CONTRACTS();
export const ONBOARDING_SEED: OnboardingRecord[] = !IS_DEMO ? [] : DEMO_ONBOARDING();

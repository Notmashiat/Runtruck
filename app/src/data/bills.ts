// Accounting › Bills: what the company owes its vendors (fuel, repairs,
// insurance, leases, permits…), one-time or recurring, with the documents
// that came with each bill. Stored per company (runtruck-<id>-bills).
import { IS_DEMO } from '../lib/account';
import { shiftIso, todayIso } from '../lib/clock';
import type { FormValues } from './fleet';

export const BILL_CATEGORIES = [
  'Fuel', 'Repairs & maintenance', 'Parts', 'Tires', 'Insurance', 'Truck payment / lease', 'Trailer lease / rental',
  'ELD & telematics', 'Permits & licensing', 'Tolls & scales', 'Lumper & detention', 'Driver expenses', 'Facilities & rent',
  'Utilities', 'Software & subscriptions', 'Factoring fees', 'Professional services', 'Office & admin', 'Taxes', 'Other',
];
export const BILL_TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];
export const PAY_METHODS = ['ACH', 'Check', 'Credit card', 'Fuel card', 'Wire', 'Vendor auto-pay'];
export const BILL_KINDS = ['One-time', 'Recurring'];
export const FREQUENCIES = ['Weekly', 'Every 2 weeks', 'Monthly', 'Quarterly', 'Twice a year', 'Yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const ENDS = ['Never', 'On a date'];

export interface BillDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  // The file itself is in IndexedDB under the id (lib/fileStore.ts) when
  // `stored`; files attached before that carry it here as a data: URL.
  stored?: boolean;
  data?: string;
  added: string;
  // Which required document it is (customers: 'W-9', 'Credit application'…).
  kind?: string;
}

export interface BillPayment {
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export interface BillRecord {
  id: string;
  vendor: string;
  billNumber: string;
  category: string;
  description: string;
  amount: number;
  issued: string;
  terms: string;
  due: string;
  // One-time when absent.
  frequency?: Frequency;
  endsOn?: string;
  // Bills made from the same recurring bill share it (the first bill's id).
  seriesId?: string;
  truck: string;
  trailer: string;
  driver: string;
  load: string;
  terminal: string;
  method: string;
  autopay: boolean;
  scheduledFor?: string;
  vendorEmail: string;
  vendorPhone: string;
  vendorAccount: string;
  remitTo: string;
  paid?: BillPayment;
  void?: boolean;
  notes: string;
  documents: BillDocument[];
  created: string;
  updated?: string;
}

export type BillStatus = 'Overdue' | 'Due' | 'Scheduled' | 'Paid' | 'Void';
export const BILL_STATUSES: BillStatus[] = ['Overdue', 'Due', 'Scheduled', 'Paid', 'Void'];
export const BILL_TAG: Record<BillStatus, string> = {
  Overdue: 'tag-outline', Due: 'tag-outline', Scheduled: 'tag-accent', Paid: 'tag-green', Void: 'tag-neutral',
};

export function billStatus(b: BillRecord, today = todayIso()): BillStatus {
  if (b.void) return 'Void';
  if (b.paid) return 'Paid';
  if (b.scheduledFor || b.autopay) return 'Scheduled';
  return b.due < today ? 'Overdue' : 'Due';
}

export const isOpen = (b: BillRecord) => !b.void && !b.paid;

// — dates —

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The date one period later.
export function nextDate(iso: string, f: Frequency): string {
  switch (f) {
    case 'Weekly': return addDaysIso(iso, 7);
    case 'Every 2 weeks': return addDaysIso(iso, 14);
    case 'Monthly': return addMonths(iso, 1);
    case 'Quarterly': return addMonths(iso, 3);
    case 'Twice a year': return addMonths(iso, 6);
    default: return addMonths(iso, 12);
  }
}

// What a recurring bill costs a month on average.
export function monthlyCost(b: BillRecord): number {
  const per: Record<Frequency, number> = { Weekly: 52 / 12, 'Every 2 weeks': 26 / 12, Monthly: 1, Quarterly: 1 / 3, 'Twice a year': 1 / 6, Yearly: 1 / 12 };
  return b.frequency ? b.amount * per[b.frequency] : 0;
}

// 'Net 30' from a bill date → the due date.
export function dueFrom(issued: string, terms: string): string {
  const days = Number(/(\d+)/.exec(terms)?.[1] ?? 0);
  return issued ? addDaysIso(issued, days) : '';
}

// The bill that follows a recurring one, or null when the series has ended.
export function nextInSeries(b: BillRecord, id: string): BillRecord | null {
  if (!b.frequency) return null;
  const due = nextDate(b.due, b.frequency);
  if (b.endsOn && due > b.endsOn) return null;
  return {
    ...b,
    id,
    seriesId: b.seriesId ?? b.id,
    billNumber: '',
    issued: nextDate(b.issued, b.frequency),
    due,
    scheduledFor: b.autopay ? due : undefined,
    paid: undefined,
    void: undefined,
    documents: [],
    created: new Date().toISOString(),
    updated: undefined,
  };
}

export function nextBillId(list: BillRecord[]): string {
  const n = Math.max(1000, ...list.map((b) => Number(b.id.replace(/\D/g, '')) || 0)) + 1;
  return `BILL-${n}`;
}

// — the form —

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');

export function blankBillForm(today: string): FormValues {
  return {
    vendor: '', billNumber: '', category: '', description: '', amount: '', issued: today, terms: 'Net 30', due: dueFrom(today, 'Net 30'),
    kind: 'One-time', frequency: 'Monthly', ends: 'Never', endsOn: '',
    truck: '', trailer: '', driver: '', load: '', terminal: '',
    method: 'ACH', autopay: 'No', scheduledFor: '', vendorEmail: '', vendorPhone: '', vendorAccount: '', remitTo: '',
    paidAlready: 'No', paidDate: today, paidRef: '', notes: '',
  };
}

export function billToForm(b: BillRecord): FormValues {
  return {
    vendor: b.vendor, billNumber: b.billNumber, category: b.category, description: b.description, amount: String(b.amount),
    issued: b.issued, terms: b.terms, due: b.due,
    kind: b.frequency ? 'Recurring' : 'One-time', frequency: b.frequency ?? 'Monthly', ends: b.endsOn ? 'On a date' : 'Never', endsOn: b.endsOn ?? '',
    truck: b.truck, trailer: b.trailer, driver: b.driver, load: b.load, terminal: b.terminal,
    method: b.method, autopay: b.autopay ? 'Yes' : 'No', scheduledFor: b.scheduledFor ?? '', vendorEmail: b.vendorEmail, vendorPhone: b.vendorPhone,
    vendorAccount: b.vendorAccount, remitTo: b.remitTo,
    paidAlready: b.paid ? 'Yes' : 'No', paidDate: b.paid?.date ?? '', paidRef: b.paid?.reference ?? '', notes: b.notes,
  };
}

export function billFromForm(v: FormValues, id: string, documents: BillDocument[], prev?: BillRecord): BillRecord {
  const recurring = str(v, 'kind') === 'Recurring';
  const amount = Math.round((Number(str(v, 'amount').replace(/[$,]/g, '')) || 0) * 100) / 100;
  const paid = str(v, 'paidAlready') === 'Yes'
    ? { date: str(v, 'paidDate'), amount: prev?.paid?.amount ?? amount, method: str(v, 'method'), reference: str(v, 'paidRef') }
    : undefined;
  return {
    id,
    vendor: str(v, 'vendor'),
    billNumber: str(v, 'billNumber'),
    category: str(v, 'category'),
    description: str(v, 'description'),
    amount,
    issued: str(v, 'issued'),
    terms: str(v, 'terms'),
    due: str(v, 'due'),
    frequency: recurring ? (str(v, 'frequency') as Frequency) : undefined,
    endsOn: recurring && str(v, 'ends') === 'On a date' ? str(v, 'endsOn') : undefined,
    seriesId: prev?.seriesId,
    truck: str(v, 'truck'),
    trailer: str(v, 'trailer'),
    driver: str(v, 'driver'),
    load: str(v, 'load'),
    terminal: str(v, 'terminal'),
    method: str(v, 'method'),
    autopay: str(v, 'autopay') === 'Yes',
    scheduledFor: str(v, 'scheduledFor') || undefined,
    vendorEmail: str(v, 'vendorEmail'),
    vendorPhone: str(v, 'vendorPhone'),
    vendorAccount: str(v, 'vendorAccount'),
    remitTo: str(v, 'remitTo'),
    paid,
    void: prev?.void,
    notes: str(v, 'notes'),
    documents,
    created: prev?.created ?? new Date().toISOString(),
    updated: prev ? new Date().toISOString() : undefined,
  };
}

export function reviveBills(raw: unknown): BillRecord[] | null {
  return Array.isArray(raw) && raw.every((b) => b && typeof b.id === 'string' && typeof b.vendor === 'string' && typeof b.due === 'string')
    ? (raw as BillRecord[]).map((b) => ({ ...b, documents: Array.isArray(b.documents) ? b.documents : [] }))
    : null;
}

// — demo bills (RunTruck's own workspace only) —

const base = (b: Partial<BillRecord> & Pick<BillRecord, 'id' | 'vendor' | 'category' | 'amount' | 'issued' | 'terms' | 'due'>): BillRecord => ({
  billNumber: '', description: '', truck: '', trailer: '', driver: '', load: '', terminal: '', method: 'ACH', autopay: false,
  vendorEmail: '', vendorPhone: '', vendorAccount: '', remitTo: '', notes: '', documents: [], created: `${shiftIso('2026-08-01')}T12:00:00.000Z`,
  ...b,
});

const DEMO = (): BillRecord[] => [
  base({ id: 'BILL-1001', vendor: 'Verizon Connect ELD', billNumber: 'VZC-883104', category: 'ELD & telematics', description: 'ELD and GPS service, 6 units', amount: 486, issued: shiftIso('2026-08-14'), terms: 'Net 15', due: shiftIso('2026-08-28'), frequency: 'Monthly', method: 'Credit card', vendorEmail: 'billing@verizonconnect.example', vendorAccount: 'SUN-44107' }),
  base({ id: 'BILL-1002', vendor: 'Modesto Yard — Lease', billNumber: 'SEP-2026', category: 'Facilities & rent', description: 'Main yard lease', amount: 3900, issued: shiftIso('2026-08-25'), terms: 'Net 7', due: shiftIso('2026-09-01'), frequency: 'Monthly', terminal: 'Modesto, CA — main yard', method: 'ACH', paid: { date: shiftIso('2026-09-01'), amount: 3900, method: 'ACH', reference: 'ACH 55120' }, remitTo: 'Finch Road Properties, 2200 Finch Rd, Modesto, CA 95354' }),
  base({ id: 'BILL-1003', vendor: 'Comdata', billNumber: 'CD-2026-08', category: 'Fuel', description: 'Fuel card fees, August', amount: 215, issued: shiftIso('2026-08-31'), terms: 'Due on receipt', due: shiftIso('2026-09-02'), frequency: 'Monthly', method: 'Vendor auto-pay', autopay: true, paid: { date: shiftIso('2026-09-02'), amount: 215, method: 'Vendor auto-pay', reference: 'Auto-draft' } }),
  base({ id: 'BILL-1004', vendor: 'Bridgestone Commercial', billNumber: 'BC-771920', category: 'Tires', description: 'Steer tires, T-107', amount: 2380, issued: shiftIso('2026-08-05'), terms: 'Net 30', due: shiftIso('2026-09-04'), truck: 'T-107', vendorPhone: '(800) 555-0144' }),
  base({ id: 'BILL-1005', vendor: 'Pilot Flying J', billNumber: 'PFJ-90231', category: 'Fuel', description: 'Fleet fuel, weekly statement', amount: 8640, issued: shiftIso('2026-08-29'), terms: 'Net 7', due: shiftIso('2026-09-05'), frequency: 'Weekly', method: 'ACH' }),
  base({ id: 'BILL-1006', vendor: 'Valley Diesel & Turbo', billNumber: 'VDT-4418', category: 'Parts', description: 'Turbocharger, T-118', amount: 3980, issued: shiftIso('2026-08-25'), terms: 'Net 15', due: shiftIso('2026-09-08'), truck: 'T-118', driver: 'Tobias Frey', method: 'Check' }),
  base({ id: 'BILL-1007', vendor: 'Great West Casualty', billNumber: 'GWC-P-20931', category: 'Insurance', description: 'Auto liability and cargo premium', amount: 6210, issued: shiftIso('2026-08-27'), terms: 'Net 15', due: shiftIso('2026-09-10'), frequency: 'Monthly', autopay: true, scheduledFor: shiftIso('2026-09-10'), method: 'ACH' }),
  base({ id: 'BILL-1008', vendor: 'Ryder Trailer Lease', billNumber: 'RYD-55031', category: 'Trailer lease / rental', description: 'Two 53 ft reefers', amount: 4150, issued: shiftIso('2026-09-01'), terms: 'Net 15', due: shiftIso('2026-09-15'), frequency: 'Monthly', trailer: 'RF-27', scheduledFor: shiftIso('2026-09-15'), method: 'ACH' }),
];

export const BILL_SEED: BillRecord[] = !IS_DEMO ? [] : DEMO();

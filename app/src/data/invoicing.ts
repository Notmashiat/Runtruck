// Invoicing: invoices, batches and the billing queue (delivered loads with no
// invoice yet). Invoices are kept in AppShellContext (browser storage), so
// what is created, edited, emailed, batched and paid survives a reload.
// Dates are ISO strings ('2026-09-03'); "today" is the planner's.
import { CUSTOMERS, INVOICES, LOADS, USER, type Load } from './mock';
import { TODAY } from './planner';

export { TODAY };

// — dates —

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'Sep 3' → '2026-09-03'.
export function isoFromShort(s: string): string {
  const [mon, day] = s.split(' ');
  const m = MONTHS.indexOf(mon);
  return m < 0 ? '' : `2026-${String(m + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(iso: string, n: number): string {
  return new Date(utc(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysFrom(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

// '2026-09-03' → 'Sep 3, 2026' (or 'Sep 3' short).
export function fmtDate(iso: string | undefined, short = false): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return short ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

// — money —

export const round2 = (n: number) => Math.round(n * 100) / 100;

// 2450 → '$2,450.00'; negatives as '-$142.00'.
export function usd(n: number): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${s}`;
}

// 2450 → '$2,450' for tables and KPIs.
export function usd0(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

// — the carrier issuing the invoices —

export const COMPANY = {
  name: USER.company,
  legal: `${USER.company} LLC`,
  street: '2250 Finch Rd',
  city: 'Modesto',
  state: 'CA',
  zip: '95354',
  phone: '(209) 555-0100',
  email: 'billing@sunridgefreight.com',
  mc: 'MC 812044',
  dot: 'USDOT 2291176',
  remit: 'PO Box 1187, Modesto, CA 95353',
  bank: 'Valley Commerce Bank',
  accountLast4: '4417',
  lateFeePct: 1.5,
};

// — who gets billed —

export interface BillTo {
  name: string;
  attn: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
}

export const FACTORING = ['TriPoint Capital (factoring)'];

export const BILLING: Record<string, BillTo> = {
  'Northgate Foods': { name: 'Northgate Foods', attn: 'Accounts Payable · Dana Ruiz', street: '1200 N Blackstone Ave', city: 'Fresno', state: 'CA', zip: '93703', email: 'ap@northgatefoods.example', phone: '(559) 555-0101' },
  'Bayline Distribution': { name: 'Bayline Distribution', attn: 'Owen Petrakis, Payables', street: '455 W Weber Ave', city: 'Stockton', state: 'CA', zip: '95203', email: 'payables@bayline.example', phone: '(209) 555-0130' },
  'Cascade Building Supply': { name: 'Cascade Building Supply', attn: 'Marta Lind, Accounts Payable', street: '9100 Folsom Blvd', city: 'Sacramento', state: 'CA', zip: '95826', email: 'ap@cascadebuild.example', phone: '(916) 555-0110' },
  'Harbor Point Retail': { name: 'Harbor Point Retail', attn: 'Jules Amari, Freight Payables', street: '1 Harbor Point Plaza', city: 'Oakland', state: 'CA', zip: '94607', email: 'invoices@harborpoint.example', phone: '(510) 555-0150' },
  'Sierra Ag Partners': { name: 'Sierra Ag Partners', attn: 'Ben Okafor, Accounting', street: '4300 Kiernan Ave', city: 'Modesto', state: 'CA', zip: '95356', email: 'accounting@sierraag.example', phone: '(209) 555-0160' },
  'Vantage Home Goods': { name: 'Vantage Home Goods', attn: 'Iris Chen, Accounts Payable', street: '2750 Lakeside Dr', city: 'Reno', state: 'NV', zip: '89509', email: 'ap@vantagehome.example', phone: '(775) 555-0170' },
  'TriPoint Capital (factoring)': { name: 'TriPoint Capital', attn: 'Client Services', street: '800 Main St, Suite 400', city: 'Dallas', state: 'TX', zip: '75202', email: 'submissions@tripointcapital.example', phone: '(214) 555-0190' },
};

export const BLANK_BILL_TO: BillTo = { name: '', attn: '', street: '', city: '', state: '', zip: '', email: '', phone: '' };

export function billToFor(customer: string): BillTo {
  return BILLING[customer] ? { ...BILLING[customer] } : { ...BLANK_BILL_TO, name: customer };
}

export function termsFor(customer: string): string {
  return CUSTOMERS.find((c) => c.name === customer)?.terms ?? 'Net 30';
}

// — invoices —

export const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];
export const termDays = (terms: string) => (terms === 'Due on receipt' ? 0 : Number(terms.replace(/\D/g, '')) || 30);

export const CHARGE_TYPES = [
  'Line haul', 'Fuel surcharge', 'Detention', 'Lumper', 'Layover', 'Stop-off', 'TONU', 'Driver assist', 'Tarp', 'Accessorial', 'Late fee', 'Discount',
];
export const PAY_METHODS = ['ACH', 'Check', 'Factoring', 'Wire', 'Card'];

export interface InvoiceLine {
  kind: string;
  description: string;
  qty: string;
  rate: string;
}

export interface InvoiceEvent {
  date: string;
  text: string;
}

export interface InvoiceRecord {
  id: string;
  draft: boolean;
  customer: string;
  billTo: BillTo;
  loads: string[];
  ref: string;
  bol: string;
  route: string;
  pickup: string;
  delivery: string;
  equipment: string;
  commodity: string;
  weight: string;
  miles: string;
  issued: string;
  terms: string;
  due: string;
  lines: InvoiceLine[];
  memo: string;
  internal: string;
  sentOn?: string;
  sentTo?: string;
  paid?: { date: string; via: string; reference: string };
  history: InvoiceEvent[];
}

export type InvoiceStatus = 'Draft' | 'Unsent' | 'Sent' | 'Overdue' | 'Paid';

export const STATUS_TAG: Record<InvoiceStatus, string> = {
  Draft: 'tag-neutral', Unsent: 'tag-outline', Sent: 'tag-accent', Overdue: 'tag-outline', Paid: 'tag-green',
};

export const lineAmount = (l: InvoiceLine) => round2((Number(l.qty) || 0) * (Number(l.rate) || 0));
export const invoiceTotal = (inv: Pick<InvoiceRecord, 'lines'>) => round2(inv.lines.reduce((s, l) => s + lineAmount(l), 0));
export const lateFees = (inv: Pick<InvoiceRecord, 'lines'>) => round2(inv.lines.filter((l) => l.kind === 'Late fee').reduce((s, l) => s + lineAmount(l), 0));

export function statusOf(inv: InvoiceRecord): InvoiceStatus {
  if (inv.paid) return 'Paid';
  if (inv.draft) return 'Draft';
  if (inv.due && daysFrom(inv.due, TODAY) > 0) return 'Overdue';
  return inv.sentOn ? 'Sent' : 'Unsent';
}

export const daysPastDue = (inv: InvoiceRecord) => (inv.due ? Math.max(0, daysFrom(inv.due, TODAY)) : 0);

export function nextInvoiceId(invoices: InvoiceRecord[]): string {
  const n = Math.max(8845, ...invoices.map((i) => Number(i.id.replace(/\D/g, '')) || 0)) + 1;
  return `INV-${n}`;
}

// A rate as line haul plus fuel surcharge (12% of line haul), the way the
// rate confirmations quote it. Descriptions start with the load number, which
// is how a load's charges are found again when it is taken off an invoice.
export function rateLines(amount: number, route: string, miles: string): InvoiceLine[] {
  const haul = Math.round(amount / 1.12);
  return [
    { kind: 'Line haul', description: `${route}${miles ? ` · ${miles} mi` : ''}`, qty: '1', rate: String(haul) },
    { kind: 'Fuel surcharge', description: `${route.split(' · ')[0]} · FSC per rate confirmation (12%)`, qty: '1', rate: String(round2(amount - haul)) },
  ];
}

// — the billing queue —

export interface BillableLoad {
  id: string;
  customer: string;
  route: string;
  pickup: string;
  delivered: string;
  pod: 'Attached' | 'Missing';
  amount: number;
  ref: string;
  commodity: string;
  weight: string;
  miles: string;
  equipment: string;
}

// Delivered loads from before the current board; the dashboard counts on
// there being 11 of them worth $34,900.
const QUEUE: BillableLoad[] = [
  { id: 'L-40209', customer: 'Northgate Foods', route: 'Fresno, CA → Reno, NV', pickup: '2026-09-01', delivered: '2026-09-02', pod: 'Attached', amount: 2450, ref: 'PO 88-41195', commodity: 'Frozen produce', weight: '40,800 lb', miles: '478', equipment: 'Reefer, 53 ft' },
  { id: 'L-40208', customer: 'Bayline Distribution', route: 'Stockton, CA → Salt Lake City, UT', pickup: '2026-08-31', delivered: '2026-09-02', pod: 'Attached', amount: 3180, ref: 'PO 55-90102', commodity: 'Palletized dry goods', weight: '38,900 lb', miles: '736', equipment: 'Dry van, 53 ft' },
  { id: 'L-40207', customer: 'Cascade Building Supply', route: 'Sacramento, CA → Boise, ID', pickup: '2026-08-31', delivered: '2026-09-02', pod: 'Missing', amount: 2910, ref: 'SO 7729', commodity: 'Lumber', weight: '44,500 lb', miles: '602', equipment: 'Flatbed, tarped' },
  { id: 'L-40206', customer: 'Harbor Point Retail', route: 'Oakland, CA → Portland, OR', pickup: '2026-08-30', delivered: '2026-09-01', pod: 'Attached', amount: 3540, ref: 'PO 31-2266', commodity: 'Consumer goods', weight: '29,400 lb', miles: '632', equipment: 'Dry van, 53 ft' },
  { id: 'L-40204', customer: 'Vantage Home Goods', route: 'Stockton, CA → Las Vegas, NV', pickup: '2026-08-30', delivered: '2026-08-31', pod: 'Missing', amount: 2880, ref: 'VH-11820', commodity: 'Furniture', weight: '24,300 lb', miles: '538', equipment: 'Dry van, 53 ft' },
  { id: 'L-40203', customer: 'Northgate Foods', route: 'Bakersfield, CA → Phoenix, AZ', pickup: '2026-08-30', delivered: '2026-08-31', pod: 'Attached', amount: 1980, ref: 'PO 88-41170', commodity: 'Dairy', weight: '37,100 lb', miles: '389', equipment: 'Reefer, 53 ft' },
  { id: 'L-40205', customer: 'Sierra Ag Partners', route: 'Modesto, CA → Denver, CO', pickup: '2026-08-27', delivered: '2026-08-30', pod: 'Attached', amount: 4120, ref: 'SO 2209', commodity: 'Almonds', weight: '43,800 lb', miles: '1,142', equipment: 'Dry van, 53 ft' },
  { id: 'L-40202', customer: 'Bayline Distribution', route: 'Fresno, CA → Portland, OR', pickup: '2026-08-28', delivered: '2026-08-30', pod: 'Attached', amount: 3620, ref: 'PO 55-90087', commodity: 'Beverages', weight: '41,600 lb', miles: '748', equipment: 'Dry van, 53 ft' },
  { id: 'L-40201', customer: 'Cascade Building Supply', route: 'Redding, CA → Seattle, WA', pickup: '2026-08-28', delivered: '2026-08-29', pod: 'Attached', amount: 2760, ref: 'SO 7715', commodity: 'Steel coil', weight: '45,500 lb', miles: '578', equipment: 'Flatbed, 48 ft' },
  { id: 'L-40200', customer: 'Sierra Ag Partners', route: 'Modesto, CA → Salt Lake City, UT', pickup: '2026-08-26', delivered: '2026-08-28', pod: 'Missing', amount: 3050, ref: 'SO 2201', commodity: 'Walnuts', weight: '42,000 lb', miles: '712', equipment: 'Dry van, 53 ft' },
  { id: 'L-40199', customer: 'Vantage Home Goods', route: 'Sacramento, CA → Denver, CO', pickup: '2026-08-24', delivered: '2026-08-27', pod: 'Attached', amount: 4410, ref: 'VH-11791', commodity: 'Home goods', weight: '26,800 lb', miles: '1,168', equipment: 'Dry van, 53 ft' },
];

const money = (s: string) => Number(s.replace(/[$,]/g, '')) || 0;

function fromBoard(l: Load): BillableLoad {
  return {
    id: l.id, customer: l.customer, route: l.route, pickup: isoFromShort(l.pickup), delivered: isoFromShort(l.delivery),
    pod: l.status === 'Needs POD' ? 'Missing' : 'Attached', amount: money(l.rate), ref: l.ref, commodity: l.commodity,
    weight: l.weight, miles: l.miles, equipment: l.equip,
  };
}

// Delivered loads with no invoice yet: the queue above plus delivered loads
// on the board, minus every load already on an invoice. Newest first.
export function billableLoads(loads: Load[], invoices: InvoiceRecord[]): BillableLoad[] {
  const invoiced = new Set(invoices.flatMap((i) => i.loads));
  const board = loads.filter((l) => l.status === 'Delivered' || l.status === 'Needs POD').map(fromBoard);
  const seen = new Set<string>();
  return [...board, ...QUEUE]
    .filter((l) => !invoiced.has(l.id) && !seen.has(l.id) && seen.add(l.id))
    .sort((a, b) => (a.delivered < b.delivered ? 1 : a.delivered > b.delivered ? -1 : 0));
}

// A new invoice for one or more delivered loads of the same customer.
export function draftForLoads(picked: BillableLoad[], id: string): InvoiceRecord {
  const first = picked[0];
  const customer = first?.customer ?? '';
  const terms = termsFor(customer);
  return {
    id, draft: true, customer, billTo: billToFor(customer), loads: picked.map((l) => l.id),
    ref: picked.map((l) => l.ref).filter(Boolean).join(', '), bol: '',
    route: first?.route ?? '', pickup: first?.pickup ?? '', delivery: picked.length ? picked[picked.length - 1].delivered : '',
    equipment: first?.equipment ?? '', commodity: first?.commodity ?? '', weight: first?.weight ?? '', miles: first?.miles ?? '',
    issued: TODAY, terms, due: addDays(TODAY, termDays(terms)),
    lines: picked.flatMap((l) => rateLines(l.amount, `${l.id} · ${l.route}`, l.miles)),
    memo: '', internal: '', history: [],
  };
}

// — demo invoices —

// Lanes of the older loads the seed invoices bill.
const SEED_LOADS: Record<string, { route: string; commodity: string; equipment: string; miles: string; weight: string; ref: string }> = {
  'L-40198': { route: 'Redding, CA → Seattle, WA', commodity: 'Steel coil', equipment: 'Flatbed, 48 ft', miles: '578', weight: '45,200 lb', ref: 'SO 7688' },
  'L-40197': { route: 'Stockton, CA → Las Vegas, NV', commodity: 'Furniture', equipment: 'Dry van, 53 ft', miles: '538', weight: '22,900 lb', ref: 'VH-11802' },
  'L-40196': { route: 'Redding, CA → Seattle, WA', commodity: 'Steel coil', equipment: 'Flatbed, 48 ft', miles: '578', weight: '46,000 lb', ref: 'SO 7702' },
  'L-40191': { route: 'Oakland, CA → Portland, OR', commodity: 'Consumer goods', equipment: 'Dry van, 53 ft', miles: '632', weight: '31,300 lb', ref: 'PO 31-2241' },
  'L-40190': { route: 'Modesto, CA → Salt Lake City, UT', commodity: 'Almonds', equipment: 'Dry van, 53 ft', miles: '712', weight: '43,100 lb', ref: 'SO 2188' },
  'L-40189': { route: 'Sacramento, CA → Reno, NV', commodity: 'Home goods', equipment: 'Dry van, 53 ft', miles: '132', weight: '18,400 lb', ref: 'VH-11766' },
  'L-40187': { route: 'Fresno, CA → Reno, NV', commodity: 'Frozen produce', equipment: 'Reefer, 53 ft', miles: '478', weight: '41,000 lb', ref: 'PO 88-41102' },
  'L-40183': { route: 'Stockton, CA → Salt Lake City, UT', commodity: 'Palletized dry goods', equipment: 'Dry van, 53 ft', miles: '736', weight: '39,200 lb', ref: 'PO 55-89840' },
  'L-40178': { route: 'Oakland, CA → Los Angeles, CA', commodity: 'Consumer goods', equipment: 'Dry van, 53 ft', miles: '372', weight: '27,800 lb', ref: 'PO 31-2197' },
  'L-40176': { route: 'Sacramento, CA → Boise, ID', commodity: 'Lumber', equipment: 'Flatbed, tarped', miles: '602', weight: '44,000 lb', ref: 'SO 7640' },
  'L-40172': { route: 'Stockton, CA → Phoenix, AZ', commodity: 'Furniture', equipment: 'Dry van, 53 ft', miles: '724', weight: '17,600 lb', ref: 'VH-11702' },
  'L-40168': { route: 'Modesto, CA → Denver, CO', commodity: 'Walnuts', equipment: 'Dry van, 53 ft', miles: '1,142', weight: '42,600 lb', ref: 'SO 2150' },
};

const SEED_INVOICES: { id: string; customer: string; load: string; issued: string; amount: string; status: string }[] = [
  ...INVOICES,
  { id: 'INV-8844', customer: 'Vantage Home Goods', load: 'L-40197', issued: 'Sep 2', amount: '$2,260', status: 'Sent' },
  { id: 'INV-8842', customer: 'Cascade Building Supply', load: 'L-40196', issued: 'Sep 1', amount: '$2,760', status: 'Sent' },
  { id: 'INV-8839', customer: 'Sierra Ag Partners', load: 'L-40190', issued: 'Aug 29', amount: '$3,050', status: 'Paid' },
  { id: 'INV-8838', customer: 'Vantage Home Goods', load: 'L-40189', issued: 'Aug 28', amount: '$1,890', status: 'Paid' },
  { id: 'INV-8830', customer: 'Northgate Foods', load: 'L-40187', issued: 'Aug 18', amount: '$2,450', status: 'Paid' },
  { id: 'INV-8823', customer: 'Bayline Distribution', load: 'L-40183', issued: 'Aug 5', amount: '$3,180', status: 'Paid' },
  { id: 'INV-8821', customer: 'Harbor Point Retail', load: 'L-40178', issued: 'Jul 29', amount: '$2,180', status: 'Overdue' },
  { id: 'INV-8819', customer: 'Cascade Building Supply', load: 'L-40176', issued: 'Jul 15', amount: '$2,910', status: 'Overdue' },
  { id: 'INV-8815', customer: 'Vantage Home Goods', load: 'L-40172', issued: 'Jul 2', amount: '$1,590', status: 'Overdue' },
  { id: 'INV-8811', customer: 'Sierra Ag Partners', load: 'L-40168', issued: 'Jun 28', amount: '$3,860', status: 'Overdue' },
];

const PAID: Record<string, { date: string; via: string; reference: string }> = {
  'INV-8823': { date: '2026-09-03', via: 'Check', reference: 'Check #20417' },
  'INV-8824': { date: '2026-09-02', via: 'ACH', reference: 'ACH 0902-HPR-5521' },
  'INV-8830': { date: '2026-09-01', via: 'ACH', reference: 'ACH 0901-NGF-1180' },
  'INV-8838': { date: '2026-09-02', via: 'Factoring', reference: 'TriPoint advance B-2032' },
  'INV-8839': { date: '2026-09-01', via: 'Factoring', reference: 'TriPoint advance B-2032' },
};

// Reminders already sent on the past-due invoices.
const REMINDERS: Record<string, InvoiceEvent[]> = {
  'INV-8811': [
    { date: '2026-08-28', text: 'Reminder emailed to accounting@sierraag.example' },
    { date: '2026-09-01', text: 'Called Ben Okafor — promised payment by Sep 10' },
  ],
  'INV-8815': [{ date: '2026-08-05', text: 'Reminder emailed to ap@vantagehome.example' }, { date: '2026-08-20', text: 'Second reminder emailed and texted' }],
  'INV-8819': [{ date: '2026-09-01', text: 'Reminder emailed to ap@cascadebuild.example' }],
  'INV-8836': [{ date: '2026-08-25', text: 'Reminder emailed to accounting@sierraag.example' }],
};

function seedInvoice(s: (typeof SEED_INVOICES)[number]): InvoiceRecord {
  const board = LOADS.find((l) => l.id === s.load);
  const extra = SEED_LOADS[s.load];
  const issued = s.status === 'Draft' ? TODAY : isoFromShort(s.issued);
  // INV-8836 was issued on Net 30 before Sierra moved to Net 60.
  const terms = s.id === 'INV-8836' ? 'Net 30' : termsFor(s.customer);
  const delivery = board ? isoFromShort(board.delivery) : addDays(issued, -1);
  const route = board?.route ?? extra?.route ?? '';
  const miles = board?.miles ?? extra?.miles ?? '';
  const sent = s.status !== 'Draft';
  const email = billToFor(s.customer).email;
  const paid = PAID[s.id];
  return {
    id: s.id, draft: !sent, customer: s.customer, billTo: billToFor(s.customer), loads: [s.load],
    ref: board?.ref ?? extra?.ref ?? '', bol: sent ? `BOL ${s.load.replace('L-', '')}-1` : '',
    route, pickup: board ? isoFromShort(board.pickup) : addDays(delivery, -1), delivery,
    equipment: board?.equip ?? extra?.equipment ?? '', commodity: board?.commodity ?? extra?.commodity ?? '',
    weight: board?.weight ?? extra?.weight ?? '', miles,
    issued, terms, due: addDays(issued, termDays(terms)),
    lines: rateLines(money(s.amount), `${s.load} · ${route}`, miles),
    memo: '', internal: '',
    sentOn: sent ? issued : undefined, sentTo: sent ? email : undefined,
    paid,
    history: [
      { date: issued, text: sent ? 'Invoice created' : 'Draft started' },
      ...(sent ? [{ date: issued, text: `Emailed to ${email}` }] : []),
      ...(REMINDERS[s.id] ?? []),
      ...(paid ? [{ date: paid.date, text: `Payment received · ${paid.via} · ${paid.reference}` }] : []),
    ],
  };
}

export const INVOICE_SEED: InvoiceRecord[] = SEED_INVOICES.map(seedInvoice);

// — batches —

export interface Batch {
  id: string;
  created: string;
  recipient: string;
  method: string;
  invoiceIds: string[];
  sentOn?: string;
  notes: string;
}

export type BatchStatus = 'Ready' | 'Sent' | 'Settled';
export const BATCH_TAG: Record<BatchStatus, string> = { Ready: 'tag-outline', Sent: 'tag-accent', Settled: 'tag-green' };
export const BATCH_METHODS = ['Email to customer', 'Factoring portal upload', 'Customer AP portal', 'Mail'];

export function batchStatus(b: Batch, invoices: InvoiceRecord[]): BatchStatus {
  const members = invoices.filter((i) => b.invoiceIds.includes(i.id));
  if (members.length > 0 && members.every((i) => i.paid)) return 'Settled';
  return b.sentOn ? 'Sent' : 'Ready';
}

export function batchTotal(b: Batch, invoices: InvoiceRecord[]): number {
  return round2(invoices.filter((i) => b.invoiceIds.includes(i.id)).reduce((s, i) => s + invoiceTotal(i), 0));
}

export function nextBatchId(batches: Batch[]): string {
  const n = Math.max(2028, ...batches.map((b) => Number(b.id.replace(/\D/g, '')) || 0)) + 1;
  return `B-${n}`;
}

export const BATCH_SEED: Batch[] = [
  { id: 'B-2035', created: '2026-09-03', recipient: 'Cascade Building Supply', method: 'Customer AP portal', invoiceIds: ['INV-8842', 'INV-8829'], notes: 'Upload to the Cascade AP portal with PODs.' },
  { id: 'B-2034', created: '2026-09-02', recipient: 'TriPoint Capital (factoring)', method: 'Factoring portal upload', invoiceIds: ['INV-8844', 'INV-8841'], sentOn: '2026-09-02', notes: 'Advance expected within 24 hours.' },
  { id: 'B-2033', created: '2026-09-01', recipient: 'Bayline Distribution', method: 'Email to customer', invoiceIds: ['INV-8840'], sentOn: '2026-09-01', notes: '' },
  { id: 'B-2032', created: '2026-08-29', recipient: 'TriPoint Capital (factoring)', method: 'Factoring portal upload', invoiceIds: ['INV-8839', 'INV-8838'], sentOn: '2026-08-29', notes: '' },
  { id: 'B-2031', created: '2026-08-18', recipient: 'Northgate Foods', method: 'Email to customer', invoiceIds: ['INV-8830'], sentOn: '2026-08-18', notes: '' },
  { id: 'B-2030', created: '2026-08-07', recipient: 'Harbor Point Retail', method: 'Email to customer', invoiceIds: ['INV-8824'], sentOn: '2026-08-07', notes: '' },
  { id: 'B-2029', created: '2026-08-05', recipient: 'Bayline Distribution', method: 'Email to customer', invoiceIds: ['INV-8823'], sentOn: '2026-08-05', notes: '' },
];

// — messages —

export function invoiceEmail(inv: InvoiceRecord): { subject: string; body: string } {
  const total = usd(invoiceTotal(inv));
  return {
    subject: `Invoice ${inv.id} from ${COMPANY.name} — ${total} due ${fmtDate(inv.due)}`,
    body: [
      'Hello,',
      '',
      `Please find attached invoice ${inv.id} for load ${inv.loads.join(', ')}${inv.route ? ` (${inv.route.replace('→', 'to')})` : ''}.`,
      '',
      `Amount due: ${total}`,
      `Due date: ${fmtDate(inv.due)} (${inv.terms})`,
      inv.ref ? `Your reference: ${inv.ref}` : '',
      '',
      `Remit by ACH to ${COMPANY.bank}, account ending ${COMPANY.accountLast4}, or by check to ${COMPANY.legal}, ${COMPANY.remit}.`,
      '',
      'Thank you for your business,',
      `${USER.name}`,
      `${COMPANY.name} · ${COMPANY.phone} · ${COMPANY.email}`,
    ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n'),
  };
}

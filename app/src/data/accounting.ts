// Accounting mock data for Sunridge Freight: the money side of the loads in
// mock.ts. "Today" is Wednesday, September 3, 2026.
import { INVOICES, type Invoice } from './mock';

export const TODAY = 'Sep 3';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days from one short date ('Aug 28') to another ('Sep 3'), within 2026.
export function daysBetween(from: string, to: string): number {
  const at = (d: string) => {
    const [mon, day] = d.split(' ');
    return Date.UTC(2026, MONTHS.indexOf(mon), Number(day));
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

// '41 d' → 41; '—' → 0.
export function ageDays(age: string): number {
  return Number.parseInt(age, 10) || 0;
}

// '$2,450' → 2450; '-$142' → -142; '—' → 0.
export function dollars(s: string): number {
  return Number(s.replace(/[$,]/g, '')) || 0;
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export interface UninvoicedLoad {
  id: string;
  customer: string;
  route: string;
  delivered: string;
  pod: 'Attached' | 'Missing';
  amount: string;
  tagClass: string;
}

// Delivered loads with no invoice yet. The dashboard and the top-bar action
// count on there being 11 of them worth $34,900.
export const UNINVOICED: UninvoicedLoad[] = [
  { id: 'L-40209', customer: 'Northgate Foods', route: 'Fresno, CA → Reno, NV', delivered: 'Sep 2', pod: 'Attached', amount: '$2,450', tagClass: 'tag-green' },
  { id: 'L-40208', customer: 'Bayline Distribution', route: 'Stockton, CA → Salt Lake City, UT', delivered: 'Sep 2', pod: 'Attached', amount: '$3,180', tagClass: 'tag-green' },
  { id: 'L-40207', customer: 'Cascade Building Supply', route: 'Sacramento, CA → Boise, ID', delivered: 'Sep 2', pod: 'Missing', amount: '$2,910', tagClass: 'tag-outline' },
  { id: 'L-40206', customer: 'Harbor Point Retail', route: 'Oakland, CA → Portland, OR', delivered: 'Sep 1', pod: 'Attached', amount: '$3,540', tagClass: 'tag-green' },
  { id: 'L-40204', customer: 'Vantage Home Goods', route: 'Stockton, CA → Las Vegas, NV', delivered: 'Aug 31', pod: 'Missing', amount: '$2,880', tagClass: 'tag-outline' },
  { id: 'L-40203', customer: 'Northgate Foods', route: 'Bakersfield, CA → Phoenix, AZ', delivered: 'Aug 31', pod: 'Attached', amount: '$1,980', tagClass: 'tag-green' },
  { id: 'L-40205', customer: 'Sierra Ag Partners', route: 'Modesto, CA → Denver, CO', delivered: 'Aug 30', pod: 'Attached', amount: '$4,120', tagClass: 'tag-green' },
  { id: 'L-40202', customer: 'Bayline Distribution', route: 'Fresno, CA → Portland, OR', delivered: 'Aug 30', pod: 'Attached', amount: '$3,620', tagClass: 'tag-green' },
  { id: 'L-40201', customer: 'Cascade Building Supply', route: 'Redding, CA → Seattle, WA', delivered: 'Aug 29', pod: 'Attached', amount: '$2,760', tagClass: 'tag-green' },
  { id: 'L-40200', customer: 'Sierra Ag Partners', route: 'Modesto, CA → Salt Lake City, UT', delivered: 'Aug 28', pod: 'Missing', amount: '$3,050', tagClass: 'tag-outline' },
  { id: 'L-40199', customer: 'Vantage Home Goods', route: 'Sacramento, CA → Denver, CO', delivered: 'Aug 27', pod: 'Attached', amount: '$4,410', tagClass: 'tag-green' },
];

// Older invoices that round out mock.ts INVOICES so each status has a full
// table. Ages are days since issued, as of Sep 3.
export const INVOICES_EXTRA: Invoice[] = [
  { id: 'INV-8844', customer: 'Vantage Home Goods', load: 'L-40197', issued: 'Sep 2', amount: '$2,260', age: '1 d', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'INV-8842', customer: 'Cascade Building Supply', load: 'L-40196', issued: 'Sep 1', amount: '$2,760', age: '2 d', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'INV-8839', customer: 'Sierra Ag Partners', load: 'L-40190', issued: 'Aug 29', amount: '$3,050', age: '5 d', status: 'Paid', tagClass: 'tag-green' },
  { id: 'INV-8838', customer: 'Vantage Home Goods', load: 'L-40189', issued: 'Aug 28', amount: '$1,890', age: '6 d', status: 'Paid', tagClass: 'tag-green' },
  { id: 'INV-8830', customer: 'Northgate Foods', load: 'L-40187', issued: 'Aug 18', amount: '$2,450', age: '16 d', status: 'Paid', tagClass: 'tag-green' },
  { id: 'INV-8823', customer: 'Bayline Distribution', load: 'L-40183', issued: 'Aug 5', amount: '$3,180', age: '29 d', status: 'Paid', tagClass: 'tag-green' },
  { id: 'INV-8821', customer: 'Harbor Point Retail', load: 'L-40178', issued: 'Jul 29', amount: '$2,180', age: '36 d', status: 'Overdue', tagClass: 'tag-outline' },
  { id: 'INV-8819', customer: 'Cascade Building Supply', load: 'L-40176', issued: 'Jul 15', amount: '$2,910', age: '50 d', status: 'Overdue', tagClass: 'tag-outline' },
  { id: 'INV-8815', customer: 'Vantage Home Goods', load: 'L-40172', issued: 'Jul 2', amount: '$1,590', age: '63 d', status: 'Overdue', tagClass: 'tag-outline' },
  { id: 'INV-8811', customer: 'Sierra Ag Partners', load: 'L-40168', issued: 'Jun 28', amount: '$3,860', age: '67 d', status: 'Overdue', tagClass: 'tag-outline' },
];

export const ALL_INVOICES: Invoice[] = [...INVOICES, ...INVOICES_EXTRA];

export interface Payment {
  paid: string;
  via: 'ACH' | 'Check' | 'Factoring';
}

// How and when each paid invoice was settled, keyed by invoice id.
export const PAYMENTS: Partial<Record<string, Payment>> = {
  'INV-8823': { paid: 'Sep 3', via: 'Check' },
  'INV-8824': { paid: 'Sep 2', via: 'ACH' },
  'INV-8830': { paid: 'Sep 1', via: 'ACH' },
  'INV-8838': { paid: 'Sep 2', via: 'Factoring' },
  'INV-8839': { paid: 'Sep 1', via: 'Factoring' },
};

export interface Batch {
  id: string;
  created: string;
  invoices: number;
  total: string;
  sentTo: string;
  status: 'Ready' | 'Sent' | 'Settled';
  tagClass: string;
}

export const BATCHES: Batch[] = [
  { id: 'B-2035', created: 'Sep 3', invoices: 2, total: '$4,430', sentTo: 'Northgate Foods', status: 'Ready', tagClass: 'tag-accent' },
  { id: 'B-2034', created: 'Sep 2', invoices: 3, total: '$8,120', sentTo: 'Cascade Building Supply', status: 'Ready', tagClass: 'tag-accent' },
  { id: 'B-2033', created: 'Sep 1', invoices: 2, total: '$4,940', sentTo: 'TriPoint Capital (factoring)', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'B-2032', created: 'Aug 29', invoices: 4, total: '$11,310', sentTo: 'Bayline Distribution', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'B-2031', created: 'Aug 26', invoices: 3, total: '$7,670', sentTo: 'Harbor Point Retail', status: 'Sent', tagClass: 'tag-accent' },
  { id: 'B-2030', created: 'Aug 22', invoices: 5, total: '$14,230', sentTo: 'TriPoint Capital (factoring)', status: 'Settled', tagClass: 'tag-green' },
  { id: 'B-2029', created: 'Aug 19', invoices: 3, total: '$8,410', sentTo: 'Northgate Foods', status: 'Settled', tagClass: 'tag-green' },
];

export interface Bill {
  vendor: string;
  category: string;
  due: string;
  amount: string;
  status: 'Due' | 'Scheduled' | 'Paid' | 'Overdue';
  tagClass: string;
}

export const BILLS: Bill[] = [
  { vendor: 'Verizon Connect ELD', category: 'Telematics', due: 'Aug 28', amount: '$486', status: 'Overdue', tagClass: 'tag-outline' },
  { vendor: 'Modesto Yard — Lease', category: 'Facilities', due: 'Sep 1', amount: '$3,900', status: 'Paid', tagClass: 'tag-green' },
  { vendor: 'Comdata', category: 'Fuel card fees', due: 'Sep 2', amount: '$215', status: 'Paid', tagClass: 'tag-green' },
  { vendor: 'Bridgestone Commercial', category: 'Tires', due: 'Sep 4', amount: '$2,380', status: 'Due', tagClass: 'tag-outline' },
  { vendor: 'Pilot Flying J', category: 'Fuel', due: 'Sep 5', amount: '$8,640', status: 'Due', tagClass: 'tag-outline' },
  { vendor: 'Valley Diesel & Turbo', category: 'Parts · T-118 turbo', due: 'Sep 8', amount: '$3,980', status: 'Due', tagClass: 'tag-outline' },
  { vendor: 'Great West Casualty', category: 'Insurance', due: 'Sep 10', amount: '$6,210', status: 'Scheduled', tagClass: 'tag-accent' },
  { vendor: 'Ryder Trailer Lease', category: 'Equipment lease', due: 'Sep 15', amount: '$4,150', status: 'Scheduled', tagClass: 'tag-accent' },
];

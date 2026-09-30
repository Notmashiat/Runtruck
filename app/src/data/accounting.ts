// Accounting mock data for Sunridge Freight: bills and shared money helpers.
// Invoices and batches live in invoicing.ts. "Today" is September 3, 2026.

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

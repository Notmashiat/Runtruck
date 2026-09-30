// Safety & compliance mock data: maintenance work orders, driver qualification
// files, roadside violations and cargo/liability claims. Units, drivers and
// customers match data/mock.ts; "today" is Wed Sep 3, 2026.

// Amounts are stored as numbers so the KPIs can sum them; format at render time.
export function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export interface WorkOrder {
  unit: string;
  item: string;
  due: string; // a date, or an odometer reading for mileage-based service
  shop: string;
  estimate: number;
  status: 'Scheduled' | 'Due' | 'In shop' | 'Overdue' | 'Done';
  tagClass: string;
}

export const MAINTENANCE: WorkOrder[] = [
  { unit: 'T-118', item: 'Turbocharger replacement', due: 'Sep 5', shop: 'Sunridge shop · Modesto', estimate: 4850, status: 'In shop', tagClass: 'tag-outline' },
  { unit: 'FB-12', item: 'DOT annual inspection', due: 'Sep 3', shop: 'Sunridge shop · Modesto', estimate: 150, status: 'In shop', tagClass: 'tag-outline' },
  { unit: 'T-121', item: 'Brake adjustment', due: 'Aug 28', shop: 'Sunridge shop · Modesto', estimate: 420, status: 'Overdue', tagClass: 'tag-outline' },
  { unit: 'T-114', item: 'PM service A', due: '529,800 mi', shop: 'Sunridge shop · Modesto', estimate: 640, status: 'Due', tagClass: 'tag-outline' },
  { unit: 'RF-27', item: 'Reefer unit service', due: 'Sep 12', shop: 'Thermo King · Fresno', estimate: 710, status: 'Scheduled', tagClass: 'tag-accent' },
  { unit: 'T-107', item: 'DOT annual inspection', due: 'Sep 18', shop: 'Valley Truck Center · Stockton', estimate: 185, status: 'Scheduled', tagClass: 'tag-accent' },
  { unit: 'T-103', item: 'Tire rotation', due: '342,000 mi', shop: 'Sunridge shop · Modesto', estimate: 160, status: 'Scheduled', tagClass: 'tag-accent' },
  { unit: 'T-109', item: 'DOT annual inspection', due: 'Aug 22', shop: 'Valley Truck Center · Stockton', estimate: 185, status: 'Done', tagClass: 'tag-neutral' },
];

export interface Violation {
  date: string;
  driver: string;
  unit: string;
  type: string;
  severityPoints: number; // CSA severity weight
  location: string;
  status: 'Open' | 'Contested' | 'Closed';
  tagClass: string;
}

// All within the trailing 12 months, newest first.
export const VIOLATIONS: Violation[] = [
  { date: 'Aug 31', driver: 'Tobias Frey', unit: 'T-118', type: 'Log form & manner', severityPoints: 1, location: 'I-70 POE · Loma, CO', status: 'Open', tagClass: 'tag-outline' },
  { date: 'Aug 28', driver: 'Ellis Nakamura', unit: 'T-121', type: 'Brake adjustment', severityPoints: 4, location: 'I-5 scale · Cottonwood, CA', status: 'Open', tagClass: 'tag-outline' },
  { date: 'Aug 19', driver: 'Marcus Hale', unit: 'T-114', type: 'Hours-of-service', severityPoints: 7, location: 'US-95 POE · Winnemucca, NV', status: 'Contested', tagClass: 'tag-accent' },
  { date: 'Jul 30', driver: 'Dara Whitfield', unit: 'T-107', type: 'Lighting', severityPoints: 6, location: 'I-80 scale · Donner Pass, CA', status: 'Closed', tagClass: 'tag-neutral' },
  { date: 'Jun 12', driver: 'Tobias Frey', unit: 'T-118', type: 'Speeding 6–10 over', severityPoints: 4, location: 'I-70 · Grand Junction, CO', status: 'Closed', tagClass: 'tag-neutral' },
  { date: 'May 6', driver: 'Ellis Nakamura', unit: 'T-121', type: 'Log form & manner', severityPoints: 1, location: 'I-84 POE · Ontario, OR', status: 'Closed', tagClass: 'tag-neutral' },
  { date: 'Mar 18', driver: 'Ana Cortez', unit: 'T-109', type: 'Lighting', severityPoints: 6, location: 'I-5 scale · Ashland, OR', status: 'Closed', tagClass: 'tag-neutral' },
];

export interface Claim {
  id: string;
  date: string;
  driver: string;
  unit: string;
  type: 'Cargo damage' | 'Property damage' | 'Bodily injury' | 'Cargo shortage';
  claimant: string;
  reserved: number;
  paid: number;
  status: 'Open' | 'Under review' | 'Settled' | 'Denied';
  tagClass: string;
}

// Cargo and liability claims (not driver pay), newest first.
export const CLAIMS: Claim[] = [
  { id: 'CLM-1112', date: 'Aug 26', driver: 'Ellis Nakamura', unit: 'T-121 / FB-12', type: 'Cargo damage', claimant: 'Cascade Building Supply', reserved: 6800, paid: 0, status: 'Open', tagClass: 'tag-outline' },
  { id: 'CLM-1111', date: 'Aug 14', driver: 'Marcus Hale', unit: 'T-114 / RF-88', type: 'Cargo damage', claimant: 'Northgate Foods', reserved: 4200, paid: 0, status: 'Under review', tagClass: 'tag-accent' },
  { id: 'CLM-1110', date: 'Jul 22', driver: 'Dara Whitfield', unit: 'T-107 / DV-51', type: 'Property damage', claimant: 'Wasatch Crossdock', reserved: 2900, paid: 2650, status: 'Settled', tagClass: 'tag-green' },
  { id: 'CLM-1109', date: 'Jun 30', driver: 'Tobias Frey', unit: 'T-118 / DV-14', type: 'Cargo shortage', claimant: 'Sierra Ag Partners', reserved: 1450, paid: 0, status: 'Denied', tagClass: 'tag-neutral' },
  { id: 'CLM-1108', date: 'May 9', driver: 'Ana Cortez', unit: 'T-109 / FB-04', type: 'Bodily injury', claimant: 'Third party · R. Delgado', reserved: 25000, paid: 18500, status: 'Settled', tagClass: 'tag-green' },
  { id: 'CLM-1107', date: 'Mar 3', driver: 'Priya Raman', unit: 'T-103 / RF-27', type: 'Cargo damage', claimant: 'Northgate Foods', reserved: 3100, paid: 2875, status: 'Settled', tagClass: 'tag-green' },
];

// What the driver roster shows about each driver's work, worked out from the
// company's own records instead of typed in once and left to go stale: the
// load they are on now, the miles they delivered this week, and what they
// have been paid this year.
import { deliveryIso } from './loads';
import type { Load } from './mock';
import { mondayOf, paidSummary, type Employee, type PayRun } from './payroll';

export interface DriverStats {
  // 'L-40218 · Fresno → Reno', or '—' when not on a load.
  load: string;
  // Miles on loads delivered since Monday.
  miles: number;
  // Gross pay this year from pay runs; null when the driver is not on payroll.
  pay: number | null;
}

// The statuses of a load that is with its driver now, most urgent first.
const ON_A_LOAD = ['In transit', 'At pickup', 'Delayed', 'Dispatched'];

// The drivers on a load ('Marcus Hale', or a team as 'A / B').
export const driversOn = (l: Pick<Load, 'driver'>): string[] =>
  l.driver.split(' / ').map((n) => n.trim()).filter((n) => n && n !== 'Unassigned' && n !== '—');

const city = (place: string) => place.split(',')[0].trim();
const loadLabel = (l: Load) => `${l.id} · ${l.route.split(' → ').map(city).join(' → ')}`;
const milesOf = (l: Load) => Number(String(l.miles ?? '').replace(/,/g, '')) || 0;

// Every driver's figures by name, in one pass over the loads.
export function driverStats(loads: Load[], employees: Employee[], payRuns: PayRun[], today: string): Map<string, DriverStats> {
  const out = new Map<string, DriverStats & { rank: number }>();
  const at = (name: string) => {
    let s = out.get(name);
    if (!s) {
      s = { load: '—', miles: 0, pay: null, rank: ON_A_LOAD.length };
      out.set(name, s);
    }
    return s;
  };

  const monday = mondayOf(today);
  for (const l of loads) {
    const names = driversOn(l);
    if (!names.length) continue;
    const rank = ON_A_LOAD.indexOf(l.status);
    const delivered = l.status === 'Delivered' || l.status === 'Needs POD' ? deliveryIso(l) : '';
    for (const name of names) {
      const s = at(name);
      if (rank >= 0 && rank < s.rank) {
        s.rank = rank;
        s.load = loadLabel(l);
      }
      if (delivered && delivered >= monday && delivered <= today) s.miles += milesOf(l);
    }
  }

  const paid = paidSummary(payRuns, employees, today.slice(0, 4));
  for (const e of employees) {
    if (!e.driver) continue;
    const s = at(e.driver);
    s.pay = (s.pay ?? 0) + (paid.get(e.id)?.gross ?? 0);
  }
  return out;
}

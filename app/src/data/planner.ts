// Planner calendar data: the office's own events, plus pickups and deliveries
// derived from the loads so the calendar always matches the board.
import { addDays, fromIso, iso, shortToIso } from '../lib/dates';
import type { Load } from './mock';

// The mock data's "today" (the dashboard, loads and HR tabs all agree on it).
export const TODAY = '2026-09-03';
const YEAR = 2026;

export type CategoryKey = 'pickup' | 'delivery' | 'maintenance' | 'driver' | 'meeting' | 'admin';

export interface Category {
  key: CategoryKey;
  label: string;
  tone: string;
}

export const CATEGORIES: Category[] = [
  { key: 'pickup', label: 'Pickups', tone: 'amber' },
  { key: 'delivery', label: 'Deliveries', tone: 'green' },
  { key: 'maintenance', label: 'Maintenance', tone: 'red' },
  { key: 'driver', label: 'Driver schedule', tone: 'purple' },
  { key: 'meeting', label: 'Meetings', tone: 'blue' },
  { key: 'admin', label: 'Billing & admin', tone: 'teal' },
];

export interface PlannerEvent {
  id: string;
  title: string;
  category: CategoryKey;
  date: string;
  // All-day events have no start/end; they may span to endDate.
  endDate?: string;
  start?: string;
  end?: string;
  notes?: string;
  people?: string[];
  loadId?: string;
  // Derived from a load: shown, but edited on the load itself.
  readOnly?: boolean;
}

function weekdaysBetween(from: string, to: string, skip: string[]): string[] {
  const out: string[] = [];
  for (let d = fromIso(from); iso(d) <= to; d = addDays(d, 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6 && !skip.includes(iso(d))) out.push(iso(d));
  }
  return out;
}

const STANDUPS: PlannerEvent[] = weekdaysBetween('2026-08-24', '2026-09-30', ['2026-09-07']).map((date) => ({
  id: `standup-${date}`,
  title: 'Dispatch standup',
  category: 'meeting',
  date,
  start: '08:00',
  end: '08:30',
  notes: 'Board review: uncovered loads, HOS, delays.',
  people: ['Rosa Medina', 'Luis Ortega', 'Evan Brooks'],
}));

export const PLANNER_EVENTS: PlannerEvent[] = [
  ...STANDUPS,
  { id: 'ev-1', title: 'Tobias Frey — home time', category: 'driver', date: '2026-09-01', endDate: '2026-09-06', notes: 'Back on duty Mon Sep 7.', people: ['Tobias Frey'] },
  { id: 'ev-2', title: 'T-118 in shop — turbo', category: 'maintenance', date: '2026-09-02', endDate: '2026-09-05', notes: 'Sunridge shop · Modesto. Parts from Valley Diesel & Turbo.' },
  { id: 'ev-3', title: 'Payroll review — week of Sep 1', category: 'admin', date: '2026-09-01', start: '10:00', end: '11:00', notes: 'Approve driver settlements before Friday.', people: ['Rosa Medina'] },
  { id: 'ev-4', title: 'Invoice batch B-2034 review', category: 'admin', date: '2026-09-02', start: '14:00', end: '15:00', people: ['Rosa Medina'] },
  { id: 'ev-5', title: 'FB-12 DOT annual inspection', category: 'maintenance', date: '2026-09-03', start: '13:00', end: '15:00', notes: 'Sunridge shop · Modesto.', people: ['Luis Ortega'] },
  { id: 'ev-6', title: 'Road test — Sofia Nguyen', category: 'driver', date: '2026-09-04', start: '10:00', end: '11:30', notes: 'In T-103. Luis Ortega evaluates.', people: ['Sofia Nguyen', 'Luis Ortega'] },
  { id: 'ev-7', title: 'T-114 PM service A', category: 'maintenance', date: '2026-09-05', start: '07:00', end: '09:00', notes: 'Due at 529,800 mi.', people: ['Luis Ortega'] },
  { id: 'ev-8', title: 'Labor Day — office closed', category: 'admin', date: '2026-09-07' },
  { id: 'ev-9', title: 'Orientation — Jamal Reed', category: 'driver', date: '2026-09-08', start: '09:00', end: '12:00', notes: 'Paperwork, ELD training, yard walk.', people: ['Jamal Reed', 'Rosa Medina'] },
  { id: 'ev-10', title: 'Safety meeting — HOS refresher', category: 'meeting', date: '2026-09-08', start: '13:00', end: '14:00', people: ['Rosa Medina', 'Marcus Hale', 'Dara Whitfield', 'Ellis Nakamura', 'Priya Raman', 'Ana Cortez'] },
  { id: 'ev-11', title: 'Northgate Foods quarterly review', category: 'meeting', date: '2026-09-09', start: '11:00', end: '12:00', notes: 'With Dana Ruiz. On-time 96%, lane pricing for Q4.', people: ['Rosa Medina', 'Dana Ruiz'] },
  { id: 'ev-12', title: 'IFTA Q3 prep', category: 'admin', date: '2026-09-10', start: '15:00', end: '16:00' },
  { id: 'ev-13', title: 'Sierra Ag collections call', category: 'admin', date: '2026-09-11', start: '09:30', end: '10:30', notes: 'INV-8836, 41 days past due.', people: ['Rosa Medina', 'Ben Okafor'] },
  { id: 'ev-14', title: 'Marcus Hale — Clearinghouse query due', category: 'driver', date: '2026-09-20', people: ['Marcus Hale'] },
  { id: 'ev-15', title: 'Ana Cortez — MVR & annual review due', category: 'driver', date: '2026-09-24', people: ['Ana Cortez'] },
];

// One pickup and one delivery per load (every stop for loads entered with New Load).
export function loadEvents(loads: Load[]): PlannerEvent[] {
  return loads.flatMap((l) => {
    if (l.stops) {
      return l.stops.flatMap((s, i): PlannerEvent[] => {
        const [day, window = ''] = s.when.split(' · ');
        const date = shortToIso(day, YEAR);
        if (!date) return [];
        const [start, end] = window.includes('–') ? window.split('–') : ['08:00', '09:00'];
        return [{
          id: `load:${l.id}:${i}`, title: `${s.kind} · ${l.id}`, category: s.kind === 'Pickup' ? 'pickup' : 'delivery',
          date, start, end: end || start, notes: `${s.name} · ${l.customer}`, people: [l.driver], loadId: l.id, readOnly: true,
        }];
      });
    }
    const out: PlannerEvent[] = [];
    const p = shortToIso(l.pickup, YEAR);
    const d = shortToIso(l.delivery, YEAR);
    if (p) out.push({ id: `load:${l.id}:p`, title: `Pickup · ${l.id}`, category: 'pickup', date: p, start: '08:00', end: '10:00', notes: `${l.from} · ${l.customer}`, people: [l.driver], loadId: l.id, readOnly: true });
    if (d) out.push({ id: `load:${l.id}:d`, title: `Delivery · ${l.id}`, category: 'delivery', date: d, start: '10:00', end: '12:00', notes: `${l.to} · ${l.customer}`, people: [l.driver], loadId: l.id, readOnly: true });
    return out;
  });
}

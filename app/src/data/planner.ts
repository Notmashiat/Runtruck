// Planner calendar data: the office's own events, plus pickups and deliveries
// derived from the loads so the calendar always matches the board.
import { addDays, fromIso, iso } from '../lib/dates';
import { isoFromText, shiftDemo, shiftIso, todayIso } from '../lib/clock';
import type { Load } from './mock';
import { IS_DEMO } from '../lib/account';

// Today, in the time zone chosen in Settings (lib/clock.ts). Everything that
// asks "what day is it" — planner, dashboard, accounting, safety — uses this.
export const TODAY = todayIso();

// The colors a color code can use (classes t-<tone> in calendar.css).
export const TONES = ['amber', 'green', 'red', 'purple', 'blue', 'teal', 'pink', 'orange', 'indigo', 'slate'];

// A color code: what one color means on the calendar. Users rename, recolor,
// add and delete them; the two locked ones are fed by the load board.
export interface Category {
  key: string;
  label: string;
  tone: string;
  locked?: boolean;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'pickup', label: 'Loaded (pickup)', tone: 'amber', locked: true },
  { key: 'delivery', label: 'Empty (delivery)', tone: 'green', locked: true },
  { key: 'maintenance', label: 'Maintenance', tone: 'red' },
  { key: 'driver', label: 'Driver schedule', tone: 'purple' },
  { key: 'meeting', label: 'Meetings', tone: 'blue' },
  { key: 'admin', label: 'Billing & admin', tone: 'teal' },
];

export interface PlannerEvent {
  id: string;
  title: string;
  category: string;
  date: string;
  // All-day events have no start/end; they may span to endDate.
  endDate?: string;
  start?: string;
  end?: string;
  // "City, ST" — what the event cards lead with by default.
  place?: string;
  notes?: string;
  people?: string[];
  loadId?: string;
  facility?: string;
  customer?: string;
  driver?: string;
  truck?: string;
  commodity?: string;
  // Derived from a load: shown, but edited on the load itself.
  readOnly?: boolean;
}

// — calendar preferences (Customize) —

export type CalView = 'Day' | 'Week' | 'Month';
export type Density = 'Compact' | 'Comfortable' | 'Spacious';
export const ROW_H: Record<Density, number> = { Compact: 40, Comfortable: 56, Spacious: 76 };

// What colors the load board's stops: their stop type (the Loaded / Empty
// color codes), or one color per driver, customer or truck.
export type ColorBy = 'type' | 'driver' | 'customer' | 'truck';

// What an event card can show on each of its lines.
export type CardField = 'place' | 'title' | 'category' | 'time' | 'load' | 'driver' | 'truck' | 'customer' | 'facility' | 'commodity' | 'none';
export const CARD_FIELDS: [CardField, string][] = [
  ['place', 'City, state'],
  ['category', 'Color code name'],
  ['time', 'Time'],
  ['load', 'Load #'],
  ['driver', 'Driver'],
  ['truck', 'Truck / trailer'],
  ['customer', 'Customer'],
  ['facility', 'Facility'],
  ['commodity', 'Commodity'],
  ['title', 'Event title'],
  ['none', 'Nothing'],
];

export interface Prefs {
  view: CalView;
  weekStart: number;
  showWeekends: boolean;
  dayStart: number;
  dayEnd: number;
  density: Density;
  hour24: boolean;
  // Colour-code keys, or "<colorBy>:<value>" keys, that are switched off.
  hidden: string[];
  colorBy: ColorBy;
  // "<colorBy>:<value>" → tone, for colors the user picked by hand.
  valueTones: Record<string, string>;
  cardLines: CardField[];
}

export const DEFAULT_PREFS: Prefs = {
  view: 'Week', weekStart: 1, showWeekends: true, dayStart: 6, dayEnd: 20, density: 'Comfortable', hour24: false,
  hidden: [], colorBy: 'type', valueTones: {}, cardLines: ['place', 'time', 'load'],
};

// '1855 E Greg St, Sparks, NV 89431' → 'Sparks, NV'.
export function cityState(address: string): string {
  const parts = address.replace(/\s+\d{5}(-\d{4})?$/, '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(', ');
}

function weekdaysBetween(from: string, to: string, skip: string[]): string[] {
  const out: string[] = [];
  for (let d = fromIso(from); iso(d) <= to; d = addDays(d, 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6 && !skip.includes(iso(d))) out.push(iso(d));
  }
  return out;
}

// Weekday standups across the demo weeks (moved with the demo, still on weekdays).
const STANDUPS: PlannerEvent[] = weekdaysBetween(shiftIso('2026-08-24'), shiftIso('2026-09-30'), [shiftIso('2026-09-07')]).map((date) => ({
  id: `standup-${date}`,
  title: 'Dispatch standup',
  category: 'meeting',
  date,
  start: '08:00',
  end: '08:30',
  notes: 'Board review: uncovered loads, HOS, delays.',
  people: ['Rosa Medina', 'Luis Ortega', 'Evan Brooks'],
}));

const EVENTS_2026: PlannerEvent[] = [
  { id: 'ev-1', title: 'Tobias Frey — home time', category: 'driver', date: '2026-09-01', endDate: '2026-09-06', notes: 'Back on duty Mon Sep 7.', people: ['Tobias Frey'] },
  { id: 'ev-2', title: 'T-118 in shop — turbo', category: 'maintenance', date: '2026-09-02', endDate: '2026-09-05', notes: 'Sunridge shop · Modesto. Parts from Valley Diesel & Turbo.' },
  { id: 'ev-3', title: 'Payroll review — week of Sep 1', category: 'admin', date: '2026-09-01', start: '10:00', end: '11:00', notes: 'Approve driver settlements before Friday.', people: ['Rosa Medina'] },
  { id: 'ev-4', title: 'Invoice batch B-2034 review', category: 'admin', date: '2026-09-02', start: '14:00', end: '15:00', people: ['Rosa Medina'] },
  { id: 'ev-5', title: 'FB-12 DOT annual inspection', category: 'maintenance', date: '2026-09-03', start: '13:00', end: '15:00', notes: 'Sunridge shop · Modesto.', people: ['Luis Ortega'] },
  { id: 'ev-6', title: 'Road test — Sofia Nguyen', category: 'driver', date: '2026-09-04', start: '10:00', end: '11:30', notes: 'In T-103. Luis Ortega evaluates.', people: ['Sofia Nguyen', 'Luis Ortega'] },
  { id: 'ev-7', title: 'T-114 PM service A', category: 'maintenance', date: '2026-09-05', start: '07:00', end: '09:00', notes: 'Due at 529,800 mi.', people: ['Luis Ortega'] },
  { id: 'ev-8', title: 'Office closed — company day off', category: 'admin', date: '2026-09-07' },
  { id: 'ev-9', title: 'Orientation — Jamal Reed', category: 'driver', date: '2026-09-08', start: '09:00', end: '12:00', notes: 'Paperwork, ELD training, yard walk.', people: ['Jamal Reed', 'Rosa Medina'] },
  { id: 'ev-10', title: 'Safety meeting — HOS refresher', category: 'meeting', date: '2026-09-08', start: '13:00', end: '14:00', people: ['Rosa Medina', 'Marcus Hale', 'Dara Whitfield', 'Ellis Nakamura', 'Priya Raman', 'Ana Cortez'] },
  { id: 'ev-11', title: 'Northgate Foods quarterly review', category: 'meeting', date: '2026-09-09', start: '11:00', end: '12:00', notes: 'With Dana Ruiz. On-time 96%, lane pricing for Q4.', people: ['Rosa Medina', 'Dana Ruiz'] },
  { id: 'ev-12', title: 'IFTA Q3 prep', category: 'admin', date: '2026-09-10', start: '15:00', end: '16:00' },
  { id: 'ev-13', title: 'Sierra Ag collections call', category: 'admin', date: '2026-09-11', start: '09:30', end: '10:30', notes: 'INV-8836, 41 days past due.', people: ['Rosa Medina', 'Ben Okafor'] },
  { id: 'ev-14', title: 'Marcus Hale — Clearinghouse query due', category: 'driver', date: '2026-09-20', people: ['Marcus Hale'] },
  { id: 'ev-15', title: 'Ana Cortez — MVR & annual review due', category: 'driver', date: '2026-09-24', people: ['Ana Cortez'] },
];

const CLOCK = /^(\d{1,2}):(\d{2})$/;
const clock = (s: string) => {
  const m = CLOCK.exec(s.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

// A stop's appointment window ('08:00–10:00') as a start and an end on the
// calendar. A window with one time only ('14:30', or '14:30–') is shown as an
// hour from that time, not at 8 AM. A window that runs past midnight
// ('22:00–02:00') is shown to the end of its day. No time at all: 8 to 9 AM.
export function windowOf(window: string): [string, string] {
  const [a = '', b = ''] = window.split('–');
  const start = clock(a) || '08:00';
  const hourLater = `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')}:${Number(start.slice(0, 2)) >= 23 ? '59' : start.slice(3)}`;
  let end = clock(b) || hourLater;
  if (end <= start) end = '23:59';
  return [start, end];
}

// One pickup and one delivery per load (every stop for loads entered with New Load).
export function loadEvents(loads: Load[]): PlannerEvent[] {
  return loads.flatMap((l) => {
    const shared = {
      loadId: l.id, customer: l.customer, driver: l.driver, truck: l.unit === '—' ? '' : l.unit, commodity: l.commodity,
      people: [l.driver], readOnly: true,
    };
    if (l.stops) {
      return l.stops.flatMap((s, i): PlannerEvent[] => {
        const [day, window = ''] = s.when.split(' · ');
        const date = isoFromText(day);
        if (!date) return [];
        const [start, end] = windowOf(window);
        const place = cityState(s.address);
        return [{
          ...shared, id: `load:${l.id}:${i}`, title: `${l.id} · ${place}`, category: s.kind === 'Pickup' ? 'pickup' : 'delivery',
          date, start, end, place, facility: s.name, notes: `${s.name} · ${l.customer}`,
        }];
      });
    }
    // The mock loads only carry dates; spread their appointments over the
    // working day (stable per load number) instead of stacking them at 8 AM.
    const n = Number(l.id.slice(2)) || 0;
    const pHour = 6 + (n % 7) * 1.5;
    const dHour = 7 + ((n * 3) % 8) * 1.5;
    const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
    const out: PlannerEvent[] = [];
    const p = isoFromText(l.pickup);
    const d = isoFromText(l.delivery);
    const [fromPlace = '', toPlace = ''] = l.route.split(' → ');
    if (p) out.push({ ...shared, id: `load:${l.id}:p`, title: `${l.id} · ${fromPlace}`, category: 'pickup', date: p, start: hhmm(pHour), end: hhmm(pHour + 2), place: fromPlace, facility: l.from, notes: `${l.from} · ${l.customer}` });
    if (d) out.push({ ...shared, id: `load:${l.id}:d`, title: `${l.id} · ${toPlace}`, category: 'delivery', date: d, start: hhmm(dHour), end: hhmm(dHour + 2), place: toPlace, facility: l.to, notes: `${l.to} · ${l.customer}` });
    return out;
  });
}

// Demo records exist only in RunTruck's own workspace (Company ID 1); a client company starts empty.
export const PLANNER_EVENTS: PlannerEvent[] = !IS_DEMO ? [] : [...STANDUPS, ...shiftDemo(EVENTS_2026)];

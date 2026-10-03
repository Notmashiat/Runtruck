// What a load carries beyond what the board shows, and the rules that keep
// it consistent.
//
// The board, the planner and the load page show dates as short text
// ('Oct 1'). On their own those have no year, so every load also keeps its
// real dates (pickupDate, deliveryDate, each stop's date, and deliveredOn
// once it is delivered) as ISO 'YYYY-MM-DD'. normalizeLoad() rebuilds the
// short text from them every time loads are read, with the year added once
// it is not this year ('Dec 30, 2026'), so nothing that reads a load's
// dates can land in the wrong year.
import { isoFromText, shortDate } from '../lib/clock';
import type { BillDocument } from './bills';
import type { Load, LoadStop } from './mock';

// What the customer pays for a load, as entered on the Rates step.
export interface LoadCharges {
  lineHaul: number;
  fuel: number;
  accessorials: number;
}

// One entry in a load's history: who did what, and when (ISO time).
export interface LoadEvent {
  at: string;
  by: string;
  what: string;
}

// A document slot on a load ('Bill of lading'…): the file's name, and the
// stored file once it is attached through the attach popup.
export interface LoadDocument {
  name: string;
  file: string;
  doc?: BillDocument;
}

// The documents every load has a slot for.
export const DOCUMENT_SLOTS = ['Rate confirmation', 'Customer load tender', 'Bill of lading', 'Proof of delivery', 'Lumper receipt'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown): string => (typeof v === 'string' && ISO.test(v) ? v : '');
const dollars = (s: string) => Number(String(s ?? '').replace(/[^0-9.-]/g, '')) || 0;

// — status —

// The life of a load, in order. 'Delayed' can happen anywhere on the road.
export const LOAD_STATUSES = ['Needs driver', 'Dispatched', 'At pickup', 'In transit', 'Delayed', 'Needs POD', 'Delivered'] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];
export const LOAD_TAG: Record<string, string> = {
  'Needs driver': 'tag-outline', Dispatched: 'tag-neutral', 'At pickup': 'tag-neutral', 'In transit': 'tag-accent',
  Delayed: 'tag-outline', 'Needs POD': 'tag-outline', Delivered: 'tag-neutral',
};
// Delivered, whether or not the proof of delivery is in yet.
export const isDelivered = (status: string) => status === 'Delivered' || status === 'Needs POD';

// — the pipeline —

// The stages a load moves through from booking to payment (the bar at the
// top of the Loads page). The first four follow the load's status; the last
// two follow its invoice.
export const LOAD_STAGES = ['Booked', 'Dispatched', 'En route', 'Delivered', 'Invoiced', 'Complete'] as const;
export type LoadStage = (typeof LOAD_STAGES)[number];

// 'En route' → 'en-route', for the page address (?stage=en-route).
export const stageSlug = (s: LoadStage) => s.toLowerCase().replace(/\s+/g, '-');

// How each load stands with billing: on an invoice that is sent but not all
// paid ('invoiced'), or on invoices that are all paid ('paid'). Draft
// invoices do not count: the load is still waiting to be billed.
export function billingByLoad(invoices: { loads: string[]; draft: boolean; paid?: unknown }[]): Map<string, 'invoiced' | 'paid'> {
  const out = new Map<string, 'invoiced' | 'paid'>();
  for (const inv of invoices) {
    if (inv.draft) continue;
    for (const id of inv.loads) {
      if (!inv.paid) out.set(id, 'invoiced');
      else if (!out.has(id)) out.set(id, 'paid');
    }
  }
  return out;
}

// The stage a load is at.
export function stageOf(l: Pick<Load, 'id' | 'status'>, billing: Map<string, 'invoiced' | 'paid'>): LoadStage {
  const billed = billing.get(l.id);
  if (billed === 'paid') return 'Complete';
  if (billed === 'invoiced') return 'Invoiced';
  if (isDelivered(l.status)) return 'Delivered';
  if (l.status === 'Dispatched') return 'Dispatched';
  if (l.status === 'At pickup' || l.status === 'In transit' || l.status === 'Delayed') return 'En route';
  return 'Booked';
}

// — reading a load —

// The day a load was picked up / delivered (ISO; '' if unknown). A delivered
// load answers with the day it was actually delivered.
export const pickupIso = (l: Pick<Load, 'pickup' | 'pickupDate'>): string => iso(l.pickupDate) || isoFromText(l.pickup);
export const deliveryIso = (l: Pick<Load, 'delivery' | 'deliveryDate' | 'deliveredOn'>): string => iso(l.deliveredOn) || iso(l.deliveryDate) || isoFromText(l.delivery);

// The line haul (what mileage rates and percentage pay are worked out on).
export const lineHaulOf = (l: Pick<Load, 'rate' | 'charges'>): number => l.charges?.lineHaul ?? dollars(l.rate);

// Everything the customer pays: line haul, fuel surcharge and accessorials.
export const loadTotal = (l: Pick<Load, 'rate' | 'charges'>): number =>
  l.charges ? l.charges.lineHaul + l.charges.fuel + l.charges.accessorials : dollars(l.rate);

// The files attached to a load (for keeping them in storage).
export const loadFiles = (l: Pick<Load, 'documents'>): BillDocument[] => (l.documents ?? []).flatMap((d) => (d.doc ? [d.doc] : []));

// — keeping a load consistent —

interface FormShape {
  stops?: { date?: unknown }[];
  lineHaul?: unknown;
  fuel?: unknown;
  accessorials?: unknown;
}

// Fill in what older loads did not store (real dates, the full charges) from
// what they do have, and rebuild the short date text from the real dates.
export function normalizeLoad(l: Load): Load {
  const form = (l.form && typeof l.form === 'object' ? l.form : {}) as FormShape;
  const formDates = Array.isArray(form.stops) ? form.stops.map((s) => iso(s?.date)) : [];

  const stops: LoadStop[] | undefined = Array.isArray(l.stops)
    ? l.stops.map((s, i) => {
        const [day = '', ...rest] = String(s.when ?? '').split(' · ');
        const date = iso(s.date) || formDates[i] || isoFromText(day);
        return date ? { ...s, date, when: [shortDate(date), ...rest].join(' · ') } : s;
      })
    : undefined;
  const first = stops?.find((s) => s.kind === 'Pickup') ?? stops?.[0];
  const last = stops ? [...stops].reverse().find((s) => s.kind === 'Delivery') ?? stops[stops.length - 1] : undefined;

  const pickupDate = iso(l.pickupDate) || iso(first?.date) || isoFromText(l.pickup);
  const deliveryDate = iso(l.deliveryDate) || iso(last?.date) || isoFromText(l.delivery);
  const shown = iso(l.deliveredOn) || deliveryDate;

  const num = (v: unknown) => Number(v) || 0;
  const charges: LoadCharges | undefined = l.charges
    ?? (form.lineHaul !== undefined ? { lineHaul: num(form.lineHaul), fuel: num(form.fuel), accessorials: num(form.accessorials) } : undefined);

  return {
    ...l,
    ...(stops ? { stops } : {}),
    ...(pickupDate ? { pickupDate, pickup: shortDate(pickupDate) } : {}),
    ...(deliveryDate ? { deliveryDate } : {}),
    ...(shown ? { delivery: shortDate(shown) } : {}),
    ...(charges ? { charges } : {}),
  };
}

// A load given a new status (and the day it was delivered, when it is).
export function withStatus(l: Load, status: LoadStatus, by: string, deliveredOn?: string, note = ''): Load {
  const event: LoadEvent = { at: new Date().toISOString(), by, what: `Status: ${l.status} → ${status}${note.trim() ? ` · ${note.trim()}` : ''}` };
  return normalizeLoad({
    ...l,
    status,
    tagClass: LOAD_TAG[status] ?? 'tag-neutral',
    deliveredOn: isDelivered(status) ? iso(deliveredOn) || iso(l.deliveredOn) || undefined : undefined,
    history: [...(l.history ?? []), event],
  });
}

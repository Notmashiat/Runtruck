// RunTruck's own client register (Developer › Account manager and Clients):
// every company that uses RunTruck, its unique Company ID and its
// subscription. Creating a company creates no accounts; login accounts are
// assigned to a Company ID in Developer › Create account (data/accounts.ts).
import { isoDateAt } from '../lib/clock';
import type { FormValues } from './fleet';

export type Plan = 'Starter' | 'Growth' | 'Enterprise';
export type BillingCycle = 'Monthly' | 'Annual';
export type SubscriptionStatus = 'Active' | 'Trial' | 'Past due' | 'Paused' | 'Cancelled';

// The plans on the RunTruck pricing page.
export const PLANS: Record<Plan, { perTruck: number | null; fits: string; maxTrucks: number }> = {
  Starter: { perTruck: 39, fits: 'Up to 15 trucks', maxTrucks: 15 },
  Growth: { perTruck: 32, fits: '16–100 trucks', maxTrucks: 100 },
  Enterprise: { perTruck: null, fits: '100+ trucks, custom price', maxTrucks: Infinity },
};
export const PLAN_NAMES = Object.keys(PLANS) as Plan[];
export const CYCLES: BillingCycle[] = ['Monthly', 'Annual'];
export const STATUSES: SubscriptionStatus[] = ['Active', 'Trial', 'Past due', 'Paused', 'Cancelled'];
// A new company starts on a free trial or straight away as a paying client.
export const START_STATUSES: SubscriptionStatus[] = ['Trial', 'Active'];
export const TRIAL_DAYS = 14;

export const BUSINESS_TYPES = ['Motor carrier', 'Owner-operator', 'Freight broker', 'Carrier and broker', 'Private fleet (shipper)'];
// Business types that run their own trucks need a USDOT number.
export const RUNS_TRUCKS = ['Motor carrier', 'Owner-operator', 'Carrier and broker', 'Private fleet (shipper)'];
// Brokers need MC operating authority.
export const BROKERS = ['Freight broker', 'Carrier and broker'];
export const EQUIPMENT = ['Dry van', 'Reefer', 'Flatbed', 'Step deck', 'Tanker', 'Intermodal', 'Car hauler', 'Other'];
export const PAYMENT_METHODS = ['ACH bank transfer', 'Credit or debit card', 'Invoice (check or wire)'];
export const COMPANY_TIME_ZONES = [
  'Pacific Time (Los Angeles)', 'Mountain Time (Denver)', 'Arizona (Phoenix)', 'Central Time (Chicago)', 'Eastern Time (New York)',
  'Alaska Time (Anchorage)', 'Hawaii Time (Honolulu)',
];

export const STATUS_TAG: Record<SubscriptionStatus, string> = {
  Active: 'tag-green', Trial: 'tag-accent', 'Past due': 'tag-outline', Paused: 'tag-neutral', Cancelled: 'tag-neutral',
};

export interface ClientCompany {
  companyId: string;
  created: string;
  // Company
  name: string;
  legal: string;
  businessType: string;
  dot: string;
  mc: string;
  ein: string;
  scac: string;
  website: string;
  // Address
  street: string;
  city: string;
  state: string;
  zip: string;
  timeZone: string;
  phone: string;
  // Contacts
  contact: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  billingName: string;
  billingEmail: string;
  // Fleet
  trucks: number;
  trailers: number;
  drivers: number;
  equipment: string[];
  // Subscription
  plan: Plan;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  started: string;
  trialEnds: string;
  customPrice: number | null;
  paymentMethod: string;
  notes: string;
  // A deactivated company: none of its accounts can log in or get updates.
  deactivated?: { at: string; by: string; version?: string };
}

// The plan a fleet size fits.
export function planFor(trucks: number): Plan {
  return trucks <= PLANS.Starter.maxTrucks ? 'Starter' : trucks <= PLANS.Growth.maxTrucks ? 'Growth' : 'Enterprise';
}

// What a company pays a month (null = Enterprise with no price set yet).
export function monthlyPrice(c: ClientCompany): number | null {
  const per = PLANS[c.plan].perTruck;
  return per === null ? c.customPrice : per * c.trucks;
}

// Whether the company is billed now (trials, paused and cancelled are not).
export const isPaying = (c: ClientCompany) => !c.deactivated && (c.status === 'Active' || c.status === 'Past due');

// Monthly billing renews on the day of the month the subscription started;
// annual on its anniversary. A trial's next date is the day it ends.
export function billingDates(c: ClientCompany, today: string): { last: string; next: string } {
  if (c.status === 'Trial') return { last: '', next: c.trialEnds };
  if (!c.started || today < c.started) return { last: '', next: c.started };
  const day = Number(c.started.slice(8, 10));
  const at = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
  };
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  if (c.cycle === 'Annual') {
    const md = c.started.slice(4);
    const thisYear = `${y}${md}`;
    return thisYear <= today ? { last: thisYear, next: `${y + 1}${md}` } : { last: `${y - 1}${md}`, next: thisYear };
  }
  const thisMonth = at(y, m);
  return thisMonth <= today
    ? { last: thisMonth, next: m === 11 ? at(y + 1, 0) : at(y, m + 1) }
    : { last: m === 0 ? at(y - 1, 11) : at(y, m - 1), next: thisMonth };
}

export const todayInZone = () => isoDateAt(new Date());

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// — the Create company form —

const str = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const list = (v: FormValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
const count = (s: string) => Math.max(0, Math.round(Number(s) || 0));
const digits = (s: string) => s.replace(/\D/g, '');

export function blankCompanyForm(today: string): FormValues {
  return {
    name: '', legal: '', businessType: '', dot: '', mc: '', ein: '', scac: '', website: '',
    street: '', city: '', state: '', zip: '', timeZone: '', phone: '',
    contact: '', contactTitle: '', contactEmail: '', contactPhone: '', billingName: '', billingEmail: '',
    trucks: '', trailers: '', drivers: '', equipment: [],
    plan: '', customPrice: '', cycle: 'Monthly', status: 'Trial', started: today, trialEnds: today ? addDaysIso(today, TRIAL_DAYS) : '',
    paymentMethod: '', notes: '',
  };
}

export function companyToForm(c: ClientCompany): FormValues {
  return {
    name: c.name, legal: c.legal, businessType: c.businessType, dot: c.dot, mc: c.mc, ein: c.ein, scac: c.scac, website: c.website,
    street: c.street, city: c.city, state: c.state, zip: c.zip, timeZone: c.timeZone, phone: c.phone,
    contact: c.contact, contactTitle: c.contactTitle, contactEmail: c.contactEmail, contactPhone: c.contactPhone,
    billingName: c.billingName, billingEmail: c.billingEmail,
    trucks: String(c.trucks), trailers: c.trailers ? String(c.trailers) : '', drivers: c.drivers ? String(c.drivers) : '', equipment: [...c.equipment],
    plan: c.plan, customPrice: c.customPrice === null ? '' : String(c.customPrice), cycle: c.cycle, status: c.status,
    started: c.started, trialEnds: c.trialEnds, paymentMethod: c.paymentMethod, notes: c.notes,
  };
}

export function companyFromForm(v: FormValues, companyId: string, prev?: ClientCompany): ClientCompany {
  const plan = (str(v, 'plan') || 'Starter') as Plan;
  const status = (str(v, 'status') || 'Trial') as SubscriptionStatus;
  return {
    companyId,
    created: prev?.created ?? new Date().toISOString(),
    name: str(v, 'name'),
    legal: str(v, 'legal'),
    businessType: str(v, 'businessType'),
    dot: digits(str(v, 'dot')),
    mc: digits(str(v, 'mc')),
    ein: str(v, 'ein'),
    scac: str(v, 'scac').toUpperCase(),
    website: str(v, 'website'),
    street: str(v, 'street'),
    city: str(v, 'city'),
    state: str(v, 'state').toUpperCase(),
    zip: str(v, 'zip'),
    timeZone: str(v, 'timeZone'),
    phone: str(v, 'phone'),
    contact: str(v, 'contact'),
    contactTitle: str(v, 'contactTitle'),
    contactEmail: str(v, 'contactEmail'),
    contactPhone: str(v, 'contactPhone'),
    billingName: str(v, 'billingName'),
    billingEmail: str(v, 'billingEmail'),
    trucks: count(str(v, 'trucks')),
    trailers: count(str(v, 'trailers')),
    drivers: count(str(v, 'drivers')),
    equipment: list(v, 'equipment'),
    plan,
    cycle: (str(v, 'cycle') || 'Monthly') as BillingCycle,
    status,
    started: str(v, 'started'),
    trialEnds: status === 'Trial' ? str(v, 'trialEnds') : prev?.trialEnds ?? '',
    customPrice: plan === 'Enterprise' && str(v, 'customPrice') ? Number(str(v, 'customPrice')) : null,
    paymentMethod: str(v, 'paymentMethod'),
    notes: str(v, 'notes'),
    deactivated: prev?.deactivated,
  };
}

// A saved company read back from storage, with anything missing filled in.
export function reviveCompany(raw: unknown): ClientCompany | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ClientCompany>;
  if (typeof r.companyId !== 'string' || typeof r.name !== 'string') return null;
  const blank = companyFromForm(blankCompanyForm(''), r.companyId);
  return {
    ...blank,
    ...r,
    plan: PLAN_NAMES.includes(r.plan as Plan) ? r.plan : 'Starter',
    status: STATUSES.includes(r.status as SubscriptionStatus) ? r.status : 'Active',
    equipment: Array.isArray(r.equipment) ? r.equipment : [],
  } as ClientCompany;
}

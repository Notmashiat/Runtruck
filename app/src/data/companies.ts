// RunTruck's own client register (Developer › Account manager and Clients):
// every company that pays for RunTruck, its unique Company ID, its login
// accounts and its subscription.
import { COMPANY_ID, type AccountRole } from '../lib/account';
import { isoDateAt } from '../lib/clock';

export type Plan = 'Starter' | 'Growth' | 'Enterprise';
export type BillingCycle = 'Monthly' | 'Annual';
export type SubscriptionStatus = 'Active' | 'Trial' | 'Past due' | 'Paused' | 'Cancelled';

// The plans on the RunTruck pricing page.
export const PLANS: Record<Plan, { perTruck: number | null; fits: string }> = {
  Starter: { perTruck: 39, fits: 'Up to 15 trucks' },
  Growth: { perTruck: 32, fits: '15–100 trucks' },
  Enterprise: { perTruck: null, fits: '100+ trucks, annual agreement' },
};

export const STATUS_TAG: Record<SubscriptionStatus, string> = {
  Active: 'tag-green', Trial: 'tag-accent', 'Past due': 'tag-outline', Paused: 'tag-neutral', Cancelled: 'tag-neutral',
};

export interface LoginAccount {
  memberId: string;
  name: string;
  email: string;
  role: AccountRole;
  lastSignIn?: string;
}

export interface ClientCompany {
  companyId: string;
  name: string;
  legal: string;
  dot: string;
  mc: string;
  city: string;
  state: string;
  contact: string;
  email: string;
  phone: string;
  plan: Plan;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  started: string;
  paymentMethod: string;
  trucks: number;
  teamMembers: number;
  accounts: LoginAccount[];
}

// The plan a fleet size fits.
export function planFor(trucks: number): Plan {
  return trucks <= 15 ? 'Starter' : trucks <= 100 ? 'Growth' : 'Enterprise';
}

// What a company pays a month (null = custom Enterprise pricing).
export function monthlyPrice(c: ClientCompany): number | null {
  const per = PLANS[c.plan].perTruck;
  return per === null ? null : per * c.trucks;
}

// Monthly billing renews on the day of the month the subscription started.
export function billingDates(c: ClientCompany, today: string): { last: string; next: string } {
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

// The next Company ID Create company will issue (1 is RunTruck itself).
export function nextCompanyId(list: ClientCompany[]): string {
  return String(Math.max(Number(COMPANY_ID), ...list.map((c) => Number(c.companyId) || 0)) + 1);
}

// Every client company. None yet: this account is RunTruck's owner (Company
// ID 1), not a client. Create company will add them.
export const CLIENTS: ClientCompany[] = [];

export const todayInZone = () => isoDateAt(new Date());

// Figures worked out from the live records (loads, invoices), for the
// dashboard and the section summaries.
import type { Load } from './mock';
import { TODAY, addDays, billableLoads, invoiceTotal, lateFees, type InvoiceRecord } from './invoicing';

export interface Earned {
  ref: string;
  date: string;
  amount: number;
  miles: number;
  customer: string;
  route: string;
}

const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;

// Freight revenue is counted on the day a load is delivered: every invoice
// (its charges less any late fees, dated by delivery) plus delivered loads
// not invoiced yet (at their rate). Loads still on the road are not counted.
export function deliveredRevenue(loads: Load[], invoices: InvoiceRecord[]): Earned[] {
  const invoiced = invoices
    .filter((i) => i.delivery && i.delivery <= TODAY)
    .map((i) => ({ ref: i.id, date: i.delivery, amount: invoiceTotal(i) - lateFees(i), miles: num(i.miles), customer: i.customer, route: i.route }));
  const waiting = billableLoads(loads, invoices)
    .filter((l) => l.delivered && l.delivered <= TODAY)
    .map((l) => ({ ref: l.id, date: l.delivered, amount: l.amount, miles: num(l.miles), customer: l.customer, route: l.route }));
  return [...invoiced, ...waiting];
}

// Monday of the week an ISO date falls in.
export function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}

export const between = (list: Earned[], from: string, to: string) => list.filter((e) => e.date >= from && e.date <= to);
export const sum = (list: Earned[], key: 'amount' | 'miles' = 'amount') => list.reduce((s, e) => s + e[key], 0);

// 29700 → '$29.7K'; 1295000 → '$1.3M'.
export function compactUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

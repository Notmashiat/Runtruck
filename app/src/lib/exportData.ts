// What Settings › Export data can export: every table in RunTruck, as plain
// rows of text, with the date, driver, truck and customer each row is about
// (for the filters). Each set names the permission that opens it, so an
// account only ever sees the sets it has access to.
import { billStatus, type BillRecord } from '../data/bills';
import { driverDocuments } from '../data/compliance';
import type { Facility } from '../data/facilities';
import type { FleetDriver, FleetTrailer, FleetTruck, FormValues } from '../data/fleet';
import { CONTRACTS, ONBOARDING } from '../data/hr';
import { batchStatus, batchTotal, billableLoads, invoiceTotal, statusOf, usd, type Batch, type InvoiceRecord } from '../data/invoicing';
import { CUSTOMERS, SETTLEMENTS, type Load } from '../data/mock';
import { PLANNER_EVENTS, type PlannerEvent } from '../data/planner';
import { CLAIMS, MAINTENANCE, VIOLATIONS } from '../data/safety';
import { isoFromText } from './clock';
import { readScoped } from './account';

export interface ExportColumn {
  key: string;
  label: string;
  // Shown in the app's own table: ticked by default.
  main: boolean;
}

export interface ExportRow {
  values: Record<string, string>;
  date: string;
  drivers: string[];
  trucks: string[];
  customer: string;
  archived: boolean;
}

export interface ExportSet {
  key: string;
  label: string;
  group: string;
  perm: string;
  dateLabel?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export interface ExportSources {
  loads: Load[];
  drivers: FleetDriver[];
  trucks: FleetTruck[];
  trailers: FleetTrailer[];
  facilities: Facility[];
  invoices: InvoiceRecord[];
  batches: Batch[];
  bills: BillRecord[];
}

// '2026-10-01', 'Oct 1', 'Thu Oct 1 · 08:00' → '2026-10-01' ('' when there is no date).
const MONTHS = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}(, \d{4})?/;
export function toIso(v: string | undefined): string {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = MONTHS.exec(v);
  return m ? isoFromText(m[0]) : '';
}

// 'cdlExpiry' → 'CDL expiry'.
const ACRONYMS: Record<string, string> = {
  cdl: 'CDL', vin: 'VIN', dot: 'DOT', mc: 'MC', ein: 'EIN', hos: 'HOS', mvr: 'MVR', twic: 'TWIC', id: 'ID', zip: 'ZIP',
  pod: 'POD', rpm: 'RPM', fsc: 'FSC', eld: 'ELD', gvwr: 'GVWR', ifta: 'IFTA', irp: 'IRP', ssn: 'SSN', scac: 'SCAC', bol: 'BOL', po: 'PO',
};
export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(' ').filter(Boolean);
  return words.map((w, i) => ACRONYMS[w] ?? (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

const text = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return '';
  return String(v);
};

// [key, label, value, ticked by default (true unless false)]
// Placeholders that are not a driver or unit, so they are not offered as filters.
const NOBODY = ['Unassigned', '—', '-', 'TBD'];

type Main<T> = [key: string, label: string, get: (r: T) => unknown, main?: boolean][];

// A set from records: the main columns, then (unticked) every field of the
// records' full form ('details') not already shown.
function makeSet<T>(
  meta: Omit<ExportSet, 'columns' | 'rows'>,
  list: T[],
  main: Main<T>,
  about: (r: T) => Partial<Omit<ExportRow, 'values'>>,
  details?: (r: T) => FormValues | undefined,
): ExportSet {
  const mainKeys = new Set(main.map(([k]) => k));
  const extra: string[] = [];
  for (const r of list) {
    for (const [k, v] of Object.entries(details?.(r) ?? {})) {
      if (!mainKeys.has(k) && !extra.includes(k) && (typeof v === 'string' || Array.isArray(v))) extra.push(k);
    }
  }
  const columns: ExportColumn[] = [
    ...main.map(([key, label, , on]) => ({ key, label, main: on !== false })),
    ...extra.map((key) => ({ key, label: humanize(key), main: false })),
  ];
  const rows = list.map((r) => {
    const values: Record<string, string> = {};
    for (const [k, , get] of main) values[k] = text(get(r));
    const d = details?.(r) ?? {};
    for (const k of extra) values[k] = text(d[k]);
    const a = about(r);
    const real = (x: string) => Boolean(x) && !NOBODY.includes(x);
    return { values, date: a.date ?? '', drivers: (a.drivers ?? []).filter(real), trucks: (a.trucks ?? []).filter(real), customer: a.customer ?? '', archived: a.archived ?? false };
  });
  return { ...meta, columns, rows };
}

const units = (s: string) => s.split(/\s*\/\s*/).map((x) => x.trim()).filter((x) => x && x !== '—');
const money = (n: number) => usd(n);

function plannerEvents(): PlannerEvent[] {
  try {
    const raw = JSON.parse(readScoped('runtruck-planner-events') ?? 'null') as unknown;
    return Array.isArray(raw) ? (raw as PlannerEvent[]) : PLANNER_EVENTS;
  } catch {
    return PLANNER_EVENTS;
  }
}

export function buildExportSets(s: ExportSources): ExportSet[] {
  const { loads, drivers, trucks, trailers, facilities, invoices, batches, bills } = s;
  return [
    makeSet({ key: 'loads', label: 'Loads', group: 'Loads', perm: 'loads', dateLabel: 'pickup date' }, loads, [
      ['id', 'Load', (l) => l.id], ['status', 'Status', (l) => l.status], ['customer', 'Customer', (l) => l.customer], ['ref', 'Reference', (l) => l.ref],
      ['route', 'Route', (l) => l.route], ['pickup', 'Pickup', (l) => l.pickup], ['delivery', 'Delivery', (l) => l.delivery], ['driver', 'Driver', (l) => l.driver],
      ['unit', 'Truck / trailer', (l) => l.unit], ['carrier', 'Carrier', (l) => l.carrier], ['equip', 'Equipment', (l) => l.equip], ['commodity', 'Commodity', (l) => l.commodity],
      ['weight', 'Weight', (l) => l.weight], ['miles', 'Miles', (l) => l.miles], ['rate', 'Rate', (l) => l.rate],
      ['rpm', 'Rate per mile', (l) => l.rpm, false], ['pay', 'Driver pay', (l) => l.pay, false], ['margin', 'Margin', (l) => l.margin, false], ['temp', 'Temperature', (l) => l.temp, false],
      ['from', 'Shipper', (l) => l.from, false], ['fromAddr', 'Shipper address', (l) => l.fromAddr, false], ['to', 'Receiver', (l) => l.to, false], ['toAddr', 'Receiver address', (l) => l.toAddr, false],
      ['carrierMc', 'Carrier MC', (l) => l.carrierMc, false], ['carrierDot', 'Carrier DOT', (l) => l.carrierDot, false], ['notes', 'Notes', (l) => l.notes, false],
    ], (l) => ({ date: toIso(l.pickup), drivers: [l.driver], trucks: units(l.unit), customer: l.customer })),

    makeSet({ key: 'drivers', label: 'Drivers', group: 'Fleet', perm: 'fleet/drivers', dateLabel: 'hire date' }, drivers, [
      ['name', 'Driver', (d) => d.name], ['status', 'Status', (d) => d.status], ['unit', 'Truck', (d) => d.unit], ['load', 'Current load', (d) => d.load],
      ['hos', 'Hours left', (d) => d.hos], ['cdl', 'CDL expires', (d) => d.cdl], ['pay', 'Pay to date', (d) => d.pay], ['miles', 'Miles this week', (d) => d.miles],
    ], (d) => ({ date: toIso(text(d.details.hireDate)), drivers: [d.name], trucks: units(d.unit), archived: Boolean(d.archived) }), (d) => d.details),

    makeSet({ key: 'trucks', label: 'Trucks', group: 'Fleet', perm: 'fleet/trucks' }, trucks, [
      ['unit', 'Unit', (t) => t.unit], ['make', 'Make and year', (t) => t.make], ['plate', 'Plate', (t) => t.plate], ['driver', 'Driver', (t) => t.driver],
      ['odo', 'Odometer', (t) => t.odo], ['service', 'Next service', (t) => t.service], ['status', 'Status', (t) => t.status],
    ], (t) => ({ drivers: [t.driver === 'Unassigned' ? '' : t.driver], trucks: [t.unit], archived: Boolean(t.archived) }), (t) => t.details),

    makeSet({ key: 'trailers', label: 'Trailers', group: 'Fleet', perm: 'fleet/trailers' }, trailers, [
      ['unit', 'Unit', (t) => t.unit], ['kind', 'Type', (t) => t.kind], ['status', 'Status', (t) => t.status], ['where', 'Location', (t) => t.where],
    ], (t) => ({ trucks: [t.unit], archived: Boolean(t.archived) }), (t) => t.details),

    makeSet({ key: 'customers', label: 'Customers', group: 'CRM', perm: 'crm' }, CUSTOMERS, [
      ['name', 'Customer', (c) => c.name], ['contact', 'Contact', (c) => c.contact], ['loads', 'Loads', (c) => c.loads], ['revenue', 'Revenue', (c) => c.revenue],
      ['onTime', 'On time', (c) => c.onTime], ['terms', 'Terms', (c) => c.terms], ['ar', 'AR balance', (c) => c.ar], ['tier', 'Standing', (c) => c.tier],
    ], (c) => ({ customer: c.name })),

    makeSet({ key: 'facilities', label: 'Facilities', group: 'Facilities', perm: 'facilities' }, facilities, [
      ['name', 'Facility', (f) => f.name], ['type', 'Type', (f) => f.type], ['city', 'City', (f) => f.city], ['state', 'State', (f) => f.state], ['customer', 'Customer', (f) => f.customer],
    ], (f) => ({ customer: f.customer, archived: Boolean(f.archived) }), (f) => f.details),

    makeSet({ key: 'uninvoiced', label: 'Loads to invoice', group: 'Accounting', perm: 'accounting/uninvoiced', dateLabel: 'delivery date' }, billableLoads(loads, invoices), [
      ['id', 'Load', (l) => l.id], ['customer', 'Customer', (l) => l.customer], ['route', 'Route', (l) => l.route], ['pickup', 'Picked up', (l) => l.pickup],
      ['delivered', 'Delivered', (l) => l.delivered], ['pod', 'POD', (l) => l.pod], ['amount', 'Amount', (l) => money(l.amount)], ['ref', 'Reference', (l) => l.ref],
      ['commodity', 'Commodity', (l) => l.commodity], ['weight', 'Weight', (l) => l.weight], ['miles', 'Miles', (l) => l.miles], ['equipment', 'Equipment', (l) => l.equipment],
    ], (l) => ({ date: l.delivered, customer: l.customer, drivers: [loads.find((x) => x.id === l.id)?.driver ?? ''], trucks: units(loads.find((x) => x.id === l.id)?.unit ?? '') })),

    makeSet({ key: 'invoices', label: 'Invoices', group: 'Accounting', perm: 'accounting/invoiced', dateLabel: 'issue date' }, invoices, [
      ['id', 'Invoice', (i) => i.id], ['status', 'Status', (i) => statusOf(i)], ['customer', 'Customer', (i) => i.customer], ['loads', 'Loads', (i) => i.loads],
      ['ref', 'Reference', (i) => i.ref], ['issued', 'Issued', (i) => i.issued], ['terms', 'Terms', (i) => i.terms], ['due', 'Due', (i) => i.due],
      ['total', 'Total', (i) => money(invoiceTotal(i))], ['paidOn', 'Paid on', (i) => i.paid?.date],
      ['route', 'Route', (i) => i.route, false], ['bol', 'BOL', (i) => i.bol, false], ['pickup', 'Pickup', (i) => i.pickup, false], ['delivery', 'Delivery', (i) => i.delivery, false],
      ['equipment', 'Equipment', (i) => i.equipment, false], ['commodity', 'Commodity', (i) => i.commodity, false], ['weight', 'Weight', (i) => i.weight, false], ['miles', 'Miles', (i) => i.miles, false],
      ['billTo', 'Bill to', (i) => i.billTo.name, false], ['billEmail', 'Billing email', (i) => i.billTo.email, false], ['paidVia', 'Paid via', (i) => i.paid?.via, false], ['memo', 'Memo', (i) => i.memo, false],
    ], (i) => {
      const onLoads = loads.filter((l) => i.loads.includes(l.id));
      return { date: i.issued, customer: i.customer, drivers: onLoads.map((l) => l.driver), trucks: onLoads.flatMap((l) => units(l.unit)) };
    }),

    makeSet({ key: 'batches', label: 'Invoice batches', group: 'Accounting', perm: 'accounting/batches', dateLabel: 'created date' }, batches, [
      ['id', 'Batch', (b) => b.id], ['created', 'Created', (b) => b.created], ['recipient', 'Sent to', (b) => b.recipient], ['method', 'Method', (b) => b.method],
      ['invoices', 'Invoices', (b) => b.invoiceIds], ['status', 'Status', (b) => batchStatus(b, invoices)], ['total', 'Total', (b) => money(batchTotal(b, invoices))],
      ['sentOn', 'Sent on', (b) => b.sentOn], ['notes', 'Notes', (b) => b.notes],
    ], (b) => ({ date: b.created })),

    makeSet({ key: 'payroll', label: 'Driver settlements', group: 'Accounting', perm: 'accounting/payroll' }, SETTLEMENTS, [
      ['name', 'Driver', (x) => x.name], ['basis', 'Pay basis', (x) => x.basis], ['loads', 'Loads', (x) => x.loads], ['miles', 'Miles', (x) => x.miles],
      ['gross', 'Gross', (x) => x.gross], ['ded', 'Deductions', (x) => x.ded], ['net', 'Net', (x) => x.net], ['status', 'Status', (x) => x.status],
    ], (x) => ({ drivers: [x.name] })),

    makeSet({ key: 'bills', label: 'Bills', group: 'Accounting', perm: 'accounting/bills', dateLabel: 'due date' }, bills, [
      ['vendor', 'Vendor', (b) => b.vendor], ['billNumber', 'Vendor invoice #', (b) => b.billNumber], ['category', 'Category', (b) => b.category],
      ['description', 'What it is for', (b) => b.description], ['issued', 'Bill date', (b) => b.issued], ['due', 'Due', (b) => b.due],
      ['amount', 'Amount', (b) => money(b.amount)], ['status', 'Status', (b) => billStatus(b)], ['repeats', 'Repeats', (b) => b.frequency ?? 'One-time'],
      ['paidOn', 'Paid on', (b) => b.paid?.date],
      ['id', 'Bill', (b) => b.id, false], ['terms', 'Terms', (b) => b.terms, false], ['truck', 'Truck', (b) => b.truck, false], ['trailer', 'Trailer', (b) => b.trailer, false],
      ['driver', 'Driver', (b) => b.driver, false], ['load', 'Load', (b) => b.load, false], ['terminal', 'Terminal', (b) => b.terminal, false],
      ['method', 'Pay by', (b) => b.method, false], ['paidRef', 'Payment reference', (b) => b.paid?.reference, false], ['scheduledFor', 'Scheduled for', (b) => b.scheduledFor, false],
      ['vendorAccount', 'Account with vendor', (b) => b.vendorAccount, false], ['documents', 'Documents', (b) => b.documents.map((d) => d.name), false], ['notes', 'Notes', (b) => b.notes, false],
    ], (b) => ({ date: b.due, drivers: [b.driver], trucks: [b.truck, b.trailer].filter(Boolean) })),

    makeSet({ key: 'contracts', label: 'Employee contracts', group: 'HR', perm: 'hr/employee-contracts', dateLabel: 'start date' }, CONTRACTS, [
      ['employee', 'Employee', (c) => c.employee], ['role', 'Role', (c) => c.role], ['type', 'Type', (c) => c.type], ['start', 'Start', (c) => c.start],
      ['renews', 'Renews', (c) => c.renews], ['payBasis', 'Pay basis', (c) => c.payBasis], ['status', 'Status', (c) => c.status],
    ], (c) => ({ date: toIso(c.start), drivers: [c.employee] })),

    makeSet({ key: 'onboarding', label: 'Onboarding', group: 'HR', perm: 'hr/onboarding', dateLabel: 'start date' }, ONBOARDING, [
      ['candidate', 'Candidate', (o) => o.candidate], ['role', 'Role', (o) => o.role], ['stage', 'Stage', (o) => o.stage], ['started', 'Started', (o) => o.started],
      ['owner', 'Owner', (o) => o.owner], ['progress', 'Progress', (o) => `${o.progress}%`], ['nextStep', 'Next step', (o) => o.nextStep], ['docsPending', 'Documents pending', (o) => o.docsPending],
    ], (o) => ({ date: toIso(o.started), drivers: [o.candidate] })),

    makeSet({ key: 'maintenance', label: 'Maintenance', group: 'Safety', perm: 'safety/maintenance', dateLabel: 'due date' }, MAINTENANCE, [
      ['unit', 'Unit', (w) => w.unit], ['item', 'Work', (w) => w.item], ['due', 'Due', (w) => w.due], ['shop', 'Shop', (w) => w.shop],
      ['estimate', 'Estimate', (w) => money(w.estimate)], ['status', 'Status', (w) => w.status],
    ], (w) => ({ date: toIso(w.due), trucks: [w.unit] })),

    makeSet({ key: 'documents', label: 'Driver documents', group: 'Safety', perm: 'safety/driver-documents', dateLabel: 'expiry date' }, driverDocuments(drivers), [
      ['driver', 'Driver', (d) => d.driver], ['document', 'Document', (d) => d.document], ['date', 'Date', (d) => d.date], ['status', 'Status', (d) => d.status],
    ], (d) => ({ date: d.date, drivers: [d.driver] })),

    makeSet({ key: 'violations', label: 'Violations', group: 'Safety', perm: 'safety/violations', dateLabel: 'violation date' }, VIOLATIONS, [
      ['date', 'Date', (v) => v.date], ['driver', 'Driver', (v) => v.driver], ['unit', 'Unit', (v) => v.unit], ['type', 'Violation', (v) => v.type],
      ['severityPoints', 'Severity points', (v) => v.severityPoints], ['location', 'Location', (v) => v.location], ['status', 'Status', (v) => v.status],
    ], (v) => ({ date: toIso(v.date), drivers: [v.driver], trucks: units(v.unit) })),

    makeSet({ key: 'claims', label: 'Claims', group: 'Safety', perm: 'safety/settlements', dateLabel: 'claim date' }, CLAIMS, [
      ['id', 'Claim', (c) => c.id], ['date', 'Date', (c) => c.date], ['driver', 'Driver', (c) => c.driver], ['unit', 'Units', (c) => c.unit], ['type', 'Type', (c) => c.type],
      ['claimant', 'Claimant', (c) => c.claimant], ['reserved', 'Reserved', (c) => money(c.reserved)], ['paid', 'Paid', (c) => money(c.paid)], ['status', 'Status', (c) => c.status],
    ], (c) => ({ date: toIso(c.date), drivers: [c.driver], trucks: units(c.unit) })),

    makeSet({ key: 'planner', label: 'Planner events', group: 'Planner', perm: 'planner', dateLabel: 'event date' }, plannerEvents(), [
      ['title', 'Event', (e) => e.title], ['category', 'Category', (e) => e.category], ['date', 'Date', (e) => e.date], ['endDate', 'Ends', (e) => e.endDate],
      ['start', 'From', (e) => e.start], ['end', 'To', (e) => e.end], ['place', 'Place', (e) => e.place], ['driver', 'Driver', (e) => e.driver],
      ['truck', 'Truck', (e) => e.truck], ['customer', 'Customer', (e) => e.customer], ['loadId', 'Load', (e) => e.loadId], ['notes', 'Notes', (e) => e.notes],
    ], (e) => ({ date: e.date, drivers: [e.driver ?? ''], trucks: units(e.truck ?? ''), customer: e.customer ?? '' })),
  ];
}

export interface ExportFilters {
  from: string;
  to: string;
  drivers: string[];
  trucks: string[];
  customers: string[];
  contains: string;
  archived: boolean;
}

// The rows of a set that pass the filters. A filter only applies to sets
// whose rows carry that kind of information (a date range does not empty
// the Trucks list, for example).
export function filterRows(set: ExportSet, f: ExportFilters): ExportRow[] {
  const hasDates = Boolean(set.dateLabel);
  const hasDrivers = set.rows.some((r) => r.drivers.length);
  const hasTrucks = set.rows.some((r) => r.trucks.length);
  const hasCustomers = set.rows.some((r) => r.customer);
  const needle = f.contains.trim().toLowerCase();
  return set.rows.filter((r) => {
    if (!f.archived && r.archived) return false;
    if (hasDates && (f.from || f.to)) {
      if (!r.date || (f.from && r.date < f.from) || (f.to && r.date > f.to)) return false;
    }
    if (hasDrivers && f.drivers.length && !r.drivers.some((d) => f.drivers.includes(d))) return false;
    if (hasTrucks && f.trucks.length && !r.trucks.some((t) => f.trucks.includes(t))) return false;
    if (hasCustomers && f.customers.length && !f.customers.includes(r.customer)) return false;
    if (needle && !Object.values(r.values).some((v) => v.toLowerCase().includes(needle))) return false;
    return true;
  });
}

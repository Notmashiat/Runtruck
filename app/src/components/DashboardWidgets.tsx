import { canPath } from '../lib/auth';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import { isOpen as billOpen } from '../data/bills';
import { driverDocuments } from '../data/compliance';
import type { DashOptions, WidgetId } from '../data/dashboard';
import {
  TODAY, addDays, billableLoads, daysFrom, daysPastDue, fmtDate, invoiceTotal, isoFromShort, statusOf, usd0,
} from '../data/invoicing';
import { between, compactUsd, deliveredRevenue, mondayOf, sum, type Earned } from '../data/metrics';
import { ACTIVE_STATUSES, stopsOf } from '../data/mock';
import { matchesQuery } from '../lib/search';
import { getSettings, numSetting } from '../lib/settingsStore';
import type { AlertKey } from '../data/settings';
import { SortTh, useSort } from '../lib/tableTools';
import { Tag } from './Tag';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];

// '6h 20m' → 6.33 hours; off the clock ('—') never counts as low.
function hoursLeft(hos: string): number {
  const [h, m] = hos.split(' ').map((p) => parseInt(p, 10));
  return Number.isNaN(h) ? Infinity : h + (m || 0) / 60;
}

function groupBy(list: Earned[], key: (e: Earned) => string) {
  const map = new Map<string, { key: string; amount: number; miles: number; count: number }>();
  for (const e of list) {
    const k = key(e);
    if (!k) continue;
    const g = map.get(k) ?? { key: k, amount: 0, miles: 0, count: 0 };
    g.amount += e.amount;
    g.miles += e.miles;
    g.count += 1;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

// Everything the widgets show, worked out once per render from the records.
export function useDashboardData() {
  const { loads, invoices, drivers, trucks, trailers, bills, query } = useAppShell();
  const earned = deliveredRevenue(loads, invoices);
  const monday = mondayOf(TODAY);
  const active = loads.filter((l) => ACTIVE_STATUSES.includes(l.status));
  const unbilled = billableLoads(loads, invoices);
  const open = invoices.filter((i) => !i.draft && !i.paid);
  const overdue = open.filter((i) => statusOf(i) === 'Overdue');
  const docs = driverDocuments(drivers).filter((d) => d.status !== 'Valid');
  return {
    query,
    loads,
    invoices,
    earned,
    thisWeek: between(earned, monday, TODAY),
    lastWeek: between(earned, addDays(monday, -7), addDays(monday, -1)),
    active,
    unbilled,
    open,
    overdue,
    docs,
    drivers: drivers.filter((d) => !d.archived),
    trucks: trucks.filter((t) => !t.archived),
    trailers: trailers.filter((t) => !t.archived),
    bills: bills.filter(billOpen),
  };
}

export type DashData = ReturnType<typeof useDashboardData>;

export interface KpiView {
  kind: 'kpi';
  label: string;
  value: string;
  note: string;
  to: string;
}

export interface CardView {
  kind: 'card';
  title: string;
  action?: ReactNode;
  flush?: boolean;
  body: ReactNode;
}

// — the numbers —

export function kpiFor(id: WidgetId, d: DashData): KpiView | null {
  const n = (status: string) => d.active.filter((l) => l.status === status).length;
  switch (id) {
    case 'kpi-active':
      return { kind: 'kpi', label: 'Active loads', value: String(d.active.length), note: `${n('In transit') + n('At pickup')} rolling · ${n('Delayed')} delayed · ${n('Needs driver')} need a driver`, to: '/app/loads' };
    case 'kpi-revenue':
      return { kind: 'kpi', label: 'Revenue this week', value: compactUsd(sum(d.thisWeek)), note: `${d.thisWeek.length} deliveries since Mon · last week ${compactUsd(sum(d.lastWeek))}`, to: '/app/accounting/invoiced' };
    case 'kpi-rpm': {
      const miles = sum(d.thisWeek, 'miles');
      return { kind: 'kpi', label: 'Rate per mile', value: miles ? `$${(sum(d.thisWeek) / miles).toFixed(2)}` : '—', note: `${miles.toLocaleString('en-US')} loaded miles this week`, to: '/app/loads' };
    }
    case 'kpi-unbilled':
      return { kind: 'kpi', label: 'Unbilled loads', value: String(d.unbilled.length), note: `${usd0(d.unbilled.reduce((s, l) => s + l.amount, 0))} waiting`, to: '/app/accounting/uninvoiced' };
    case 'kpi-overdue':
      return { kind: 'kpi', label: 'Past-due AR', value: compactUsd(d.overdue.reduce((s, i) => s + invoiceTotal(i), 0)), note: `${d.overdue.length} invoices · ${new Set(d.overdue.map((i) => i.customer)).size} customers`, to: '/app/accounting/past-due' };
    case 'kpi-drivers': {
      const free = d.drivers.filter((x) => x.status === 'Available');
      return { kind: 'kpi', label: 'Drivers available', value: String(free.length), note: free.map((x) => x.name.split(' ')[0]).join(', ') || 'Nobody free', to: '/app/fleet/drivers' };
    }
    case 'kpi-trucks': {
      const running = d.trucks.filter((t) => t.status === 'In service');
      return { kind: 'kpi', label: 'Trucks in service', value: `${running.length}/${d.trucks.length}`, note: `${d.trucks.length - running.length} in shop or due for service`, to: '/app/fleet/trucks' };
    }
    case 'kpi-docs': {
      const expired = d.docs.filter((x) => x.status === 'Expired').length;
      return { kind: 'kpi', label: 'Docs to renew', value: String(d.docs.length), note: `${expired} expired · ${d.docs.length - expired} due soon`, to: '/app/safety/driver-documents' };
    }
    default:
      return null;
  }
}

// — cards —

interface AttentionItem {
  key: AlertKey;
  n: number;
  label: string;
  to: string;
  tone: 'red' | 'amber' | 'blue';
}

function Attention({ d }: { d: DashData }) {
  const n = (status: string) => d.active.filter((l) => l.status === status).length;
  const s = getSettings();
  const warnHours = numSetting(s.operations.hosWarnHours, 2);
  const oldDays = numSetting(s.operations.unbilledDays, 3);
  const all: AttentionItem[] = [
    { key: 'noDriver', n: n('Needs driver'), label: 'Loads without a driver', to: '/app/loads', tone: 'red' },
    { key: 'delayed', n: n('Delayed'), label: 'Delayed loads', to: '/app/loads', tone: 'red' },
    { key: 'pastDue', n: d.overdue.length, label: `Past-due invoices · ${usd0(d.overdue.reduce((s, i) => s + invoiceTotal(i), 0))}`, to: '/app/accounting/past-due', tone: 'red' },
    { key: 'docsExpired', n: d.docs.filter((x) => x.status === 'Expired' || x.status === 'Missing').length, label: 'Driver documents expired or missing', to: '/app/safety/driver-documents', tone: 'red' },
    { key: 'missingPod', n: d.unbilled.filter((l) => l.pod === 'Missing').length, label: 'Delivered loads missing a POD', to: '/app/accounting/uninvoiced', tone: 'amber' },
    { key: 'unbilledOld', n: d.unbilled.filter((l) => daysFrom(l.delivered, TODAY) > oldDays).length, label: `Delivered ${oldDays}+ days ago, not invoiced`, to: '/app/accounting/uninvoiced', tone: 'amber' },
    { key: 'docsExpiring', n: d.docs.filter((x) => x.status === 'Expiring').length, label: `Driver documents due within ${numSetting(s.operations.renewWindowDays, 60)} days`, to: '/app/safety/driver-documents', tone: 'amber' },
    { key: 'trucksShop', n: d.trucks.filter((t) => t.status !== 'In service').length, label: 'Trucks in the shop or due for service', to: '/app/fleet/trucks', tone: 'amber' },
    { key: 'lowHours', n: d.drivers.filter((x) => x.status === 'On duty' && hoursLeft(x.hos) < warnHours).length, label: `Drivers under ${warnHours} h of driving time`, to: '/app/fleet/drivers', tone: 'amber' },
    { key: 'drafts', n: d.invoices.filter((i) => i.draft).length, label: 'Draft invoices not issued', to: '/app/accounting/invoiced', tone: 'blue' },
  ];
  // Only what this account may open.
  const items = all.filter((i) => i.n > 0 && s.alerts[i.key] && canPath(i.to));
  if (items.length === 0) return <div className="dash-empty">All clear — nothing is waiting on anyone.</div>;
  return (
    <div className="dash-list">
      {items.map((i) => (
        <Link key={i.label} to={i.to} className="dash-attn">
          <span className={`dash-dot is-${i.tone}`} />
          <span className="dash-attn-label">{i.label}</span>
          <span className={`dash-count is-${i.tone}`}>{i.n}</span>
        </Link>
      ))}
    </div>
  );
}

function RevenueChart({ d, o }: { d: DashData; o: DashOptions }) {
  const days = Array.from({ length: o.revenueDays }, (_, i) => addDays(TODAY, i - o.revenueDays + 1));
  const points = days.map((date) => ({ date, total: sum(between(d.earned, date, date)) }));
  const top = Math.max(1, ...points.map((p) => p.total));
  const every = o.revenueDays <= 7 ? 1 : o.revenueDays <= 14 ? 2 : 5;
  const labels = (
    <div className="dash-axis" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map((p, i) => <span key={p.date}>{(points.length - 1 - i) % every === 0 ? (o.revenueDays <= 7 ? dayName(p.date) : fmtDate(p.date, true)) : ''}</span>)}
    </div>
  );
  if (o.chartStyle === 'Line') {
    const w = 100;
    const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
    const y = (v: number) => 38 - (v / top) * 34;
    const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.total).toFixed(2)}`).join(' ');
    return (
      <div className="dash-chart">
        <svg className="dash-line" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Revenue by day">
          <polygon points={`0,40 ${line} 100,40`} fill="var(--ui-primary-soft)" opacity="0.8" />
          <polyline points={line} fill="none" stroke="var(--ui-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {labels}
      </div>
    );
  }
  return (
    <div className="dash-chart">
      <div className="dash-bars" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`, gap: o.revenueDays > 14 ? 3 : 10 }}>
        {points.map((p) => (
          <div key={p.date} className="dash-bar-col" title={`${fmtDate(p.date)} · ${usd0(p.total)}`}>
            {o.chartValues && o.revenueDays <= 14 && <span className="dash-bar-value">{p.total ? compactUsd(p.total) : '—'}</span>}
            <div className="dash-bar" style={{ height: `${Math.max(2, (p.total / top) * 100)}%`, background: p.total === top ? 'var(--ui-primary)' : 'var(--ui-primary-soft)' }} />
          </div>
        ))}
      </div>
      {labels}
    </div>
  );
}

function Aging({ d }: { d: DashData }) {
  const buckets = [
    { label: 'Not due yet', tone: 'var(--ui-primary)', list: d.open.filter((i) => statusOf(i) !== 'Overdue') },
    { label: '1–30 days late', tone: 'var(--ui-amber)', list: d.overdue.filter((i) => daysPastDue(i) <= 30) },
    { label: '31–60 days late', tone: '#d9622b', list: d.overdue.filter((i) => daysPastDue(i) > 30 && daysPastDue(i) <= 60) },
    { label: '60+ days late', tone: 'var(--ui-red)', list: d.overdue.filter((i) => daysPastDue(i) > 60) },
  ].map((b) => ({ ...b, amount: b.list.reduce((s, i) => s + invoiceTotal(i), 0) }));
  const total = buckets.reduce((s, b) => s + b.amount, 0) || 1;
  return (
    <div className="dash-stack">
      <div className="dash-seg">
        {buckets.filter((b) => b.amount > 0).map((b) => <span key={b.label} style={{ width: `${(b.amount / total) * 100}%`, background: b.tone }} title={`${b.label} · ${usd0(b.amount)}`} />)}
      </div>
      <div className="dash-list">
        {buckets.map((b) => (
          <div key={b.label} className="dash-row">
            <span className="dash-dot" style={{ background: b.tone }} />
            <span className="dash-row-label">{b.label}</span>
            <span className="dash-row-meta">{b.list.length} inv.</span>
            <span className="dash-row-value">{usd0(b.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBars({ rows }: { rows: { key: string; value: number; label: string; meta?: string }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <div className="dash-empty">Nothing delivered in this period.</div>;
  return (
    <div className="dash-list">
      {rows.map((r) => (
        <div key={r.key} className="dash-hbar">
          <div className="dash-hbar-top">
            <span className="dash-row-label">{r.key}</span>
            {r.meta && <span className="dash-row-meta">{r.meta}</span>}
            <span className="dash-row-value">{r.label}</span>
          </div>
          <div className="dash-hbar-track"><span style={{ width: `${(r.value / top) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function byCustomerRange(o: DashOptions): [string, string] {
  if (o.customerPeriod === 'This week') return [mondayOf(TODAY), TODAY];
  if (o.customerPeriod === 'Last 30 days') return [addDays(TODAY, -29), TODAY];
  return ['0000-01-01', TODAY];
}

function Cash({ d }: { d: DashData }) {
  const until = addDays(TODAY, 14);
  const incoming = d.open.filter((i) => i.due >= TODAY && i.due <= until);
  const late = d.overdue;
  const bills = d.bills.filter((b) => b.due <= until).map((b) => ({ ...b, value: b.amount }));
  const inAmt = incoming.reduce((s, i) => s + invoiceTotal(i), 0);
  const lateAmt = late.reduce((s, i) => s + invoiceTotal(i), 0);
  const outAmt = bills.reduce((s, b) => s + b.value, 0);
  return (
    <div className="dash-cash">
      <div><div className="ui-label">Coming due</div><div className="dash-big is-green">{usd0(inAmt)}</div><div className="dash-row-meta">{incoming.length} invoices due by {fmtDate(until, true)}</div></div>
      <div><div className="ui-label">Past due to collect</div><div className="dash-big is-amber">{usd0(lateAmt)}</div><div className="dash-row-meta">{late.length} invoices</div></div>
      <div><div className="ui-label">Bills to pay</div><div className="dash-big is-red">{usd0(outAmt)}</div><div className="dash-row-meta">{bills.length} bills due by {fmtDate(until, true)}</div></div>
      <div><div className="ui-label">Net if all collected</div><div className="dash-big">{usd0(inAmt + lateAmt - outAmt)}</div><div className="dash-row-meta">In minus out</div></div>
    </div>
  );
}

function Fleet({ d }: { d: DashData }) {
  const rows: { name: string; parts: { label: string; n: number; tone: string }[] }[] = [
    { name: `Trucks · ${d.trucks.length}`, parts: [
      { label: 'In service', n: d.trucks.filter((t) => t.status === 'In service').length, tone: 'var(--ui-green)' },
      { label: 'Service due', n: d.trucks.filter((t) => t.status === 'Service due').length, tone: 'var(--ui-amber)' },
      { label: 'In shop / out', n: d.trucks.filter((t) => t.status === 'In shop' || t.status === 'Out of service').length, tone: 'var(--ui-red)' },
    ] },
    { name: `Trailers · ${d.trailers.length}`, parts: [
      { label: 'Loaded', n: d.trailers.filter((t) => t.status === 'Loaded').length, tone: 'var(--ui-primary)' },
      { label: 'Empty', n: d.trailers.filter((t) => t.status === 'Empty').length, tone: 'var(--ui-green)' },
      { label: 'Shop / inspection', n: d.trailers.filter((t) => !['Loaded', 'Empty'].includes(t.status)).length, tone: 'var(--ui-amber)' },
    ] },
    { name: `Drivers · ${d.drivers.length}`, parts: [
      { label: 'On duty', n: d.drivers.filter((x) => x.status === 'On duty').length, tone: 'var(--ui-primary)' },
      { label: 'Available', n: d.drivers.filter((x) => x.status === 'Available').length, tone: 'var(--ui-green)' },
      { label: 'Off / home', n: d.drivers.filter((x) => !['On duty', 'Available'].includes(x.status)).length, tone: 'var(--ui-muted)' },
    ] },
  ];
  return (
    <div className="dash-list">
      {rows.map((r) => {
        const total = r.parts.reduce((s, p) => s + p.n, 0) || 1;
        return (
          <div key={r.name} className="dash-fleet">
            <div className="dash-row-label">{r.name}</div>
            <div className="dash-seg is-thin">{r.parts.filter((p) => p.n).map((p) => <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.tone }} />)}</div>
            <div className="dash-legend">{r.parts.map((p) => <span key={p.label}><i style={{ background: p.tone }} />{p.label} {p.n}</span>)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Upcoming({ d }: { d: DashData }) {
  const until = addDays(TODAY, 7);
  const events = d.loads
    .filter((l) => l.status !== 'Delivered' && l.status !== 'Needs POD')
    // The stop's own date; older stops only carry it as text ('Oct 1 · 08:00', 'Jan 4, 2027 · …').
    .flatMap((l) => stopsOf(l).map((s) => ({ load: l, stop: s, date: s.date || isoFromShort(s.when.split(' · ')[0]) })))
    .filter((e) => e.date && e.date >= TODAY && e.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (events.length === 0) return <div className="dash-empty">No pickups or deliveries in the next 7 days.</div>;
  return (
    <div className="dash-list">
      {events.map((e, i) => (
        <Link key={i} to={`/app/loads/${e.load.id}`} className="dash-event">
          <span className="dash-date"><b>{fmtDate(e.date, true).split(' ')[1]}</b>{fmtDate(e.date, true).split(' ')[0]}</span>
          <span className="dash-event-text">
            <span className={`ui-stop-kind ${e.stop.kind === 'Pickup' ? 'pickup' : 'delivery'}`}>{e.stop.kind}</span>
            <span className="dash-row-label">{e.stop.name}</span>
            <span className="dash-row-meta">{e.load.id} · {e.load.customer} · {e.load.driver}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function ActiveLoads({ d, o }: { d: DashData; o: DashOptions }) {
  const navigate = useNavigate();
  const c = o.loadColumns;
  const sort = useSort(d.query.trim() ? d.loads.filter((l) => matchesQuery(l, d.query)) : d.active);
  const rows = sort.rows;
  return (
    <>
      <table className="ui-table">
        <thead>
          <tr>
            <SortTh sort={sort} k="id">Load</SortTh>
            {c.customer && <SortTh sort={sort} k="customer">Customer</SortTh>}
            {c.route && <SortTh sort={sort} k="route">Route</SortTh>}
            {c.pickup && <SortTh sort={sort} k="pickup">Pickup</SortTh>}
            {c.driver && <SortTh sort={sort} k="driver">Driver</SortTh>}
            {c.rate && <SortTh sort={sort} k="rate" num>Rate</SortTh>}
            {c.status && <SortTh sort={sort} k="status" num>Status</SortTh>}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="is-clickable" onClick={() => navigate(`/app/loads/${l.id}`)}>
              <td className="strong">{l.id}</td>
              {c.customer && <td>{l.customer}</td>}
              {c.route && <td className="muted">{l.route}</td>}
              {c.pickup && <td>{l.pickup}</td>}
              {c.driver && <td>{l.driver}</td>}
              {c.rate && <td className="num">{l.rate}</td>}
              {c.status && <td className="num"><Tag label={l.status} tagClass={l.tagClass} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="ui-empty">{d.query ? `Nothing matches “${d.query}”.` : 'No active loads.'}</div>}
    </>
  );
}

function Drivers({ d }: { d: DashData }) {
  const navigate = useNavigate();
  return (
    <div className="dash-list">
      {d.drivers.map((x) => {
        const tone = x.status === 'On duty' ? 'var(--ui-primary)' : x.status === 'Available' ? 'var(--ui-green)' : 'var(--ui-muted)';
        return (
          <div key={x.id} className="dash-row is-clickable" onClick={() => navigate('/app/fleet/drivers')}>
            <span className="dash-dot" style={{ background: tone }} />
            <span className="dash-row-label">{x.name}</span>
            <span className="dash-row-meta">{x.status === 'On duty' ? `On duty · ${x.hos} left` : x.status}{x.unit !== '—' ? ` · ${x.unit}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

const muted = (s: string) => <span className="dash-head-meta">{s}</span>;

export function cardFor(id: WidgetId, d: DashData, o: DashOptions): CardView | null {
  switch (id) {
    case 'attention':
      return { kind: 'card', title: 'Needs attention', body: <Attention d={d} /> };
    case 'revenue': {
      const from = addDays(TODAY, -o.revenueDays + 1);
      return { kind: 'card', title: `Revenue delivered, last ${o.revenueDays} days`, action: muted(`${usd0(sum(between(d.earned, from, TODAY)))} total`), body: <RevenueChart d={d} o={o} /> };
    }
    case 'ar-aging':
      return { kind: 'card', title: 'Receivables aging', action: <Link className="ui-link" to="/app/accounting/past-due">{usd0(d.open.reduce((s, i) => s + invoiceTotal(i), 0))} open →</Link>, body: <Aging d={d} /> };
    case 'by-customer': {
      const [from, to] = byCustomerRange(o);
      const rows = groupBy(between(d.earned, from, to), (e) => e.customer).slice(0, 8);
      const total = rows.reduce((s, r) => s + r.amount, 0) || 1;
      return {
        kind: 'card', title: 'Revenue by customer', action: muted(o.customerPeriod),
        body: <HBars rows={rows.map((r) => ({ key: r.key, value: r.amount, label: usd0(r.amount), meta: `${Math.round((r.amount / total) * 100)}%` }))} />,
      };
    }
    case 'lanes': {
      const rows = groupBy(d.earned, (e) => e.route).slice(0, 8);
      return {
        kind: 'card', title: 'Top lanes', action: muted('All delivered'),
        body: <HBars rows={rows.map((r) => ({ key: r.key, value: r.amount, label: usd0(r.amount), meta: `${r.count} loads${r.miles ? ` · $${(r.amount / r.miles).toFixed(2)}/mi` : ''}` }))} />,
      };
    }
    case 'cash':
      return { kind: 'card', title: 'Cash, next 14 days', body: <Cash d={d} /> };
    case 'fleet':
      return { kind: 'card', title: 'Fleet status', action: <Link className="ui-link" to="/app/fleet">Fleet →</Link>, body: <Fleet d={d} /> };
    case 'upcoming':
      return { kind: 'card', title: 'Next 7 days', action: <Link className="ui-link" to="/app/planner">Planner →</Link>, body: <Upcoming d={d} /> };
    case 'active-loads':
      return { kind: 'card', title: d.query.trim() ? 'Loads matching your search' : 'Active loads', flush: true, action: <Link className="ui-link" to="/app/loads">View all</Link>, body: <ActiveLoads d={d} o={o} /> };
    case 'drivers':
      return { kind: 'card', title: 'Drivers', action: <Link className="ui-link" to="/app/fleet/drivers">Roster →</Link>, body: <Drivers d={d} /> };
    default:
      return null;
  }
}

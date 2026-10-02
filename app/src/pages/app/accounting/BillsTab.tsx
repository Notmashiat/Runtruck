import { Fragment, useState, type ReactNode } from 'react';
import { BillDialog, BillDocuments, PayBillDialog } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { BILLS, daysBetween, dollars, money, TODAY, type Bill } from '../../../data/accounting';
import {
  BILL_CATEGORIES, BILL_STATUSES, BILL_TAG, addDaysIso, billStatus, isOpen, monthlyCost, nextDate, seriesOf, type BillRecord,
} from '../../../data/bills';
import { fmtDate, usd, usd0 } from '../../../data/invoicing';
import { isoDateAt, todayIso } from '../../../lib/clock';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { isoOf, numberOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Release 1.3 (data/releases.ts) brings the bill manager; companies that have
// not received it keep the read-only list below.
export function BillsTab() {
  return isLive('bills-manage') ? <BillManager /> : <BillList />;
}

// — 1.3: open, edit, pay, schedule, void and attach documents —

const chargedTo = (b: BillRecord) => [b.truck, b.trailer, b.driver, b.load, b.terminal].filter(Boolean).join(' · ');

const FILTERS: FilterDef<BillRecord>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (b) => billStatus(b), options: BILL_STATUSES },
  { key: 'category', label: 'Category', type: 'select', get: (b) => b.category, options: BILL_CATEGORIES },
  { key: 'vendor', label: 'Vendor', type: 'select', get: (b) => b.vendor },
  { key: 'repeats', label: 'Repeats', type: 'select', get: (b) => b.frequency ?? 'One-time' },
  { key: 'charged', label: 'Charged to', type: 'select', get: (b) => [b.truck, b.trailer, b.driver, b.load].filter(Boolean) },
  { key: 'due', label: 'Due date', type: 'dates', get: (b) => b.due },
  { key: 'amount', label: 'Amount', type: 'range', get: (b) => b.amount, prefix: '$' },
  { key: 'docs', label: 'Documents', type: 'toggle', get: (b) => b.documents.length > 0, hint: 'Only bills with documents attached' },
];

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

function BillManager() {
  const { query, bills, saveBill } = useAppShell();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillRecord | null>(null);
  const [paying, setPaying] = useState<BillRecord | null>(null);
  const [scheduling, setScheduling] = useState<{ id: string; date: string } | null>(null);
  const [message, setMessage] = useState('');
  const today = todayIso();
  const week = addDaysIso(today, 7);
  const open = bills.filter(isOpen);
  const sum = (list: BillRecord[]) => usd0(list.reduce((s, b) => s + b.amount, 0));
  const dueSoon = open.filter((b) => b.due >= today && b.due <= week);
  const overdue = bills.filter((b) => billStatus(b, today) === 'Overdue');
  const scheduled = bills.filter((b) => billStatus(b, today) === 'Scheduled');
  const paidMonth = bills.filter((b) => b.paid && b.paid.date.slice(0, 7) === today.slice(0, 7));
  // Each recurring series counts once (its newest bill).
  const series = new Map<string, BillRecord>();
  for (const b of bills.filter((x) => x.frequency && !x.void)) {
    const key = b.seriesId ?? b.id;
    if (!series.has(key) || (series.get(key)?.due ?? '') < b.due) series.set(key, b);
  }
  const monthly = [...series.values()].reduce((s, b) => s + monthlyCost(b), 0);

  const kpis = [
    { label: 'Due this week', value: String(dueSoon.length), note: sum(dueSoon) },
    { label: 'Overdue', value: String(overdue.length), note: sum(overdue) },
    { label: 'Scheduled', value: String(scheduled.length), note: `${sum(scheduled)} · scheduled or auto-pay` },
    { label: 'Paid this month', value: String(paidMonth.length), note: usd0(paidMonth.reduce((s, b) => s + (b.paid?.amount ?? 0), 0)) },
    { label: 'Recurring', value: String(series.size), note: `about ${usd0(monthly)} a month` },
  ];

  const sort = useSort(
    usePageFilters(bills.filter((b) => matchesQuery({ ...b, documents: b.documents.map((d) => d.name).join(' ') }, query)), FILTERS),
    { status: (b) => BILL_STATUSES.indexOf(billStatus(b, today)), charged: (b) => chargedTo(b), repeats: (b) => b.frequency ?? '', docs: (b) => b.documents.length },
  );
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />
      {message && <div className="ui-note" role="status">{message}</div>}

      <Card title="Bills" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="vendor">Vendor</SortTh><SortTh sort={sort} k="category">Category</SortTh><SortTh sort={sort} k="charged">Charged to</SortTh>
              <SortTh sort={sort} k="due">Due</SortTh><SortTh sort={sort} k="repeats">Repeats</SortTh><SortTh sort={sort} k="docs" num>Docs</SortTh>
              <SortTh sort={sort} k="amount" num>Amount</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const isOpenRow = openId === b.id;
              const st = billStatus(b, today);
              return (
                <Fragment key={b.id}>
                  <tr className={`is-clickable${isOpenRow ? ' is-open' : ''}${st === 'Void' ? ' is-off' : ''}`} onClick={() => setOpenId(isOpenRow ? null : b.id)} aria-expanded={isOpenRow}>
                    <td className="strong">{b.vendor}<div className="ui-stop-meta">{[b.id, b.billNumber].filter(Boolean).join(' · ')}</div></td>
                    <td>{b.category}<div className="ui-stop-meta">{b.description}</div></td>
                    <td className="muted">{chargedTo(b) || '—'}</td>
                    <td>{fmtDate(b.due)}{st === 'Scheduled' && b.scheduledFor && <div className="ui-stop-meta">Pay {fmtDate(b.scheduledFor)}</div>}</td>
                    <td>{b.frequency ?? 'One-time'}</td>
                    <td className="num">{b.documents.length || '—'}</td>
                    <td className="num">{usd(b.amount)}</td>
                    <td className="num"><Tag label={st} tagClass={BILL_TAG[st]} /></td>
                  </tr>
                  {isOpenRow && (
                    <tr>
                      <td colSpan={8} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>
                              Added {fmtDate(isoDateAt(new Date(b.created)))}{b.updated ? ` · changed ${fmtDate(isoDateAt(new Date(b.updated)))}` : ''}
                            </div>
                            <div style={{ flex: 1 }} />
                            {isOpen(b) && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => { setMessage(''); setPaying(b); }}>Mark paid</button>}
                            {isOpen(b) && !b.autopay && (
                              scheduling?.id === b.id ? (
                                <span className="bill-schedule">
                                  <input className="ui-input" type="date" value={scheduling.date} min={today} onChange={(e) => setScheduling({ id: b.id, date: e.target.value })} aria-label="Pay on" />
                                  <button type="button" className="ui-btn ui-btn-sm" disabled={!scheduling.date} onClick={() => { saveBill({ ...b, scheduledFor: scheduling.date, updated: new Date().toISOString() }); setScheduling(null); }}>Schedule</button>
                                  <button type="button" className="ui-link" onClick={() => setScheduling(null)}>Cancel</button>
                                </span>
                              ) : (
                                <button type="button" className="ui-btn ui-btn-sm" onClick={() => setScheduling({ id: b.id, date: b.scheduledFor ?? b.due })}>{b.scheduledFor ? 'Reschedule' : 'Schedule payment'}</button>
                              )
                            )}
                            {b.scheduledFor && isOpen(b) && <button type="button" className="ui-btn ui-btn-sm" onClick={() => saveBill({ ...b, scheduledFor: undefined, updated: new Date().toISOString() })}>Unschedule</button>}
                            {b.paid && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm('Mark this bill as not paid?')) saveBill({ ...b, paid: undefined, updated: new Date().toISOString() }); }}>Undo payment</button>}
                            {!b.paid && (
                              <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (b.void || window.confirm(`Void ${b.vendor} ${usd(b.amount)}? It stays on file but is not owed.`)) saveBill({ ...b, void: !b.void || undefined, updated: new Date().toISOString() }); }}>
                                {b.void ? 'Restore' : 'Void'}
                              </button>
                            )}
                            {b.frequency && (
                              <button type="button" className="ui-btn ui-btn-sm" onClick={() => {
                                if (!window.confirm(`Stop repeating ${b.vendor}? The bills already made stay; no more are made.`)) return;
                                // The whole series stops, not just this bill: a later bill would otherwise keep making new ones.
                                const now = new Date().toISOString();
                                for (const x of bills) if (x.frequency && seriesOf(x) === seriesOf(b)) saveBill({ ...x, frequency: undefined, endsOn: undefined, anchor: undefined, updated: now });
                              }}>Stop repeating</button>
                            )}
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(b)}>Edit bill</button>
                          </div>
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Vendor invoice #">{b.billNumber}</Fact>
                            <Fact k="Amount">{usd(b.amount)}</Fact>
                            <Fact k="Category">{b.category}</Fact>
                            <Fact k="Bill date">{fmtDate(b.issued)}</Fact>
                            <Fact k="Terms">{b.terms}</Fact>
                            <Fact k="Due">{fmtDate(b.due)}</Fact>
                            <Fact k="What it is for">{b.description}</Fact>
                            <Fact k="Charged to">{chargedTo(b)}</Fact>
                            <Fact k="Repeats">
                              {b.frequency ? `${b.frequency}${b.endsOn ? ` until ${fmtDate(b.endsOn)}` : ''}` : 'One-time'}
                              {b.frequency && !b.paid && <div className="ui-stop-meta">Next bill ({fmtDate(nextDate(b.due, b.frequency, b.anchor?.due))}) is made when this one is paid</div>}
                            </Fact>
                            <Fact k="Payment">
                              {b.paid
                                ? `Paid ${fmtDate(b.paid.date)} · ${usd(b.paid.amount)} by ${b.paid.method}${b.paid.reference ? ` (${b.paid.reference})` : ''}`
                                : `${b.method}${b.autopay ? ' · auto-pay' : ''}${b.scheduledFor ? ` · scheduled ${fmtDate(b.scheduledFor)}` : ''}`}
                            </Fact>
                            <Fact k="Vendor contact">{[b.vendorEmail, b.vendorPhone, b.vendorAccount && `Account ${b.vendorAccount}`].filter(Boolean).join(' · ')}</Fact>
                            <Fact k="Remit to">{b.remitTo}</Fact>
                            {b.notes && <Fact k="Notes">{b.notes}</Fact>}
                          </div>
                          <BillDocuments docs={b.documents} owner={`${b.vendor} · ${b.id}`} onChange={(documents) => saveBill({ ...b, documents, updated: new Date().toISOString() })} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{bills.length === 0 ? 'No bills yet. + Add Bill records the first one.' : 'Nothing matches the search or filters.'}</div>}
      </Card>

      {editing && <BillDialog bill={editing} onClose={() => setEditing(null)} />}
      {paying && <PayBillDialog bill={paying} onClose={() => setPaying(null)} onPaid={setMessage} />}
    </>
  );
}

// — before 1.3: the read-only list —

const total = (list: Bill[]) => money(list.reduce((sum, b) => sum + dollars(b.amount), 0));

const dueThisWeek = BILLS.filter((b) => b.status === 'Due' && daysBetween(TODAY, b.due) <= 7);
const overdueBills = BILLS.filter((b) => b.status === 'Overdue');
const scheduledBills = BILLS.filter((b) => b.status === 'Scheduled');
const paidThisMonth = BILLS.filter((b) => b.status === 'Paid' && b.due.startsWith('Sep'));

const KPIS = [
  { label: 'Due this week', value: String(dueThisWeek.length), note: total(dueThisWeek) },
  { label: 'Overdue', value: String(overdueBills.length), note: total(overdueBills) },
  { label: 'Scheduled', value: String(scheduledBills.length), note: `${total(scheduledBills)} · auto-pay` },
  { label: 'Paid this month', value: String(paidThisMonth.length), note: total(paidThisMonth) },
];

const LIST_FILTERS: FilterDef<Bill>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (b) => b.status, options: ['Overdue', 'Due', 'Scheduled', 'Paid'] },
  { key: 'category', label: 'Category', type: 'select', get: (b) => b.category },
  { key: 'vendor', label: 'Vendor', type: 'select', get: (b) => b.vendor },
  { key: 'due', label: 'Due date', type: 'dates', get: (b) => isoOf(b.due) },
  { key: 'amount', label: 'Amount', type: 'range', get: (b) => numberOf(b.amount), prefix: '$' },
];

function BillList() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(BILLS.filter((b) => matchesQuery(b, query)), LIST_FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Bills" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="vendor">Vendor</SortTh><SortTh sort={sort} k="category">Category</SortTh><SortTh sort={sort} k="due">Due</SortTh><SortTh sort={sort} k="amount" num>Amount</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.vendor}>
                <td className="strong">{b.vendor}</td>
                <td className="muted">{b.category}</td>
                <td>{b.due}</td>
                <td className="num">{b.amount}</td>
                <td className="num"><Tag label={b.status} tagClass={b.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

import { Fragment, useState, type ReactNode } from 'react';
import { BillDocuments } from '../../../components/BillDialogs';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { CompleteWorkOrderDialog, WorkOrderDialog, unitOdometer, useUnitUpdate } from '../../../components/SafetyDialogs';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import type { FormValues } from '../../../data/fleet';
import { fmtDate, usd, usd0 } from '../../../data/invoicing';
import { USER } from '../../../data/mock';
import { addDays } from '../../../data/payroll';
import { MAINTENANCE, money, type WorkOrder as LegacyWorkOrder } from '../../../data/safety';
import { SERVICE_TYPES, WO_STATES, WO_TAG, daysBetween, woCost, woState, type WorkOrder } from '../../../data/safetyRecords';
import { isoDateAt, todayIso } from '../../../lib/clock';
import { isLive } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Release 1.8 (data/releases.ts) brings managed work orders; companies that
// have not received it keep the read-only list.
export function MaintenanceTab() {
  return isLive('safety-maintenance') ? <WorkOrders /> : <LegacyMaintenance />;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dayOf = (iso: string) => (/T12:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : isoDateAt(new Date(iso)));
const miles = (n: number) => `${n.toLocaleString('en-US')} mi`;
const nextYear = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}` : '');

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

function WorkOrders() {
  const { query, workOrders, saveWorkOrder, trucks, trailers } = useAppShell();
  const updateUnit = useUnitUpdate();
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [creating, setCreating] = useState<FormValues | null>(null);
  const [completing, setCompleting] = useState<WorkOrder | null>(null);
  const today = todayIso();

  const stateOf = (w: WorkOrder) => woState(w, unitOdometer(trucks, w.unit), today);
  const isOpen = (w: WorkOrder) => w.status !== 'Done' && w.status !== 'Cancelled';
  const openOrders = workOrders.filter(isOpen);
  const late = openOrders.filter((w) => ['Overdue', 'Due soon'].includes(stateOf(w)));
  const inShop = openOrders.filter((w) => w.status === 'In shop' || w.status === 'Waiting on parts');
  const units = [...trucks, ...trailers].filter((u) => !u.archived);
  const outOfService = units.filter((u) => u.status === 'Out of service' || openOrders.some((w) => w.unit === u.unit && w.outOfService));
  const month = today.slice(0, 7);
  const doneThisMonth = workOrders.filter((w) => w.completed && w.completed.date.startsWith(month));
  const doneThisYear = workOrders.filter((w) => w.completed && w.completed.date.startsWith(today.slice(0, 4)));

  // Units coming due with nothing booked: the annual inspection (49 CFR 396.17) and PM by mileage.
  const booked = (unit: string, type: (t: string) => boolean) => openOrders.some((w) => w.unit === unit && type(w.type));
  const coming: { unit: string; what: string; prefill: FormValues }[] = [];
  for (const u of units) {
    const due = nextYear(String(u.details.dotInspection ?? ''));
    if (due && daysBetween(today, due) <= 30 && !booked(u.unit, (t) => t === 'DOT annual inspection')) {
      coming.push({ unit: u.unit, what: `annual inspection ${due < today ? 'expired' : 'due'} ${fmtDate(due)}`, prefill: { unit: u.unit, type: 'DOT annual inspection', description: 'Annual inspection (49 CFR 396.17)', dueDate: due < today ? today : due } });
    }
    const odo = Number(String(u.details.odometer ?? '').replace(/\D/g, '')) || 0;
    const nextService = Number(String(u.details.nextService ?? '').replace(/\D/g, '')) || 0;
    if (odo && nextService && nextService - odo <= 1500 && !booked(u.unit, (t) => t.startsWith('Preventive'))) {
      coming.push({ unit: u.unit, what: `PM due at ${miles(nextService)} (${miles(Math.max(0, nextService - odo))} to go)`, prefill: { unit: u.unit, type: 'Preventive maintenance (PM A)', description: 'PM A: oil and filters, grease, brake and tire check', dueOdometer: String(nextService), dueDate: addDays(today, 7) } });
    }
  }

  const kpis = [
    { label: 'Open work orders', value: String(openOrders.length), note: `${inShop.length} in the shop · ${usd0(openOrders.reduce((s, w) => s + w.estimate, 0))} estimated` },
    { label: 'Overdue & due soon', value: String(late.length), note: late.map((w) => `${w.unit} ${w.type.replace(/ \(.*\)$/, '').toLowerCase()}`).join(' · ') || 'Nothing due in 14 days' },
    { label: 'Out of service', value: String(outOfService.length), note: outOfService.map((u) => u.unit).join(' · ') || 'Every unit can run' },
    { label: 'Spend this month', value: usd0(doneThisMonth.reduce((s, w) => s + woCost(w), 0)), note: `${usd0(doneThisYear.reduce((s, w) => s + woCost(w), 0))} this year · ${doneThisMonth.length} done` },
  ];

  const filters: FilterDef<WorkOrder>[] = [
    { key: 'state', label: 'Status', type: 'select', get: (w) => stateOf(w), options: WO_STATES },
    { key: 'type', label: 'Service', type: 'select', get: (w) => w.type, options: SERVICE_TYPES },
    { key: 'unit', label: 'Unit', type: 'select', get: (w) => w.unit },
    { key: 'kind', label: 'Equipment', type: 'select', get: (w) => w.unitKind, options: ['Truck', 'Trailer'] },
    { key: 'shop', label: 'Shop', type: 'select', get: (w) => w.shop },
    { key: 'due', label: 'Due date', type: 'dates', get: (w) => w.dueDate },
    { key: 'cost', label: 'Cost', type: 'range', get: (w) => woCost(w), prefix: '$' },
  ];
  const list = showDone ? workOrders : workOrders.filter((w) => isOpen(w) || w.id === open);
  const sort = useSort(
    usePageFilters(list.filter((w) => matchesQuery({ ...w, documents: w.documents.map((d) => d.name).join(' '), log: '' }, query)), filters),
    { state: (w) => WO_STATES.indexOf(stateOf(w)), due: (w) => w.dueDate || '9999', cost: (w) => woCost(w) },
  );
  // Most urgent first until a column is sorted.
  const rows = sort.key ? sort.rows : [...sort.rows].sort((a, b) => WO_STATES.indexOf(stateOf(a)) - WO_STATES.indexOf(stateOf(b)));

  const log = (w: WorkOrder, action: string, note: string, patch: Partial<WorkOrder> = {}) =>
    saveWorkOrder({ ...w, ...patch, updated: new Date().toISOString(), log: [...w.log, { at: new Date().toISOString(), by: USER.name, action, note }] });

  const dueText = (w: WorkOrder) => {
    const parts: string[] = [];
    if (w.dueDate) parts.push(fmtDate(w.dueDate));
    if (w.dueOdometer) parts.push(`at ${miles(w.dueOdometer)}`);
    return parts.join(' · ') || '—';
  };
  const dueMeta = (w: WorkOrder) => {
    if (!isOpen(w)) return w.completed ? `Done ${fmtDate(w.completed.date)}` : 'Cancelled';
    const bits: string[] = [];
    if (w.dueDate) { const d = daysBetween(today, w.dueDate); bits.push(d < 0 ? `${-d} d late` : `in ${d} d`); }
    const odo = unitOdometer(trucks, w.unit);
    if (w.dueOdometer && odo) { const m = w.dueOdometer - odo; bits.push(m < 0 ? `${miles(-m)} over` : `${miles(m)} to go`); }
    return bits.join(' · ');
  };

  return (
    <>
      <Kpis items={kpis} />

      {coming.length > 0 && (
        <div className="ui-note hr-missing">
          <span><strong>Coming due, not booked:</strong></span>
          {coming.map((c) => (
            <button key={c.unit + c.what} type="button" className="ui-link" onClick={() => setCreating(c.prefill)}>{c.unit} · {c.what}</button>
          ))}
        </div>
      )}

      <Card
        title={showDone ? 'All work orders' : 'Open work orders'}
        flush
        action={<button type="button" className="ui-link" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide done' : `Show done & cancelled (${workOrders.length - openOrders.length})`}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="type">Work</SortTh><SortTh sort={sort} k="due">Due</SortTh>
              <SortTh sort={sort} k="shop">Shop</SortTh><SortTh sort={sort} k="cost" num>Cost</SortTh><SortTh sort={sort} k="state" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const state = stateOf(w);
              const isExpanded = open === w.id;
              const live = isOpen(w);
              return (
                <Fragment key={w.id}>
                  <tr className={`is-clickable${isExpanded ? ' is-open' : ''}${live ? '' : ' is-off'}`} onClick={() => setOpen(isExpanded ? null : w.id)} aria-expanded={isExpanded}>
                    <td className="strong">{w.unit}<div className="ui-stop-meta">{w.id} · {w.unitKind}{w.driver ? ` · ${w.driver}` : ''}</div></td>
                    <td>{w.type}<div className="ui-stop-meta">{w.description}</div></td>
                    <td>{dueText(w)}<div className="ui-stop-meta" style={state === 'Overdue' ? { color: 'var(--ui-red)' } : undefined}>{dueMeta(w)}</div></td>
                    <td className="muted">{w.shop}</td>
                    <td className="num">{usd(woCost(w))}<div className="ui-stop-meta">{w.completed ? 'actual' : 'estimate'}</div></td>
                    <td className="num">
                      <Tag label={state} tagClass={WO_TAG[state]} />
                      {w.outOfService && live && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>Out of service</div>}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Opened {fmtDate(dayOf(w.created))} · {w.source}</div>
                            <div style={{ flex: 1 }} />
                            {live && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(w)}>Edit</button>}
                            {live && w.status !== 'Done' && (
                              <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => {
                                const why = window.prompt(`Cancel ${w.id}? Why (optional):`, '');
                                if (why === null) return;
                                log(w, 'Cancelled', why.trim(), { status: 'Cancelled' });
                              }}>Cancel</button>
                            )}
                            {w.status === 'Scheduled' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { log(w, 'In shop', w.shop, { status: 'In shop' }); updateUnit(w.unit, () => ({ status: w.outOfService ? 'Out of service' : 'In shop' })); }}>Start work</button>}
                            {w.status === 'In shop' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { const n = window.prompt('Waiting on which parts?', ''); if (n !== null) log(w, 'Waiting on parts', n.trim(), { status: 'Waiting on parts' }); }}>Waiting on parts</button>}
                            {w.status === 'Waiting on parts' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => log(w, 'Parts in', '', { status: 'In shop' })}>Parts in</button>}
                            {live && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setCompleting(w)}>Complete…</button>}
                            {w.status === 'Cancelled' && <button type="button" className="ui-btn ui-btn-sm" onClick={() => log(w, 'Reopened', '', { status: 'Scheduled' })}>Reopen</button>}
                          </div>
                          {w.outOfService && live && <div className="ui-errors" style={{ marginBottom: 12 }}>{w.unit} is out of service: do not dispatch it until this work is done.</div>}
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Service">{w.type}<div className="ui-stop-meta">{w.priority} · {w.source}</div></Fact>
                            <Fact k="Work">{w.description}</Fact>
                            <Fact k="Due">{dueText(w)}<div className="ui-stop-meta">{dueMeta(w)}</div></Fact>
                            <Fact k="Shop">{w.shop}</Fact>
                            <Fact k={w.completed ? 'Cost' : 'Estimate'}>
                              {usd(woCost(w))}
                              {w.completed && <div className="ui-stop-meta">{[`parts ${usd(w.completed.parts)}`, `labor ${usd(w.completed.labor)}`, w.completed.invoice && `invoice ${w.completed.invoice}`, w.estimate ? `est. ${usd(w.estimate)}` : ''].filter(Boolean).join(' · ')}</div>}
                            </Fact>
                            <Fact k="Repeats">{[w.repeatDays ? `every ${w.repeatDays} days` : '', w.repeatMiles ? `every ${miles(w.repeatMiles)}` : ''].filter(Boolean).join(' · ')}</Fact>
                            {w.completed && <Fact k="Done">{fmtDate(w.completed.date)}{w.completed.odometer ? ` · ${miles(w.completed.odometer)}` : ''}<div className="ui-stop-meta">{w.completed.notes}</div></Fact>}
                            {(w.billId || w.violationId) && <Fact k="Linked">{[w.billId && `Bill ${w.billId}`, w.violationId && `Inspection ${w.violationId}`].filter(Boolean).join(' · ')}</Fact>}
                            {w.notes && <Fact k="Notes">{w.notes}</Fact>}
                          </div>
                          <BillDocuments docs={w.documents} owner={`${w.id} ${w.unit}`} hint="Estimate, shop invoice, inspection report, photos" onChange={(documents) => saveWorkOrder({ ...w, documents, updated: new Date().toISOString() })} />
                          <div className="ui-label" style={{ margin: '14px 0 6px' }}>Log</div>
                          <ul className="crm-log">
                            {[...w.log].reverse().map((l, i) => (
                              <li key={i} className={l.action === 'Cancelled' ? 'is-off' : l.action === 'Completed' ? 'is-on' : ''}>
                                <strong>{l.action}</strong><span>{l.note}</span><span className="ui-stop-meta" style={{ marginTop: 0 }}>{when(l.at)} · {l.by}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{workOrders.length ? 'Nothing matches the search or filters.' : 'No work orders yet. + Log Service opens the first one.'}</div>}
      </Card>

      {creating && <WorkOrderDialog prefill={creating} onSaved={(id) => setOpen(id)} onClose={() => setCreating(null)} />}
      {editing && <WorkOrderDialog order={editing} onClose={() => setEditing(null)} />}
      {completing && <CompleteWorkOrderDialog order={completing} onClose={() => setCompleting(null)} />}
    </>
  );
}

// — before 1.8: the read-only list —

const OPEN = MAINTENANCE.filter((w) => w.status !== 'Done');
const IN_SHOP = MAINTENANCE.filter((w) => w.status === 'In shop');
const OVERDUE = MAINTENANCE.filter((w) => w.status === 'Overdue');

const KPIS = [
  { label: 'Open work orders', value: String(OPEN.length), note: `${MAINTENANCE.length - OPEN.length} done · last 30 d` },
  { label: 'In shop', value: String(IN_SHOP.length), note: [...new Set(IN_SHOP.map((w) => w.shop))].join(', ') || 'None' },
  { label: 'Overdue', value: String(OVERDUE.length), note: OVERDUE.map((w) => `${w.unit} · ${w.item}`).join(', ') || 'None' },
  { label: 'Est. cost open', value: money(OPEN.reduce((sum, w) => sum + w.estimate, 0)), note: 'Parts & labor, open orders' },
];

const FILTERS: FilterDef<LegacyWorkOrder>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (w) => w.status, options: ['Overdue', 'In shop', 'Due', 'Scheduled', 'Done'] },
  { key: 'shop', label: 'Shop', type: 'select', get: (w) => w.shop },
  { key: 'unit', label: 'Unit', type: 'select', get: (w) => w.unit },
  { key: 'kind', label: 'Equipment', type: 'select', get: (w) => (w.unit.startsWith('T-') ? 'Truck' : 'Trailer') },
  { key: 'due', label: 'Due date', type: 'dates', get: (w) => isoOf(w.due) },
  { key: 'estimate', label: 'Estimate', type: 'range', get: (w) => w.estimate, prefix: '$' },
];

function LegacyMaintenance() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(MAINTENANCE.filter((w) => matchesQuery(w, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Work orders" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="item">Item</SortTh><SortTh sort={sort} k="due">Due</SortTh><SortTh sort={sort} k="shop">Shop</SortTh><SortTh sort={sort} k="estimate" num>Estimate</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={`${w.unit} ${w.item}`}>
                <td className="strong">{w.unit}</td>
                <td>{w.item}</td>
                <td>{w.due}</td>
                <td className="muted">{w.shop}</td>
                <td className="num">{money(w.estimate)}</td>
                <td className="num"><Tag label={w.status} tagClass={w.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

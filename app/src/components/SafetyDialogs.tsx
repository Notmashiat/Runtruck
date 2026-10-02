import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { billFromForm, blankBillForm, nextBillId, type BillDocument } from '../data/bills';
import { driverFromForm, trailerFromForm, truckFromForm, type FleetDriver, type FormValues } from '../data/fleet';
import { fmtDate, usd } from '../data/invoicing';
import { USER } from '../data/mock';
import {
  BASICS, CLAIM_TYPES, CLEAN, DOC_FIELDS, DOC_NAMES, HARM, INSPECTION_LEVELS, PAID_BY, PRIORITIES, REQUEST_VIA, RESOLUTIONS, SERVICE_TYPES, WO_SOURCES,
  blankClaimForm, blankViolationForm, blankWorkOrderForm, claimFromForm, claimToForm, isAccident, isCargo, nextClaimId, nextRequestId,
  nextViolationId, nextWorkOrderId, repeatFor, unitStatusPatch, violationFromForm, violationToForm, workOrderFromForm, workOrderToForm,
  type ClaimRecord, type DocRequest, type SafetyLog, type ViolationRecord, type WorkOrder,
} from '../data/safetyRecords';
import { addDays } from '../data/payroll';
import { todayIso } from '../lib/clock';
import { STATE } from '../lib/rules';
import { BillDocuments } from './BillDialogs';
import { Field, useTracked } from './FormBits';
import { SmallDialog } from './SmallDialog';
import { RecordDialog, type SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const nonNeg = (value: string) => (Number(value.replace(/[$,]/g, '')) >= 0 ? null : 'A number, 0 or more');
const amount = (s: string) => Math.round((Number(s.replace(/[$,]/g, '')) || 0) * 100) / 100;
const entry = (action: string, note = ''): SafetyLog => ({ at: new Date().toISOString(), by: USER.name, action, note });
const YES_NO = ['No', 'Yes'];

// Changes to a truck or trailer record (status, service dates, odometer).
export function useUnitUpdate() {
  const { trucks, trailers, saveTruck, saveTrailer } = useAppShell();
  return (unit: string, patch: (details: FormValues) => FormValues) => {
    const t = trucks.find((x) => x.unit === unit);
    if (t) {
      saveTruck(truckFromForm({ ...t.details, ...patch(t.details) }, t.id, t));
      return;
    }
    const r = trailers.find((x) => x.unit === unit);
    if (r) saveTrailer(trailerFromForm({ ...r.details, ...patch(r.details) }, r.id, r));
  };
}

export const unitOdometer = (trucks: { unit: string; details: FormValues }[], unit: string) =>
  Number(String(trucks.find((t) => t.unit === unit)?.details.odometer ?? '').replace(/\D/g, '')) || undefined;

// — work orders —

function workOrderSections(units: string[], isTruck: (u: string) => boolean, shops: string[], drivers: string[]): SectionSpec[] {
  return [
    {
      title: 'Unit & work',
      help: 'Which truck or trailer, what needs doing and how urgent it is.',
      fields: [
        { key: 'unit', label: 'Unit', type: 'select', required: true, options: units },
        { key: 'type', label: 'Service', type: 'select', required: true, options: SERVICE_TYPES },
        { key: 'description', label: 'Work to do', required: true, wide: true, placeholder: 'e.g. Replace left steer tire, check alignment' },
        { key: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES, help: 'Out of service: the unit must not be dispatched until the work is done.' },
        { key: 'source', label: 'Found by', type: 'select', options: WO_SOURCES },
        { key: 'driver', label: 'Driver', type: 'select', options: drivers },
        { key: 'outOfService', label: 'Take the unit out of service now', type: 'select', options: YES_NO, help: 'Sets it Out of service in Fleet until the work is done.' },
      ],
    },
    {
      title: 'Schedule & shop',
      help: 'When it is due, where it goes, what it should cost, and whether it repeats.',
      fields: [
        { key: 'dueDate', label: 'Due date', type: 'date' },
        { key: 'dueOdometer', label: 'Due at odometer (mi)', type: 'number', check: nonNeg, show: (v) => isTruck(val(v, 'unit')), help: 'For mileage-based service (PM).' },
        { key: 'shop', label: 'Shop', type: 'select', required: true, options: shops },
        { key: 'estimate', label: 'Estimate ($)', type: 'number', check: nonNeg },
        { key: 'repeatDays', label: 'Repeats every (days)', type: 'number', check: nonNeg, help: 'The next one is booked when this one is done (e.g. 365 for the annual inspection).' },
        { key: 'repeatMiles', label: 'Repeats every (miles)', type: 'number', check: nonNeg, show: (v) => isTruck(val(v, 'unit')) },
      ],
    },
    {
      title: 'Documents & notes',
      help: 'Estimates, the shop invoice, the inspection report, photos.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

export function WorkOrderDialog({ order, prefill, link, onSaved, onClose }: { order?: WorkOrder; prefill?: FormValues; link?: Partial<WorkOrder>; onSaved?: (id: string) => void; onClose: () => void }) {
  const { workOrders, saveWorkOrder, deleteWorkOrder, trucks, trailers, facilities, drivers } = useAppShell();
  const updateUnit = useUnitUpdate();
  const [id] = useState(() => order?.id ?? nextWorkOrderId(workOrders));
  const [docs, setDocs, docsChanged] = useTracked<BillDocument[]>(order?.documents ?? []);
  const truckUnits = trucks.filter((t) => !t.archived).map((t) => t.unit);
  const units = [...truckUnits, ...trailers.filter((t) => !t.archived).map((t) => t.unit)];
  const isTruck = (u: string) => truckUnits.includes(u) || /^T-/.test(u);
  const shops = [...new Set([...facilities.filter((f) => f.type === 'Repair shop' && !f.archived).map((f) => f.name), 'Mobile / roadside service', 'Dealer', 'Other shop'])];
  const [initial] = useState<FormValues>(() => {
    if (order) return workOrderToForm(order);
    const base = blankWorkOrderForm(todayIso(), { shop: shops[0] ?? '', ...prefill });
    const r = repeatFor(val(base, 'type'), isTruck(val(base, 'unit')) ? 'Truck' : 'Trailer');
    return { ...base, repeatDays: r.days ? String(r.days) : '', repeatMiles: r.miles ? String(r.miles) : '' };
  });

  // The service type brings its usual repeat; the unit brings its driver and next PM mileage.
  const adjust = (_prev: FormValues, next: FormValues, key: string): FormValues => {
    let v = next;
    const unit = val(v, 'unit');
    const truck = trucks.find((t) => t.unit === unit);
    if (key === 'type' || key === 'unit') {
      const r = repeatFor(val(v, 'type'), isTruck(unit) ? 'Truck' : 'Trailer');
      v = { ...v, repeatDays: r.days ? String(r.days) : '', repeatMiles: r.miles ? String(r.miles) : '' };
      if (val(v, 'type') === 'DOT annual inspection' && !val(v, 'description')) v = { ...v, description: 'Annual inspection (49 CFR 396.17)' };
      if (val(v, 'type').startsWith('Preventive') && truck && !val(v, 'dueOdometer')) v = { ...v, dueOdometer: String(truck.details.nextService ?? '') };
    }
    if (key === 'unit' && truck && truck.driver !== 'Unassigned') v = { ...v, driver: truck.driver };
    if (key === 'priority' && val(v, 'priority') === 'Out of service') v = { ...v, outOfService: 'Yes' };
    return v;
  };

  return (
    <RecordDialog
      heading={order ? `Edit ${order.id}` : 'Log service'}
      saveLabel={order ? 'Save changes' : 'Open work order'}
      sections={workOrderSections(units, isTruck, shops, drivers.filter((d) => !d.archived).map((d) => d.name))}
      initial={initial}
      isNew={!order}
      recordLabel={order ? order.id : 'work order'}
      noun="work order"
      deleteNote="Removed for good, with its documents. To keep the record, cancel it instead."
      adjust={adjust}
      extras={{ 'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={order?.id ?? 'New work order'} hint="Estimate, shop invoice, inspection report, photos" /> }}
      extraDirty={docsChanged}
      onSave={(v) => {
        const unit = val(v, 'unit');
        const w = workOrderFromForm(v, id, isTruck(unit) ? 'Truck' : 'Trailer', docs, USER.name, order, order ? {} : link);
        saveWorkOrder(w);
        // The unit's status follows its work orders as they now stand: out of
        // service if this one says so, and back in service for a unit this
        // order was moved away from (or no longer takes out of service).
        const after = [...workOrders.filter((x) => x.id !== id), w];
        updateUnit(unit, (dt) => unitStatusPatch(after, unit, String(dt.status), w.unitKind));
        if (order && order.unit !== unit) updateUnit(order.unit, (dt) => unitStatusPatch(after, order.unit, String(dt.status), order.unitKind));
        onSaved?.(id);
      }}
      onDelete={order ? () => {
        deleteWorkOrder(order.id);
        const after = workOrders.filter((x) => x.id !== order.id);
        updateUnit(order.unit, (dt) => unitStatusPatch(after, order.unit, String(dt.status), order.unitKind));
      } : undefined}
      onClose={onClose}
    />
  );
}

// Close out a work order: what it cost, the odometer, a bill for Accounting, and the next one if it repeats.
export function CompleteWorkOrderDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { saveWorkOrder, workOrders, trucks, bills, saveBill } = useAppShell();
  const updateUnit = useUnitUpdate();
  const today = todayIso();
  const odoNow = unitOdometer(trucks, order.unit);
  const [date, setDate] = useState(today);
  const [odometer, setOdometer] = useState(odoNow ? String(odoNow) : '');
  const [parts, setParts] = useState('');
  const [labor, setLabor] = useState(order.estimate ? String(order.estimate) : '');
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const total = amount(parts) + amount(labor);
  const ownShop = /sunridge/i.test(order.shop);
  const [bill, setBill] = useState(!ownShop);
  const repeats = order.repeatDays > 0 || order.repeatMiles > 0;
  const [again, setAgain] = useState(repeats);
  const odo = Number(odometer.replace(/\D/g, '')) || 0;

  const done = () => {
    const completed = { date, odometer: odo, parts: amount(parts), labor: amount(labor), invoice: invoice.trim(), notes: notes.trim() };
    let billId = '';
    if (bill && total > 0) {
      billId = nextBillId(bills);
      const category = order.type === 'Tires' ? 'Tires' : 'Repairs & maintenance';
      saveBill(billFromForm({
        ...blankBillForm(date), vendor: order.shop, billNumber: invoice.trim(), category, description: `${order.id} · ${order.unit} · ${order.type}`, amount: String(total),
        truck: order.unitKind === 'Truck' ? order.unit : '', trailer: order.unitKind === 'Trailer' ? order.unit : '', driver: order.driver, notes: completed.notes,
      }, billId, []));
    }
    const nextId = again ? nextWorkOrderId(workOrders) : '';
    const finished: WorkOrder = {
      ...order, status: 'Done', completed, billId, updated: new Date().toISOString(),
      log: [...order.log, entry('Completed', [usd(total), invoice.trim(), billId && `bill ${billId}`, nextId && `next ${nextId}`].filter(Boolean).join(' · '))],
    };
    saveWorkOrder(finished);
    // The unit's record: service dates, odometer, next PM; back in service
    // unless another open work order still keeps it in the shop or out of service.
    const after = workOrders.map((w) => (w.id === order.id ? finished : w));
    updateUnit(order.unit, (dt) => ({
      lastServiceDate: date,
      ...(odo && odo > (Number(String(dt.odometer ?? '').replace(/\D/g, '')) || 0) ? { odometer: String(odo) } : {}),
      ...(order.type === 'DOT annual inspection' ? { dotInspection: date } : {}),
      ...(order.type.startsWith('Preventive') && odo ? { nextService: String(odo + (Number(dt.pmInterval) || order.repeatMiles || 25000)) } : {}),
      ...(order.type === 'Tires' ? { lastTireCheck: date } : {}),
      ...unitStatusPatch(after, order.unit, String(dt.status), order.unitKind, ['Service due', 'Inspection']),
    }));
    if (again) {
      // Mileage repeats count from the odometer entered here, or the unit's
      // last known reading, or where this one was due. With no reading at
      // all the next one is due in 90 days, so it cannot be forgotten.
      const from = odo || odoNow || order.dueOdometer || 0;
      saveWorkOrder({
        ...order, id: nextId, status: 'Scheduled', completed: undefined, billId: '', violationId: '', outOfService: false, priority: 'Routine', source: 'PM schedule', documents: [], notes: '',
        dueDate: order.repeatDays ? addDays(date, order.repeatDays) : order.repeatMiles && !from ? addDays(date, 90) : '',
        dueOdometer: order.repeatMiles && from ? from + order.repeatMiles : 0,
        created: new Date().toISOString(), updated: undefined, log: [entry('Opened', `Scheduled after ${order.id}`)],
      });
    }
  };

  return (
    <SmallDialog label={`Complete ${order.id}`} title={`${order.unit} · ${order.type}`} confirm="Mark done" disabled={!date} onConfirm={done} onClose={onClose}
      intro="What it cost and the odometer. The unit's record is updated (service date, inspection date, next PM) and it goes back in service.">
      <div className="ui-form-grid">
        <Field label="Done on" required><input className="ui-input" type="date" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {order.unitKind === 'Truck' && <Field label="Odometer (mi)"><input className="ui-input num" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></Field>}
        <Field label="Parts ($)"><input className="ui-input num" inputMode="decimal" value={parts} onChange={(e) => setParts(e.target.value)} /></Field>
        <Field label="Labor ($)"><input className="ui-input num" inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} /></Field>
        <Field label="Shop invoice #"><input className="ui-input" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
        <Field label="Total"><input className="ui-input num" value={usd(total)} readOnly /></Field>
        <Field label="What was done" wide><textarea className="ui-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <label className="ui-check"><input type="checkbox" checked={bill && total > 0} disabled={total <= 0} onChange={(e) => setBill(e.target.checked)} /> Add a bill for {usd(total)} to Accounting › Bills ({order.shop})</label>
      {repeats && (
        <label className="ui-check">
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Book the next one
          {order.repeatDays ? ` · due ${fmtDate(addDays(date, order.repeatDays))}` : ''}{order.repeatMiles && (odo || odoNow || order.dueOdometer) ? ` · at ${((odo || odoNow || order.dueOdometer) + order.repeatMiles).toLocaleString('en-US')} mi` : ''}
        </label>
      )}
    </SmallDialog>
  );
}

// — inspections and violations —

function violationSections(drivers: string[], trucks: string[], trailers: string[]): SectionSpec[] {
  return [
    {
      title: 'Inspection',
      help: 'The roadside inspection: when, where, the report and who was inspected.',
      fields: [
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'reportNumber', label: 'Inspection report #', placeholder: 'From the officer’s report' },
        { key: 'level', label: 'Level', type: 'select', required: true, options: INSPECTION_LEVELS },
        { key: 'state', label: 'State', maxLength: 2, upper: true, check: STATE },
        { key: 'location', label: 'Location', placeholder: 'e.g. I-5 scale · Cottonwood', wide: true },
        { key: 'driver', label: 'Driver', type: 'select', required: true, options: drivers },
        { key: 'truck', label: 'Truck', type: 'select', options: trucks },
        { key: 'trailer', label: 'Trailer', type: 'select', options: trailers },
        { key: 'basic', label: 'Result (BASIC)', type: 'select', required: true, options: [CLEAN, ...BASICS], help: 'Clean inspections count in your favor; log them too.' },
      ],
    },
    {
      title: 'Violation',
      help: 'What was written up, how serious it is and what it cost.',
      when: (v) => val(v, 'basic') !== CLEAN,
      naText: 'Clean inspection: no violation to record.',
      fields: [
        { key: 'code', label: 'Violation code', required: true, placeholder: 'e.g. 393.47(e), 395.8(e)' },
        { key: 'severity', label: 'Severity weight (1–10)', type: 'number', required: true, check: (value) => (Number(value) >= 1 && Number(value) <= 10 ? null : '1 to 10'), help: 'From the FMCSA violation table.' },
        { key: 'description', label: 'Description', required: true, wide: true },
        { key: 'oos', label: 'Out of service', type: 'select', options: YES_NO, help: 'Adds 2 to the severity weight.' },
        { key: 'fine', label: 'Fine ($)', type: 'number', check: nonNeg },
        { key: 'finePaidBy', label: 'Fine paid by', type: 'select', options: ['Company', 'Driver', 'Not paid yet'] },
      ],
    },
    {
      title: 'Documents & notes',
      help: 'The inspection report, citation, photos, repair receipt.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

export function ViolationDialog({ record, onClose }: { record?: ViolationRecord; onClose: () => void }) {
  const { violations, saveViolation, deleteViolation, drivers, trucks, trailers } = useAppShell();
  const [id] = useState(() => record?.id ?? nextViolationId(violations));
  const [docs, setDocs, docsChanged] = useTracked<BillDocument[]>(record?.documents ?? []);
  const [initial] = useState<FormValues>(() => (record ? violationToForm(record) : blankViolationForm(todayIso())));
  const adjust = (_prev: FormValues, next: FormValues, key: string): FormValues => {
    if (key !== 'driver') return next;
    const d = drivers.find((x) => x.name === val(next, 'driver'));
    return d && d.unit && d.unit !== '—' && !val(next, 'truck') ? { ...next, truck: d.unit } : next;
  };
  return (
    <RecordDialog
      heading={record ? `Edit ${record.id}` : 'Log inspection'}
      saveLabel={record ? 'Save changes' : 'Log inspection'}
      sections={violationSections(drivers.filter((d) => !d.archived).map((d) => d.name), trucks.filter((t) => !t.archived).map((t) => t.unit), trailers.filter((t) => !t.archived).map((t) => t.unit))}
      initial={initial}
      isNew={!record}
      recordLabel={record ? record.id : 'inspection'}
      noun="inspection"
      deleteNote="Removed for good. Inspections stay on your FMCSA record for 24 months whether or not they are here; delete only a mistake."
      adjust={adjust}
      extras={{ 'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={record?.id ?? 'Inspection'} hint="Inspection report, citation, photos, repair receipt" /> }}
      extraDirty={docsChanged}
      onSave={(v) => saveViolation(violationFromForm(v, id, docs, USER.name, record))}
      onDelete={record ? () => deleteViolation(record.id) : undefined}
      onClose={onClose}
    />
  );
}

export function ViolationActionDialog({ record, kind, onClose }: { record: ViolationRecord; kind: 'contest' | 'close' | 'coach'; onClose: () => void }) {
  const { saveViolation } = useAppShell();
  const [text, setText] = useState(kind === 'close' ? RESOLUTIONS[0] : '');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const save = () => {
    const now = new Date().toISOString();
    if (kind === 'contest') saveViolation({ ...record, status: 'Contested', dataQs: text.trim(), updated: now, log: [...record.log, entry('Contested', [`DataQs ${text.trim()}`, note.trim()].filter(Boolean).join(' · '))] });
    if (kind === 'close') saveViolation({ ...record, status: 'Closed', resolution: text, updated: now, log: [...record.log, entry('Closed', [text, note.trim()].filter(Boolean).join(' · '))] });
    if (kind === 'coach') saveViolation({ ...record, coached: date, updated: now, log: [...record.log, entry('Driver coached', [fmtDate(date), note.trim()].filter(Boolean).join(' · '))] });
  };
  const title = `${record.driver} · ${record.code || record.basic}`;
  if (kind === 'contest') {
    return (
      <SmallDialog label={`Challenge ${record.id}`} title={title} confirm="Mark contested" disabled={!text.trim()} onConfirm={save} onClose={onClose}
        intro="File a Request for Data Review at FMCSA DataQs (dataqs.fmcsa.dot.gov), then record its number here.">
        <div className="ui-form-grid">
          <Field label="DataQs request #" required><input className="ui-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. RDR-2026-114882" /></Field>
          <Field label="Grounds" wide><textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it is wrong, and the evidence (ELD log, repair receipt, photos)" /></Field>
        </div>
      </SmallDialog>
    );
  }
  if (kind === 'close') {
    return (
      <SmallDialog label={`Close ${record.id}`} title={title} confirm="Close" onConfirm={save} onClose={onClose} intro="How it ended. It stays on file with its points for 24 months.">
        <div className="ui-form-grid">
          <Field label="Outcome" required><select className="ui-input" value={text} onChange={(e) => setText(e.target.value)}>{RESOLUTIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Note" wide><textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </SmallDialog>
    );
  }
  return (
    <SmallDialog label={`Coach ${record.driver}`} title={record.description || record.basic} confirm="Record coaching" onConfirm={save} onClose={onClose} intro="Record the conversation or training with the driver about this violation.">
      <div className="ui-form-grid">
        <Field label="Date" required><input className="ui-input" type="date" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="What was covered" wide><textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </SmallDialog>
  );
}

// — claims —

function claimSections(loads: string[], drivers: string[], trucks: string[], trailers: string[]): SectionSpec[] {
  return [
    {
      title: 'Claim',
      help: 'What happened, who is claiming and for how much.',
      fields: [
        { key: 'type', label: 'Type', type: 'select', required: true, options: CLAIM_TYPES },
        { key: 'incidentDate', label: 'Date of the incident', type: 'date', required: true },
        { key: 'received', label: 'Claim received', type: 'date', required: true, help: 'For cargo claims the 30-day acknowledgment and 120-day decision clocks start here (49 CFR 370).' },
        { key: 'load', label: 'Load', type: 'select', options: loads },
        { key: 'claimant', label: 'Claimant', required: true, placeholder: 'Customer, consignee or third party' },
        { key: 'claimantContact', label: 'Claimant contact' },
        { key: 'claimantEmail', label: 'Claimant email', type: 'email' },
        { key: 'amountClaimed', label: 'Amount claimed ($)', type: 'number', check: nonNeg },
        { key: 'reserve', label: 'Reserve ($)', type: 'number', check: nonNeg, help: 'What you expect it to cost.' },
        { key: 'description', label: 'What happened', type: 'textarea', required: true },
      ],
    },
    {
      title: 'Driver & equipment',
      help: 'Who was driving, the truck and trailer, and where.',
      fields: [
        { key: 'driver', label: 'Driver', type: 'select', options: drivers },
        { key: 'truck', label: 'Truck', type: 'select', options: trucks },
        { key: 'trailer', label: 'Trailer', type: 'select', options: trailers },
        { key: 'location', label: 'Location', wide: true },
        { key: 'preventable', label: 'Preventable?', type: 'select', options: ['Under review', 'Preventable', 'Not preventable'] },
      ],
    },
    {
      title: 'Accident details',
      help: 'For the DOT accident register (49 CFR 390.15): a crash with a fatality, an injury treated away from the scene, or a vehicle towed away.',
      when: (v) => isAccident(val(v, 'type')),
      naText: 'Only for accidents.',
      fields: [
        { key: 'harm', label: 'Outcome', type: 'checks', options: HARM },
        { key: 'policeReport', label: 'Police report #' },
        { key: 'citation', label: 'Citation issued', placeholder: 'To whom, for what' },
      ],
    },
    {
      title: 'Insurance',
      help: 'The policy and the insurer’s claim.',
      fields: [
        { key: 'insurer', label: 'Insurer' },
        { key: 'policyNumber', label: 'Policy #' },
        { key: 'insurerClaimNo', label: 'Insurer claim #' },
        { key: 'deductible', label: 'Deductible ($)', type: 'number', check: nonNeg },
      ],
    },
    {
      title: 'Documents & notes',
      help: 'Photos, BOL and delivery receipt with exceptions, police report, estimates, the claimant’s invoice.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

export function ClaimDialog({ record, onClose }: { record?: ClaimRecord; onClose: () => void }) {
  const { claims, saveClaim, deleteClaim, loads, drivers, trucks, trailers } = useAppShell();
  const [id] = useState(() => record?.id ?? nextClaimId(claims));
  const [docs, setDocs, docsChanged] = useTracked<BillDocument[]>(record?.documents ?? []);
  const last = [...claims].reverse().find((c) => c.insurer);
  const [initial] = useState<FormValues>(() => (record ? claimToForm(record) : blankClaimForm(todayIso(), { insurer: last?.insurer ?? '', policyNumber: last?.policyNumber ?? '', deductible: last?.deductible ? String(last.deductible) : '' })));
  const loadLabel = (l: { id: string; customer: string }) => `${l.id} · ${l.customer}`;
  const loadOptions = loads.map(loadLabel);

  // A load fills in the driver, equipment and (for cargo) the customer.
  const adjust = (_prev: FormValues, next: FormValues, key: string): FormValues => {
    if (key !== 'load') return next;
    const l = loads.find((x) => loadLabel(x) === val(next, 'load') || x.id === val(next, 'load'));
    if (!l) return next;
    const [truck, trailer] = l.unit.split('/').map((s) => s.trim());
    return {
      ...next, load: l.id, driver: l.driver !== 'Unassigned' ? l.driver : val(next, 'driver'), truck: truck && truck !== '—' ? truck : val(next, 'truck'), trailer: trailer ?? val(next, 'trailer'),
      ...(isCargo(val(next, 'type')) && !val(next, 'claimant') ? { claimant: l.customer } : {}),
    };
  };
  const withLoadLabel = (v: FormValues) => {
    const l = loads.find((x) => x.id === val(v, 'load'));
    return l ? { ...v, load: loadLabel(l) } : v;
  };

  return (
    <RecordDialog
      heading={record ? `Edit ${record.id}` : 'New claim'}
      saveLabel={record ? 'Save changes' : 'Open claim'}
      sections={claimSections(loadOptions, drivers.map((d) => d.name), trucks.map((t) => t.unit), trailers.map((t) => t.unit))}
      initial={withLoadLabel(initial)}
      isNew={!record}
      recordLabel={record ? record.id : 'claim'}
      noun="claim"
      deleteNote="Removed for good, with its documents. To keep the record, deny or withdraw it instead."
      adjust={adjust}
      extras={{ 'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={record?.id ?? 'New claim'} hint="Photos, BOL / POD, police report, estimates, invoice" /> }}
      extraDirty={docsChanged}
      onSave={(v) => {
        const loadId = (val(v, 'load').split(' · ')[0] ?? '').trim();
        saveClaim(claimFromForm({ ...v, load: loadId }, id, docs, USER.name, record));
      }}
      onDelete={record ? () => deleteClaim(record.id) : undefined}
      onClose={onClose}
    />
  );
}

export function ClaimActionDialog({ record, kind, onClose }: { record: ClaimRecord; kind: 'pay' | 'close' | 'recover'; onClose: () => void }) {
  const { saveClaim } = useAppShell();
  const [date, setDate] = useState(todayIso());
  const [amt, setAmt] = useState(kind === 'pay' ? String(Math.max(0, record.reserve - record.payments.reduce((s, p) => s + p.amount, 0)) || '') : '');
  const [by, setBy] = useState(PAID_BY[0]);
  const [ref, setRef] = useState('');
  const [settles, setSettles] = useState(true);
  const [outcome, setOutcome] = useState<'Denied' | 'Withdrawn'>('Denied');
  const [reason, setReason] = useState('');
  const now = () => new Date().toISOString();

  if (kind === 'pay') {
    return (
      <SmallDialog label={`Payment · ${record.id}`} title={record.claimant} confirm="Record payment" disabled={!amount(amt) || !date} onClose={onClose}
        intro="A payment to the claimant, by the insurer or the company. Driver deductions must be allowed by the driver's agreement."
        onConfirm={() => saveClaim({
          ...record, payments: [...record.payments, { date, amount: amount(amt), by, reference: ref.trim() }], updated: now(),
          ...(settles ? { status: 'Settled' as const, closedOn: date, closedReason: 'Paid' } : {}),
          log: [...record.log, entry('Payment', `${usd(amount(amt))} by ${by}${ref.trim() ? ` · ${ref.trim()}` : ''}`), ...(settles ? [entry('Settled', 'Paid')] : [])],
        })}>
        <div className="ui-form-grid">
          <Field label="Date" required><input className="ui-input" type="date" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Amount ($)" required><input className="ui-input num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
          <Field label="Paid by"><select className="ui-input" value={by} onChange={(e) => setBy(e.target.value)}>{PAID_BY.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Reference"><input className="ui-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Check #, ACH, insurer settlement" /></Field>
        </div>
        <label className="ui-check"><input type="checkbox" checked={settles} onChange={(e) => setSettles(e.target.checked)} /> This settles the claim</label>
      </SmallDialog>
    );
  }
  if (kind === 'recover') {
    return (
      <SmallDialog label={`Recovery · ${record.id}`} title={record.claimant} confirm="Record recovery" disabled={!amount(amt)} onClose={onClose}
        intro="Money that came back: salvage sold, subrogation from the at-fault party, a shipper chargeback."
        onConfirm={() => saveClaim({ ...record, recovered: record.recovered + amount(amt), updated: now(), log: [...record.log, entry('Recovery', `${usd(amount(amt))}${reason.trim() ? ` · ${reason.trim()}` : ''}`)] })}>
        <div className="ui-form-grid">
          <Field label="Amount ($)" required><input className="ui-input num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
          <Field label="From"><input className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Salvage, subrogation…" /></Field>
        </div>
      </SmallDialog>
    );
  }
  return (
    <SmallDialog label={`Close ${record.id}`} title={record.claimant} confirm={outcome === 'Denied' ? 'Deny claim' : 'Mark withdrawn'} danger disabled={!reason.trim()} onClose={onClose}
      intro={isCargo(record.type) ? 'A cargo claim must be declined in writing with the reason (49 CFR 370.9). Attach the letter to the claim.' : 'Why it is being closed without payment.'}
      onConfirm={() => saveClaim({ ...record, status: outcome, closedOn: todayIso(), closedReason: reason.trim(), updated: now(), log: [...record.log, entry(outcome, reason.trim())] })}>
      <div className="ui-form-grid">
        <Field label="Outcome"><select className="ui-input" value={outcome} onChange={(e) => setOutcome(e.target.value as 'Denied' | 'Withdrawn')}><option>Denied</option><option>Withdrawn</option></select></Field>
        <Field label="Reason" required wide><textarea className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shipper load and count, seal intact on delivery" /></Field>
      </div>
    </SmallDialog>
  );
}

// — driver qualification file —

// Renew or record one document: the new date goes on the driver record; files go in their file.
export function UpdateDocDialog({ driver, document, onClose }: { driver: FleetDriver; document: string; onClose: () => void }) {
  const { saveDriver, driverFiles, saveDriverFile, docRequests, saveDocRequest } = useAppShell();
  const f = DOC_FIELDS[document];
  const key = `${driver.id}|${document}`;
  const file = driverFiles.find((x) => x.id === key);
  const [date, setDate] = useState(typeof driver.details[f.key] === 'string' ? (driver.details[f.key] as string) : '');
  const [files, setFiles] = useState<BillDocument[]>([]);
  const [note, setNote] = useState('');
  const save = () => {
    saveDriver(driverFromForm({ ...driver.details, [f.key]: date }, driver.id, driver));
    saveDriverFile({
      id: key, driverId: driver.id, document, files: [...(file?.files ?? []), ...files],
      history: [...(file?.history ?? []), entry('Updated', [`${f.kind === 'expires' ? 'expires' : 'done'} ${fmtDate(date)}`, files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : '', note.trim()].filter(Boolean).join(' · '))],
    });
    // Open requests for it are answered.
    for (const r of docRequests.filter((x) => x.driverId === driver.id && x.status === 'Requested' && x.documents.includes(document))) {
      const left = r.documents.filter((x) => x !== document);
      saveDocRequest(left.length ? { ...r, documents: left } : { ...r, status: 'Received', doneOn: todayIso() });
    }
  };
  return (
    <SmallDialog label={`${driver.name} · ${document}`} title={f.kind === 'expires' ? 'Renew' : 'Record'} confirm="Save" disabled={!date} onConfirm={save} onClose={onClose}
      intro={`${f.rule}. The date goes on ${driver.name.split(' ')[0]}'s driver record; attach the copy for the qualification file.`}>
      <div className="ui-form-grid">
        <Field label={f.kind === 'expires' ? 'Expires' : 'Done on'} required><input className="ui-input" type="date" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note"><input className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Reviewed by Daniel Soto, no violations" /></Field>
      </div>
      <BillDocuments docs={files} onChange={setFiles} owner={`${driver.name} · ${document}`} hint="The new copy" />
    </SmallDialog>
  );
}

export function RequestDocDialog({ driverId, documents, onClose }: { driverId?: string; documents?: string[]; onClose: () => void }) {
  const { drivers, docRequests, saveDocRequest } = useAppShell();
  const active = drivers.filter((d) => !d.archived);
  const [who, setWho] = useState(driverId ?? active[0]?.id ?? '');
  const [docs, setDocs] = useState<string[]>(documents ?? []);
  const [due, setDue] = useState(addDays(todayIso(), 7));
  const [via, setVia] = useState(REQUEST_VIA[0]);
  const driver = active.find((d) => d.id === who);
  const first = driver?.name.split(' ')[0] ?? '';
  const [message, setMessage] = useState('');
  const text = message || `Hi ${first}, please send a current copy of your ${docs.join(', ').toLowerCase() || 'documents'} by ${fmtDate(due)} for your driver qualification file. Thank you.`;
  return (
    <SmallDialog label="Request documents" title={driver?.name ?? 'Driver'} confirm="Save request" disabled={!driver || docs.length === 0 || !due} onClose={onClose}
      intro="Saved as an open request with a due date. Email opens your email app with the message ready; RunTruck does not send messages yet."
      onConfirm={() => {
        if (!driver) return;
        const r: DocRequest = { id: nextRequestId(docRequests), driverId: driver.id, driver: driver.name, documents: docs, due, via, message: text, status: 'Requested', doneOn: '', created: new Date().toISOString(), by: USER.name };
        saveDocRequest(r);
      }}>
      <div className="ui-form-grid">
        <Field label="Driver" required>
          <select className="ui-input" value={who} onChange={(e) => setWho(e.target.value)}>{active.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </Field>
        <Field label="Due" required><input className="ui-input" type="date" max="9999-12-31" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="How" ><select className="ui-input" value={via} onChange={(e) => setVia(e.target.value)}>{REQUEST_VIA.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <div className="ui-field is-wide" role="group" aria-label="Documents">
        <span className="ui-field-label">Documents<span className="ui-req"> *</span></span>
        <div className="ui-checks">
          {DOC_NAMES.map((n) => (
            <label key={n} className="ui-check"><input type="checkbox" checked={docs.includes(n)} onChange={(e) => setDocs(e.target.checked ? [...docs, n] : docs.filter((x) => x !== n))} />{n}</label>
          ))}
        </div>
      </div>
      <Field label="Message" wide><textarea className="ui-input" value={text} onChange={(e) => setMessage(e.target.value)} /></Field>
    </SmallDialog>
  );
}


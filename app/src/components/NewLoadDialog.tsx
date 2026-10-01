import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { money } from '../data/accounting';
import { facilityFor, isRoad, stopHint, type Facility } from '../data/facilities';
import { CARRIERS, CUSTOMERS, stopsOf, USER, type Load } from '../data/mock';
import { formatNow, isoFromText } from '../lib/clock';

type Section = 'Load info' | 'Stops' | 'Freight' | 'LTL' | 'Carrier' | 'Driver & equipment' | 'Rates' | 'Documents' | 'Notes' | 'Review';
const SECTIONS: Section[] = ['Load info', 'Stops', 'Freight', 'LTL', 'Carrier', 'Driver & equipment', 'Rates', 'Documents', 'Notes', 'Review'];

type Mode = 'FTL' | 'LTL' | 'Partial';
const MODES: Mode[] = ['FTL', 'LTL', 'Partial'];
const EQUIPMENT = ['Dry van, 53 ft', 'Reefer, 53 ft', 'Flatbed, 48 ft', 'Flatbed, tarped', 'Step deck, 48 ft', 'Power only', 'Box truck, 26 ft'];
const PACKAGING = ['Pallets', 'Skids', 'Crates', 'Boxes', 'Drums', 'Totes', 'Loose'];
const FREIGHT_CLASSES = ['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500'];
const LTL_SERVICES = ['Liftgate at pickup', 'Liftgate at delivery', 'Residential delivery', 'Inside delivery', 'Delivery appointment', 'Limited access'];
const TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Quick pay'];
const DOCUMENTS = ['Rate confirmation', 'Customer load tender', 'Bill of lading', 'Proof of delivery', 'Lumper receipt'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface StopDraft {
  kind: 'Pickup' | 'Delivery';
  facility: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  date: string;
  from: string;
  to: string;
  number: string;
  contact: string;
}

interface Draft {
  customer: string;
  billTo: string;
  ref: string;
  po: string;
  mode: Mode;
  equipment: string;
  dispatcher: string;
  stops: StopDraft[];
  commodity: string;
  weight: string;
  pieces: string;
  packaging: string;
  value: string;
  temp: string;
  hazmat: boolean;
  unNumber: string;
  freightClass: string;
  nmfc: string;
  handlingUnits: string;
  length: string;
  width: string;
  height: string;
  stackable: boolean;
  services: string[];
  brokered: boolean;
  carrier: string;
  carrierContact: string;
  carrierPhone: string;
  carrierRate: string;
  driver: string;
  truck: string;
  trailer: string;
  lineHaul: string;
  fuel: string;
  accessorials: string;
  miles: string;
  driverPay: string;
  terms: string;
  docs: Record<string, string>;
  instructions: string;
  internal: string;
}

function emptyStop(kind: StopDraft['kind']): StopDraft {
  return { kind, facility: '', address: '', city: '', state: '', zip: '', date: '', from: '', to: '', number: '', contact: '' };
}

const INITIAL: Draft = {
  customer: '', billTo: '', ref: '', po: '', mode: 'FTL', equipment: '', dispatcher: USER.name,
  stops: [emptyStop('Pickup'), emptyStop('Delivery')],
  commodity: '', weight: '', pieces: '', packaging: 'Pallets', value: '', temp: '', hazmat: false, unNumber: '',
  freightClass: '', nmfc: '', handlingUnits: '', length: '', width: '', height: '', stackable: false, services: [],
  brokered: false, carrier: '', carrierContact: '', carrierPhone: '', carrierRate: '',
  driver: '', truck: '', trailer: '',
  lineHaul: '', fuel: '', accessorials: '', miles: '', driverPay: '', terms: 'Net 30',
  docs: {}, instructions: '', internal: '',
};

type Errors = Partial<Record<Section, string[]>>;

const num = (s: string) => Number(s) || 0;
const positive = (s: string) => Number(s) > 0;

// What still has to be filled in before the load can be created, per section.
function validate(d: Draft): Errors {
  const e: Errors = {};
  const add = (s: Section, msg: string) => (e[s] ??= []).push(msg);

  if (!d.customer) add('Load info', 'Customer');
  if (!d.equipment) add('Load info', 'Equipment');
  if (!d.stops.some((s) => s.kind === 'Pickup')) add('Stops', 'At least one pickup');
  if (!d.stops.some((s) => s.kind === 'Delivery')) add('Stops', 'At least one delivery');
  d.stops.forEach((s, i) => {
    const n = `Stop ${i + 1}`;
    if (!s.facility.trim()) add('Stops', `${n}: facility`);
    if (!s.address.trim() || !s.city.trim() || !s.state.trim()) add('Stops', `${n}: street, city and state`);
    if (!s.date) add('Stops', `${n}: date`);
    const prev = d.stops[i - 1];
    if (s.date && prev?.date && s.date < prev.date) add('Stops', `${n}: date is before stop ${i}`);
  });
  if (!d.commodity.trim()) add('Freight', 'Commodity');
  if (!positive(d.weight)) add('Freight', 'Weight');
  if (d.hazmat && !d.unNumber.trim()) add('Freight', 'UN number for hazmat');
  if (d.mode === 'LTL') {
    if (!d.freightClass) add('LTL', 'Freight class');
    if (!positive(d.handlingUnits)) add('LTL', 'Handling units');
  }
  if (d.brokered) {
    if (!d.carrier) add('Carrier', 'Carrier');
    if (!positive(d.carrierRate)) add('Carrier', 'Carrier rate');
  }
  if (!positive(d.lineHaul)) add('Rates', 'Line haul rate');
  return e;
}

function shortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function signedMoney(n: number) {
  return n < 0 ? `-${money(-n)}` : money(n);
}

// Statuses a load is still "planned" in; editing its coverage there recomputes
// the status (a driver or carrier → Dispatched, none → Needs driver). Once it is
// moving, an edit keeps the status it has.
const PLANNED = ['Needs driver', 'Dispatched'];

function toLoad(d: Draft, id: string, prev?: Load): Load {
  const place = (s: StopDraft) => `${s.city.trim()}, ${s.state.trim().toUpperCase()}`;
  const street = (s: StopDraft) => `${s.address.trim()}, ${place(s)}`;
  const first = d.stops.find((s) => s.kind === 'Pickup') ?? d.stops[0];
  const last = [...d.stops].reverse().find((s) => s.kind === 'Delivery') ?? d.stops[d.stops.length - 1];
  const lineHaul = num(d.lineHaul);
  const miles = num(d.miles);
  const total = lineHaul + num(d.fuel) + num(d.accessorials);
  const cost = d.brokered ? num(d.carrierRate) : num(d.driverPay);
  const carrier = d.brokered ? CARRIERS.find((c) => c.name === d.carrier) ?? CARRIERS[0] : CARRIERS[0];
  const covered = d.brokered || Boolean(d.driver);
  const kept = prev && !PLANNED.includes(prev.status) ? prev : undefined;
  const reefer = d.equipment.startsWith('Reefer');
  const stamp = `Today ${formatNow(new Date(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;

  return {
    id,
    customer: d.customer,
    route: `${place(first)} → ${place(last)}`,
    pickup: shortDate(first.date),
    delivery: shortDate(last.date),
    driver: d.driver.trim() || 'Unassigned',
    unit: [d.truck.trim(), d.trailer.trim()].filter(Boolean).join(' / ') || '—',
    rate: money(lineHaul),
    status: kept ? kept.status : covered ? 'Dispatched' : 'Needs driver',
    tagClass: kept ? kept.tagClass : covered ? 'tag-neutral' : 'tag-outline',
    miles: miles > 0 ? miles.toLocaleString('en-US') : '—',
    rpm: miles > 0 ? `$${(lineHaul / miles).toFixed(2)}` : '—',
    pay: cost > 0 ? money(cost) : '—',
    margin: cost > 0 ? signedMoney(total - cost) : '—',
    commodity: d.commodity.trim(),
    weight: `${num(d.weight).toLocaleString('en-US')} lb`,
    equip: d.equipment,
    temp: reefer ? (d.temp ? `${d.temp} °F` : 'Set at pickup') : 'Ambient',
    ref: d.ref.trim() || d.po.trim() || '—',
    from: first.facility.trim(),
    fromAddr: street(first),
    to: last.facility.trim(),
    toAddr: street(last),
    carrier: carrier.name,
    carrierMc: carrier.mc,
    carrierDot: carrier.dot,
    mode: d.mode === 'FTL' ? 'Full truckload' : d.mode === 'LTL' ? 'Less than truckload' : 'Partial',
    ltl: d.mode === 'LTL'
      ? [`Class ${d.freightClass}`, `${d.handlingUnits} ${d.packaging.toLowerCase()}`, ...d.services].join(' · ')
      : undefined,
    stops: d.stops.map((s) => ({
      kind: s.kind,
      name: s.facility.trim(),
      address: `${street(s)} ${s.zip.trim()}`.trim(),
      when: `${shortDate(s.date)} · ${s.from && s.to ? `${s.from}–${s.to}` : s.from || s.to || 'Any time'}`,
    })),
    documents: DOCUMENTS.map((name) => ({ name, file: d.docs[name] ?? '' })),
    carrierRate: d.brokered ? money(num(d.carrierRate)) : undefined,
    notes: d.instructions.trim() || undefined,
    createdAt: prev ? prev.createdAt : stamp,
    updatedAt: prev ? stamp : undefined,
    form: d,
  };
}

function isDraft(x: unknown): x is Draft {
  return Boolean(x) && typeof x === 'object' && Array.isArray((x as Draft).stops) && typeof (x as Draft).customer === 'string';
}

// The form entry for an existing load: what was typed, if it was made or edited
// with this form; otherwise rebuilt from the load's fields (the demo loads).
function draftFromLoad(l: Load): Draft {
  if (isDraft(l.form)) return { ...INITIAL, ...l.form };
  const digits = (s: string) => s.replace(/[^0-9.-]/g, '');
  const stops: StopDraft[] = stopsOf(l).map((s) => {
    // 'addr, City, ST 93725' and 'Sep 8 · 08:00–12:00'
    const parts = s.address.split(',').map((p) => p.trim());
    const [state = '', zip = ''] = (parts.pop() ?? '').split(/\s+/);
    const city = parts.pop() ?? '';
    const [day, window = ''] = s.when.split(' · ');
    const [from = '', to = ''] = window.includes('–') ? window.split('–') : [];
    return {
      ...emptyStop(s.kind), facility: s.name, address: parts.join(', '), city, state, zip,
      date: isoFromText(day), from, to,
    };
  });
  const [truck = '', trailer = ''] = l.unit === '—' ? [] : l.unit.split(' / ');
  const partner = CARRIERS.slice(1).find((c) => c.name === l.carrier);
  return {
    ...INITIAL,
    customer: l.customer,
    ref: l.ref === '—' ? '' : l.ref,
    mode: l.mode === 'Less than truckload' ? 'LTL' : l.mode === 'Partial' ? 'Partial' : 'FTL',
    equipment: l.equip,
    stops,
    commodity: l.commodity,
    weight: digits(l.weight),
    temp: digits(l.temp),
    brokered: Boolean(partner),
    carrier: partner?.name ?? '',
    carrierRate: partner ? digits(l.carrierRate ?? l.pay) : '',
    driver: l.driver === 'Unassigned' ? '' : l.driver,
    truck,
    trailer,
    lineHaul: digits(l.rate),
    miles: digits(l.miles),
    driverPay: partner ? '' : digits(l.pay),
    docs: Object.fromEntries((l.documents ?? []).filter((x) => x.file).map((x) => [x.name, x.file])),
    instructions: l.notes ?? '',
  };
}

function nextId(loads: Load[]) {
  return `L-${Math.max(0, ...loads.map((l) => Number(l.id.slice(2)) || 0)) + 1}`;
}

interface FieldProps {
  label: string;
  required?: boolean;
  invalid?: boolean;
  wide?: boolean;
  group?: boolean;
  children: ReactNode;
}

// A labelled form control. `group` renders a <div> for controls that are not a
// single input (segmented choices), so the label does not swallow their clicks.
function Field({ label, required, invalid, wide, group, children }: FieldProps) {
  const cls = `ui-field${wide ? ' is-wide' : ''}${invalid ? ' is-invalid' : ''}`;
  const head = (
    <span className="ui-field-label">
      {label}
      {required && <span className="ui-req"> *</span>}
    </span>
  );
  const error = invalid && <span className="ui-field-error">Required</span>;
  return group ? (
    <div className={cls} role="group" aria-label={label}>{head}{children}{error}</div>
  ) : (
    <label className={cls}>{head}{children}{error}</label>
  );
}

function Choice<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="ui-filter" style={{ alignSelf: 'flex-start' }}>
      {options.map((o) => (
        <button key={o} type="button" className={`ui-filter-opt${value === o ? ' is-active' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

interface NewLoadDialogProps {
  // Given: the dialog edits this load (Save changes, Delete load). Absent: a new load.
  load?: Load;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
}

// The New Load / Edit load popup: the same shell as Settings, sized for a full
// load entry. Required fields are checked when the load is saved; sections with
// something missing get a count in the menu and the dialog jumps to the first.
export function NewLoadDialog({ load, onClose, onSaved, onDeleted }: NewLoadDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const { loads, addLoad, updateLoad, deleteLoad, drivers, trucks, trailers, facilities } = useAppShell();
  // Truck stops and scales are not pickup or delivery sites.
  const activeFacilities = facilities.filter((x) => !x.archived && !isRoad(x.type));
  // Archived fleet records are kept on file but are not offered for new work.
  const activeDrivers = drivers.filter((x) => !x.archived);
  const activeTrucks = trucks.filter((x) => !x.archived);
  const activeTrailers = trailers.filter((x) => !x.archived);
  const [initial] = useState<Draft>(() => (load ? draftFromLoad(load) : INITIAL));
  const [d, setD] = useState<Draft>(initial);
  const [section, setSection] = useState<Section>('Load info');
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = Boolean(load);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const errors = validate(d);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const setStop = (i: number, patch: Partial<StopDraft>) =>
    setD((prev) => ({ ...prev, stops: prev.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const missing = (s: Section, msg: string) => showErrors && Boolean(errors[s]?.includes(msg));
  // Picking a registered facility fills the stop's address and site contact.
  const setFacility = (i: number, name: string) => {
    const f = facilityFor(activeFacilities, name);
    if (!f) {
      setStop(i, { facility: name });
      return;
    }
    const t = (k: string) => (typeof f.details[k] === 'string' ? (f.details[k] as string).trim() : '');
    const pickup = d.stops[i].kind === 'Pickup';
    const who = (pickup ? t('shipName') : t('recvName')) || t('shipName');
    const phone = (pickup ? t('shipPhone') : t('recvPhone')) || t('shipPhone') || t('phone');
    setStop(i, {
      facility: f.name, address: t('street'), city: t('city'), state: t('state'), zip: t('zip'),
      contact: d.stops[i].contact || [who, phone].filter(Boolean).join(' · '),
    });
  };
  const knownFacility = (name: string): Facility | undefined => facilityFor(activeFacilities, name);

  const go = (s: Section) => {
    setSection(s);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  // Back / Next skip LTL unless the load is LTL.
  const step = (dir: 1 | -1) => {
    let i = SECTIONS.indexOf(section) + dir;
    if (SECTIONS[i] === 'LTL' && d.mode !== 'LTL') i += dir;
    if (SECTIONS[i]) go(SECTIONS[i]);
  };

  // Close and tell the page right away rather than waiting for the dialog's
  // close event (which browsers deliver later, and not at all in hidden tabs).
  const closeNow = () => {
    ref.current?.close();
    onClose();
  };

  const requestClose = () => {
    const message = editing ? 'Discard your changes to this load?' : 'Discard this new load? What you entered will be lost.';
    if (!dirty || window.confirm(message)) closeNow();
  };

  const save = () => {
    const firstBad = SECTIONS.find((s) => errors[s]?.length);
    if (firstBad) {
      setShowErrors(true);
      go(firstBad);
      return;
    }
    const saved = load ? toLoad(d, load.id, load) : toLoad(d, nextId(loads));
    if (load) updateLoad(saved);
    else addLoad(saved);
    closeNow();
    onSaved?.(saved.id);
  };

  const remove = () => {
    if (!load) return;
    deleteLoad(load.id);
    setConfirmDelete(false);
    closeNow();
    onDeleted?.();
  };

  const total = num(d.lineHaul) + num(d.fuel) + num(d.accessorials);
  const cost = d.brokered ? num(d.carrierRate) : num(d.driverPay);
  const reefer = d.equipment.startsWith('Reefer');
  const errorCount = Object.values(errors).reduce((n, list) => n + (list?.length ?? 0), 0);

  const pages: Record<Section, ReactNode> = {
    'Load info': (
      <>
        <Head title="Load information" help="Who the load is for and how it moves." />
        <div className="ui-form-grid">
          <Field label="Customer" required invalid={missing('Load info', 'Customer')}>
            <select
              className="ui-input"
              value={d.customer}
              onChange={(e) => {
                const c = CUSTOMERS.find((x) => x.name === e.target.value);
                setD((prev) => ({ ...prev, customer: e.target.value, billTo: prev.billTo || e.target.value, terms: c?.terms ?? prev.terms }));
              }}
            >
              <option value="">Select a customer</option>
              {CUSTOMERS.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Bill to">
            <select className="ui-input" value={d.billTo} onChange={(e) => set('billTo', e.target.value)}>
              <option value="">Same as customer</option>
              {CUSTOMERS.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Tender / reference #">
            <input className="ui-input" value={d.ref} onChange={(e) => set('ref', e.target.value)} placeholder="e.g. PO 88-41230" />
          </Field>
          <Field label="Customer PO #">
            <input className="ui-input" value={d.po} onChange={(e) => set('po', e.target.value)} />
          </Field>
          <Field label="Mode" group>
            <Choice options={MODES} value={d.mode} onChange={(v) => set('mode', v)} />
          </Field>
          <Field label="Equipment" required invalid={missing('Load info', 'Equipment')}>
            <select className="ui-input" value={d.equipment} onChange={(e) => set('equipment', e.target.value)}>
              <option value="">Select equipment</option>
              {EQUIPMENT.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Dispatcher">
            <input className="ui-input" value={d.dispatcher} onChange={(e) => set('dispatcher', e.target.value)} />
          </Field>
        </div>
      </>
    ),

    Stops: (
      <>
        <Head title="Stops" help="In the order the truck runs them. Add more for multi-stop loads." />
        {showErrors && errors.Stops && <div className="ui-errors">{errors.Stops.join(' · ')}</div>}
        <datalist id="ui-facility-options">
          {activeFacilities.map((f) => <option key={f.id} value={f.name}>{`${f.type} · ${f.city}, ${f.state}`}</option>)}
        </datalist>
        {d.stops.map((s, i) => (
          <div key={i} className="ui-panel">
            <div className="ui-panel-head">
              <span className={`ui-stop-kind ${s.kind === 'Pickup' ? 'pickup' : 'delivery'}`}>Stop {i + 1}</span>
              <Choice options={['Pickup', 'Delivery'] as StopDraft['kind'][]} value={s.kind} onChange={(v) => setStop(i, { kind: v })} />
              <div style={{ flex: 1 }} />
              {d.stops.length > 2 && (
                <button type="button" className="ui-link" onClick={() => set('stops', d.stops.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            <div className="ui-form-grid">
              <Field label="Facility" required wide invalid={showErrors && !s.facility.trim()}>
                <input className="ui-input" list="ui-facility-options" value={s.facility} onChange={(e) => setFacility(i, e.target.value)} placeholder="Start typing — registered facilities fill in the address" />
              </Field>
              <Field label="Street address" required wide invalid={showErrors && !s.address.trim()}>
                <input className="ui-input" value={s.address} onChange={(e) => setStop(i, { address: e.target.value })} />
              </Field>
            </div>
            <div className="ui-form-grid is-3" style={{ marginTop: 16 }}>
              <Field label="City" required invalid={showErrors && !s.city.trim()}>
                <input className="ui-input" value={s.city} onChange={(e) => setStop(i, { city: e.target.value })} />
              </Field>
              <Field label="State" required invalid={showErrors && !s.state.trim()}>
                <input className="ui-input" value={s.state} maxLength={2} onChange={(e) => setStop(i, { state: e.target.value })} placeholder="CA" />
              </Field>
              <Field label="ZIP">
                <input className="ui-input" value={s.zip} inputMode="numeric" onChange={(e) => setStop(i, { zip: e.target.value })} />
              </Field>
              <Field label="Date" required invalid={showErrors && !s.date}>
                <input className="ui-input" type="date" value={s.date} onChange={(e) => setStop(i, { date: e.target.value })} />
              </Field>
              <Field label="Window opens">
                <input className="ui-input" type="time" value={s.from} onChange={(e) => setStop(i, { from: e.target.value })} />
              </Field>
              <Field label="Window closes">
                <input className="ui-input" type="time" value={s.to} onChange={(e) => setStop(i, { to: e.target.value })} />
              </Field>
              <Field label={`${s.kind} #`}>
                <input className="ui-input" value={s.number} onChange={(e) => setStop(i, { number: e.target.value })} />
              </Field>
              <Field label="Site contact" wide>
                <input className="ui-input" value={s.contact} onChange={(e) => setStop(i, { contact: e.target.value })} placeholder="Name and phone" />
              </Field>
            </div>
            {knownFacility(s.facility) && (
              <div className="ui-note" style={{ marginTop: 14 }}>
                <strong>Registered facility.</strong> {stopHint(knownFacility(s.facility) as Facility)}
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="ui-btn" onClick={() => set('stops', [...d.stops.slice(0, -1), emptyStop('Pickup'), d.stops[d.stops.length - 1]])}>
            + Add pickup
          </button>
          <button type="button" className="ui-btn" onClick={() => set('stops', [...d.stops, emptyStop('Delivery')])}>
            + Add delivery
          </button>
        </div>
      </>
    ),

    Freight: (
      <>
        <Head title="Freight" help="What is on the trailer." />
        <div className="ui-form-grid">
          <Field label="Commodity" required wide invalid={missing('Freight', 'Commodity')}>
            <input className="ui-input" value={d.commodity} onChange={(e) => set('commodity', e.target.value)} placeholder="e.g. Frozen produce" />
          </Field>
          <Field label="Weight (lb)" required invalid={missing('Freight', 'Weight')}>
            <input className="ui-input" type="number" min={0} value={d.weight} onChange={(e) => set('weight', e.target.value)} />
          </Field>
          <Field label="Declared value ($)">
            <input className="ui-input" type="number" min={0} value={d.value} onChange={(e) => set('value', e.target.value)} />
          </Field>
          <Field label="Pieces">
            <input className="ui-input" type="number" min={0} value={d.pieces} onChange={(e) => set('pieces', e.target.value)} />
          </Field>
          <Field label="Packaging">
            <select className="ui-input" value={d.packaging} onChange={(e) => set('packaging', e.target.value)}>
              {PACKAGING.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          {reefer && (
            <Field label="Temperature (°F)">
              <input className="ui-input" type="number" value={d.temp} onChange={(e) => set('temp', e.target.value)} placeholder="e.g. -10" />
            </Field>
          )}
          <div className="ui-field is-wide">
            <label className="ui-check">
              <input type="checkbox" checked={d.hazmat} onChange={(e) => set('hazmat', e.target.checked)} />
              Hazardous materials
            </label>
          </div>
          {d.hazmat && (
            <Field label="UN number" required invalid={missing('Freight', 'UN number for hazmat')}>
              <input className="ui-input" value={d.unNumber} onChange={(e) => set('unNumber', e.target.value)} placeholder="e.g. UN1203" />
            </Field>
          )}
        </div>
      </>
    ),

    LTL: d.mode === 'LTL' ? (
      <>
        <Head title="LTL details" help="Needed to rate and class a less-than-truckload shipment." />
        <div className="ui-form-grid">
          <Field label="Freight class" required invalid={missing('LTL', 'Freight class')}>
            <select className="ui-input" value={d.freightClass} onChange={(e) => set('freightClass', e.target.value)}>
              <option value="">Select a class</option>
              {FREIGHT_CLASSES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="NMFC #">
            <input className="ui-input" value={d.nmfc} onChange={(e) => set('nmfc', e.target.value)} />
          </Field>
          <Field label="Handling units" required invalid={missing('LTL', 'Handling units')}>
            <input className="ui-input" type="number" min={0} value={d.handlingUnits} onChange={(e) => set('handlingUnits', e.target.value)} />
          </Field>
          <div className="ui-field" style={{ justifyContent: 'flex-end' }}>
            <label className="ui-check">
              <input type="checkbox" checked={d.stackable} onChange={(e) => set('stackable', e.target.checked)} />
              Stackable
            </label>
          </div>
        </div>
        <div className="ui-form-grid is-3">
          <Field label="Length (in)">
            <input className="ui-input" type="number" min={0} value={d.length} onChange={(e) => set('length', e.target.value)} />
          </Field>
          <Field label="Width (in)">
            <input className="ui-input" type="number" min={0} value={d.width} onChange={(e) => set('width', e.target.value)} />
          </Field>
          <Field label="Height (in)">
            <input className="ui-input" type="number" min={0} value={d.height} onChange={(e) => set('height', e.target.value)} />
          </Field>
        </div>
        <Field label="Services" group>
          <div className="ui-checks">
            {LTL_SERVICES.map((x) => (
              <label key={x} className="ui-check">
                <input
                  type="checkbox"
                  checked={d.services.includes(x)}
                  onChange={(e) => set('services', e.target.checked ? [...d.services, x] : d.services.filter((y) => y !== x))}
                />
                {x}
              </label>
            ))}
          </div>
        </Field>
      </>
    ) : (
      <>
        <Head title="LTL details" help="Only needed for less-than-truckload shipments." />
        <div className="ui-note">
          This load is {d.mode === 'FTL' ? 'a full truckload' : 'a partial'}, so there is nothing to fill in here.{' '}
          <button type="button" className="ui-link" onClick={() => set('mode', 'LTL')}>Make it an LTL load</button>
        </div>
      </>
    ),

    Carrier: (
      <>
        <Head title="Carrier" help={`Haul it with the ${USER.company || 'own'} fleet, or broker it to a partner carrier.`} />
        <Field label="Hauled by" group>
          <Choice
            options={['Own fleet', 'Partner carrier']}
            value={d.brokered ? 'Partner carrier' : 'Own fleet'}
            onChange={(v) => setD((prev) => ({ ...prev, brokered: v === 'Partner carrier', driver: '', truck: '', trailer: '' }))}
          />
        </Field>
        {d.brokered ? (
          <div className="ui-form-grid">
            <Field label="Carrier" required invalid={missing('Carrier', 'Carrier')}>
              <select className="ui-input" value={d.carrier} onChange={(e) => set('carrier', e.target.value)}>
                <option value="">Select a carrier</option>
                {CARRIERS.slice(1).map((c) => <option key={c.name} value={c.name}>{c.name} · {c.mc}</option>)}
              </select>
            </Field>
            <Field label="Carrier rate ($)" required invalid={missing('Carrier', 'Carrier rate')}>
              <input className="ui-input" type="number" min={0} value={d.carrierRate} onChange={(e) => set('carrierRate', e.target.value)} />
            </Field>
            <Field label="Carrier dispatcher">
              <input className="ui-input" value={d.carrierContact} onChange={(e) => set('carrierContact', e.target.value)} />
            </Field>
            <Field label="Carrier phone">
              <input className="ui-input" type="tel" value={d.carrierPhone} onChange={(e) => set('carrierPhone', e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="ui-note">
            {CARRIERS[0].name} · {CARRIERS[0].mc} · {CARRIERS[0].dot}. Assign the driver, truck and trailer in Driver &amp; equipment.
          </div>
        )}
      </>
    ),

    'Driver & equipment': (
      <>
        <Head
          title="Driver & equipment"
          help={d.brokered ? 'The partner carrier’s driver and units, if you have them yet.' : 'Leave the driver empty to put the load on the board as Needs driver.'}
        />
        {d.brokered ? (
          <div className="ui-form-grid is-3">
            <Field label="Driver name">
              <input className="ui-input" value={d.driver} onChange={(e) => set('driver', e.target.value)} />
            </Field>
            <Field label="Truck #">
              <input className="ui-input" value={d.truck} onChange={(e) => set('truck', e.target.value)} />
            </Field>
            <Field label="Trailer #">
              <input className="ui-input" value={d.trailer} onChange={(e) => set('trailer', e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="ui-form-grid is-3">
            <Field label="Driver">
              <select
                className="ui-input"
                value={d.driver}
                onChange={(e) => {
                  const drv = activeDrivers.find((x) => x.name === e.target.value);
                  const unit = drv && drv.unit !== '—' ? drv.unit : '';
                  setD((prev) => ({ ...prev, driver: e.target.value, truck: prev.truck || unit }));
                }}
              >
                <option value="">Unassigned</option>
                {activeDrivers.map((x) => <option key={x.id} value={x.name}>{x.name} · {x.status}</option>)}
                {d.driver && !activeDrivers.some((x) => x.name === d.driver) && <option value={d.driver}>{d.driver}</option>}
              </select>
            </Field>
            <Field label="Truck">
              <select className="ui-input" value={d.truck} onChange={(e) => set('truck', e.target.value)}>
                <option value="">None</option>
                {activeTrucks.map((x) => <option key={x.id} value={x.unit}>{x.unit} · {x.status}</option>)}
                {d.truck && !activeTrucks.some((x) => x.unit === d.truck) && <option value={d.truck}>{d.truck}</option>}
              </select>
            </Field>
            <Field label="Trailer">
              <select className="ui-input" value={d.trailer} onChange={(e) => set('trailer', e.target.value)}>
                <option value="">None</option>
                {activeTrailers.map((x) => <option key={x.id} value={x.unit}>{x.unit} · {x.kind}</option>)}
                {d.trailer && !activeTrailers.some((x) => x.unit === d.trailer) && <option value={d.trailer}>{d.trailer}</option>}
              </select>
            </Field>
          </div>
        )}
      </>
    ),

    Rates: (
      <>
        <Head title="Rates" help="What the customer pays and what the load costs." />
        <div className="ui-form-grid">
          <Field label="Line haul ($)" required invalid={missing('Rates', 'Line haul rate')}>
            <input className="ui-input" type="number" min={0} value={d.lineHaul} onChange={(e) => set('lineHaul', e.target.value)} />
          </Field>
          <Field label="Fuel surcharge ($)">
            <input className="ui-input" type="number" min={0} value={d.fuel} onChange={(e) => set('fuel', e.target.value)} />
          </Field>
          <Field label="Accessorial charges ($)">
            <input className="ui-input" type="number" min={0} value={d.accessorials} onChange={(e) => set('accessorials', e.target.value)} />
          </Field>
          <Field label="Loaded miles">
            <input className="ui-input" type="number" min={0} value={d.miles} onChange={(e) => set('miles', e.target.value)} />
          </Field>
          {!d.brokered && (
            <Field label="Driver pay ($)">
              <input className="ui-input" type="number" min={0} value={d.driverPay} onChange={(e) => set('driverPay', e.target.value)} />
            </Field>
          )}
          <Field label="Payment terms">
            <select className="ui-input" value={d.terms} onChange={(e) => set('terms', e.target.value)}>
              {TERMS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
        <div className="ui-summary">
          <Stat label="Total to customer" value={money(total)} />
          <Stat label="Rate / mile" value={num(d.miles) > 0 ? `$${(num(d.lineHaul) / num(d.miles)).toFixed(2)}` : '—'} />
          <Stat label={d.brokered ? 'Carrier cost' : 'Driver pay'} value={cost > 0 ? money(cost) : '—'} />
          <Stat label="Margin" value={cost > 0 ? signedMoney(total - cost) : '—'} />
        </div>
      </>
    ),

    Documents: (
      <>
        <Head title="Documents" help="Attach what you have now; the rest can be added from the load later." />
        <div className="ui-panel" style={{ padding: '4px 18px' }}>
          {DOCUMENTS.map((name) => {
            const file = d.docs[name];
            return (
              <div key={name} className="ui-file-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div className="ui-setting-help" style={{ overflowWrap: 'anywhere' }}>{file || 'Not attached'}</div>
                </div>
                {file && (
                  <button type="button" className="ui-link" onClick={() => set('docs', { ...d.docs, [name]: '' })}>
                    Remove
                  </button>
                )}
                <label className="ui-btn ui-btn-sm">
                  {file ? 'Replace' : 'Attach'}
                  <input
                    className="ui-file-input"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => set('docs', { ...d.docs, [name]: e.target.files?.[0]?.name ?? '' })}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </>
    ),

    Notes: (
      <>
        <Head title="Notes" help="Instructions go to the driver with the load; internal notes stay in the office." />
        <div className="ui-form-grid">
          <Field label="Driver instructions" wide>
            <textarea className="ui-input" value={d.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Check in at gate 3, 2-hour free time, no touch freight…" />
          </Field>
          <Field label="Internal notes" wide>
            <textarea className="ui-input" value={d.internal} onChange={(e) => set('internal', e.target.value)} />
          </Field>
        </div>
      </>
    ),

    Review: (
      <>
        <Head title="Review" help="Check the load before it goes on the board." />
        {errorCount > 0 ? (
          <div className="ui-errors">
            <strong>{errorCount} {errorCount === 1 ? 'thing' : 'things'} left to fill in</strong>
            {SECTIONS.filter((s) => errors[s]?.length).map((s) => (
              <div key={s} style={{ marginTop: 6 }}>
                <button type="button" className="ui-link" onClick={() => { setShowErrors(true); go(s); }}>{s}</button>
                {' — '}{errors[s]?.join(', ')}
              </div>
            ))}
          </div>
        ) : (
          <div className="ui-note">
            {editing
              ? `Everything required is filled in. Save changes updates ${load?.id} on the board, its load page and the planner.`
              : `Everything required is filled in. It goes on the board as ${d.brokered || d.driver ? 'Dispatched' : 'Needs driver'}.`}
          </div>
        )}
        <div className="ui-summary">
          <Stat label="Customer" value={d.customer || '—'} />
          <Stat label="Mode · equipment" value={`${d.mode} · ${d.equipment || '—'}`} />
          <Stat label="Stops" value={`${d.stops.filter((s) => s.kind === 'Pickup').length} pickup · ${d.stops.filter((s) => s.kind === 'Delivery').length} delivery`} />
          <Stat label="Route" value={d.stops[0].city && d.stops[d.stops.length - 1].city ? `${d.stops[0].city} → ${d.stops[d.stops.length - 1].city}` : '—'} />
          <Stat label="Freight" value={d.commodity ? `${d.commodity}${d.weight ? ` · ${num(d.weight).toLocaleString('en-US')} lb` : ''}` : '—'} />
          <Stat label="Carrier" value={d.brokered ? d.carrier || '—' : CARRIERS[0].name} />
          <Stat label="Driver" value={d.driver || 'Unassigned'} />
          <Stat label="Total to customer" value={money(total)} />
        </div>
      </>
    ),
  };

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-large"
      aria-label={editing ? `Edit load ${load?.id}` : 'New load'}
      // React passes a nested dialog's close/cancel up to this one, so only
      // react to this dialog's own events (not the Delete load prompt's).
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        // Escape: ask before throwing away a half-entered load.
        e.preventDefault();
        requestClose();
      }}
    >
      <aside className="ui-dialog-nav">
        <div className="ui-dialog-title">{editing ? `Edit load ${load?.id}` : 'New load'}</div>
        {SECTIONS.map((s) => {
          const n = showErrors ? errors[s]?.length ?? 0 : 0;
          return (
            <button key={s} type="button" className={`ui-dialog-nav-item${section === s ? ' is-active' : ''}`} onClick={() => go(s)}>
              <span>{s}</span>
              {n > 0 && <span className="ui-badge" aria-label={`${n} missing`}>{n}</span>}
              {n === 0 && s === 'LTL' && d.mode !== 'LTL' && <span className="ui-nav-note">N/A</span>}
            </button>
          );
        })}
      </aside>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body" ref={bodyRef}>
          <button type="button" className="ui-dialog-close" onClick={requestClose} aria-label="Close">
            ×
          </button>
          {pages[section]}
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          {editing && (
            <button type="button" className="ui-btn ui-btn-danger" onClick={() => setConfirmDelete(true)}>Delete load</button>
          )}
          <div style={{ flex: 1 }} />
          {section !== SECTIONS[0] && <button type="button" className="ui-btn" onClick={() => step(-1)}>Back</button>}
          {section !== 'Review' && <button type="button" className="ui-btn" onClick={() => step(1)}>Next</button>}
          <button type="button" className="ui-btn ui-btn-primary" onClick={save}>{editing ? 'Save changes' : 'Create load'}</button>
        </footer>
      </div>
      {confirmDelete && load && <ConfirmDelete load={load} onConfirm={remove} onClose={() => setConfirmDelete(false)} />}
    </dialog>
  );
}

// "Are you sure?" for Delete load: its own small modal on top of the form.
// Cancel is focused first, so Enter never deletes by accident.
function ConfirmDelete({ load, onConfirm, onClose }: { load: Load; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-confirm"
      role="alertdialog"
      aria-label={`Delete load ${load.id}?`}
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <h2 className="ui-h2" style={{ margin: 0 }}>Delete load {load.id}?</h2>
          <p className="ui-p" style={{ marginTop: 0 }}>
            {load.customer} · {load.route}. The load is removed from the board, its load page and the planner.
            This can’t be undone.
          </p>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={() => { ref.current?.close(); onClose(); }} autoFocus>Cancel</button>
          <button type="button" className="ui-btn ui-btn-danger-solid" onClick={onConfirm}>Yes, delete load</button>
        </footer>
      </div>
    </dialog>
  );
}

function Head({ title, help }: { title: string; help: string }) {
  return (
    <div>
      <h2 className="ui-h2" style={{ margin: 0 }}>{title}</h2>
      <p className="ui-p" style={{ marginTop: 4 }}>{help}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="ui-label">{label}</div>
      <div className="ui-kv-value" style={{ fontSize: 15 }}>{value}</div>
    </div>
  );
}

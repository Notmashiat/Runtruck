import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { FacilityDialog } from '../../components/FacilityDialog';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import {
  TODAY_DOW, addressLine, detentionRisk, facilityFor, hoursOn, isCustomerSite, isRoad, isYard, list, needsAppointment, prefillFromStop,
  sameName, schedulingShort, stopsUsing, type Facility,
} from '../../data/facilities';
import type { FormValues } from '../../data/fleet';
import { ACTIVE_STATUSES, stopsOf } from '../../data/mock';
import { MAINTENANCE } from '../../data/safety';
import { matchesQuery } from '../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../lib/tableTools';

type Group = 'All' | 'Customer sites' | 'Yards & shops' | 'On the road';
const GROUPS: Group[] = ['All', 'Customer sites', 'Yards & shops', 'On the road'];
const inGroup = (f: Facility, g: Group) =>
  g === 'All' || (g === 'Customer sites' ? isCustomerSite(f.type) : g === 'Yards & shops' ? isYard(f.type) : isRoad(f.type));

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][TODAY_DOW];
const text = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');

// A label over a value, skipped when there is nothing to show.
function Item({ label, children }: { label: string; children: ReactNode }) {
  const parts = Array.isArray(children) ? children : [children];
  if (parts.every((c) => c === '' || c === null || c === undefined || c === false)) return null;
  return (
    <div>
      <div className="ui-label">{label}</div>
      <div className="ui-kv-value">{children}</div>
    </div>
  );
}

export function FacilitiesPage() {
  const { query, facilities, loads, trucks, trailers, drivers } = useAppShell();
  const [params] = useSearchParams();
  const linked = params.get('open');
  const [group, setGroup] = useState<Group>('All');
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(linked ?? facilities.find((f) => !f.archived)?.id ?? null);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [adding, setAdding] = useState<FormValues | null>(null);

  // Arriving from a load's "Facility →" link: open that site and bring it into view.
  useEffect(() => {
    if (!linked) return;
    setOpenId(linked);
    setGroup('All');
    requestAnimationFrame(() => document.getElementById(`fac-${linked}`)?.scrollIntoView({ block: 'center' }));
  }, [linked]);

  const active = facilities.filter((f) => !f.archived);
  const archivedCount = facilities.length - active.length;
  const customerSites = active.filter((f) => isCustomerSite(f.type));
  const openLoads = loads.filter((l) => ACTIVE_STATUSES.includes(l.status));
  const openStops = openLoads.flatMap((l) => stopsOf(l)).filter((s) => facilityFor(active, s.name));
  const risky = customerSites.filter((f) => detentionRisk(f.details));

  // Stops on the load board whose facility is not in the register yet.
  const unknown = new Map<string, { name: string; address: string; loads: string[]; kinds: string[] }>();
  for (const l of loads) {
    for (const s of stopsOf(l)) {
      if (!s.name.trim() || facilityFor(facilities, s.name)) continue;
      const key = s.name.trim().toLowerCase();
      const entry = unknown.get(key) ?? { name: s.name.trim(), address: s.address, loads: [], kinds: [] };
      if (!entry.loads.includes(l.id)) entry.loads.push(l.id);
      if (!entry.kinds.includes(s.kind)) entry.kinds.push(s.kind);
      unknown.set(key, entry);
    }
  }

  const kpis = [
    {
      label: 'Facilities', value: String(active.length),
      note: `${customerSites.length} customer · ${active.filter((f) => isYard(f.type)).length} yards & shops · ${active.filter((f) => isRoad(f.type)).length} road`,
    },
    { label: 'Stops on open loads', value: String(openStops.length), note: `At ${new Set(openStops.map((s) => s.name.toLowerCase())).size} registered sites` },
    { label: 'Appointment only', value: String(customerSites.filter((f) => needsAppointment(f.details)).length), note: 'Book the slot before dispatch' },
    { label: 'Detention risk', value: String(risky.length), note: risky.length ? `${risky.slice(0, 2).map((f) => f.name).join(', ')}${risky.length > 2 ? '…' : ''}` : 'Every dock turns within free time' },
  ];

  const filters: FilterDef<Facility>[] = [
    { key: 'type', label: 'Type', type: 'select', get: (f) => f.type },
    { key: 'customer', label: 'Customer account', type: 'select', get: (f) => f.customer },
    { key: 'state', label: 'State', type: 'select', get: (f) => f.state },
    { key: 'scheduling', label: 'Scheduling', type: 'select', get: (f) => (isCustomerSite(f.type) ? text(f.details, 'scheduling') : '') },
    { key: 'lumper', label: 'Lumper', type: 'select', get: (f) => (isCustomerSite(f.type) ? text(f.details, 'lumper') : '') },
    { key: 'rating', label: 'Driver rating', type: 'select', get: (f) => text(f.details, 'rating') },
    { key: 'open24', label: 'Open 24 hours', type: 'toggle', get: (f) => text(f.details, 'open24') === 'Yes', hint: 'Only sites open 24 hours' },
    { key: 'openToday', label: 'Open today', type: 'toggle', get: (f) => hoursOn(f.details, TODAY_DOW) !== 'Closed', hint: `Only sites open today (${DAY})` },
    { key: 'risk', label: 'Detention risk', type: 'toggle', get: (f) => detentionRisk(f.details), hint: 'Only sites where trucks usually wait past free time' },
  ];
  const base = (showArchived ? facilities : active).filter((f) => inGroup(f, group) && matchesQuery({ ...f, ...f.details }, query));
  const sort = useSort(usePageFilters(base, filters), {
    location: (f) => `${f.state} ${f.city}`, hours: (f) => hoursOn(f.details, TODAY_DOW), scheduling: (f) => (isCustomerSite(f.type) ? schedulingShort(f.details) : ''),
    loads: (f) => (isCustomerSite(f.type) ? stopsUsing(loads, f.name).length : null),
  });
  const rows = sort.rows;

  const action = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {archivedCount > 0 && (
        <label className="ui-check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archivedCount})
        </label>
      )}
      <div className="ui-filter">
        {GROUPS.map((g) => (
          <button key={g} type="button" className={`ui-filter-opt${group === g ? ' is-active' : ''}`} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>
    </div>
  );

  // What happens at this place: loads for a customer site, equipment for a
  // yard, open work orders for a shop.
  const activity = (f: Facility) => {
    if (isCustomerSite(f.type)) {
      const stops = stopsUsing(loads, f.name);
      return (
        <>
          <div className="ui-label">Loads here ({stops.length})</div>
          <div className="ui-kv">
            {stops.length === 0 && <div className="ui-stop-meta">No loads stop here yet.</div>}
            {stops.map((s, i) => (
              <div key={`${s.load.id}-${i}`}>
                <Link className="ui-link" to={`/app/loads/${s.load.id}`}>{s.load.id}</Link>
                <span className="ui-stop-meta"> · {s.kind} · {s.when.split(' · ')[0]} · {s.load.status}</span>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (f.type === 'Company terminal' || f.type === 'Drop yard') {
      const here = trailers.filter((t) => !t.archived && sameName(t.where, `Yard · ${f.city}`));
      const based = trucks.filter((t) => !t.archived && text(t.details, 'terminal').toLowerCase().startsWith(f.city.toLowerCase()));
      const crew = drivers.filter((d) => !d.archived && text(d.details, 'terminal').toLowerCase().startsWith(f.city.toLowerCase()));
      return (
        <>
          <div className="ui-label">Trailers in the yard ({here.length})</div>
          <div className="ui-kv">
            {here.length === 0 && <div className="ui-stop-meta">None parked here.</div>}
            {here.map((t) => <div key={t.id} className="ui-stop-meta"><strong>{t.unit}</strong> · {t.kind} · {t.status}</div>)}
          </div>
          <div className="ui-label" style={{ marginTop: 18 }}>Based here</div>
          <div className="ui-kv">
            <div className="ui-stop-meta">{based.length ? `Trucks: ${based.map((t) => `${t.unit} (${t.status.toLowerCase()})`).join(', ')}` : 'No trucks based here.'}</div>
            {crew.length > 0 && <div className="ui-stop-meta">Drivers: {crew.map((d) => d.name).join(', ')}</div>}
          </div>
          <Link className="ui-link" style={{ display: 'inline-block', marginTop: 12 }} to="/app/fleet/trailers">Fleet →</Link>
        </>
      );
    }
    if (f.type === 'Repair shop') {
      const orders = MAINTENANCE.filter((w) => sameName(w.shop, f.name) && w.status !== 'Done');
      return (
        <>
          <div className="ui-label">Open work orders ({orders.length})</div>
          <div className="ui-kv">
            {orders.length === 0 && <div className="ui-stop-meta">Nothing booked here.</div>}
            {orders.map((w) => <div key={w.unit + w.item} className="ui-stop-meta"><strong>{w.unit}</strong> · {w.item} · {w.status} · due {w.due}</div>)}
          </div>
          <Link className="ui-link" style={{ display: 'inline-block', marginTop: 12 }} to="/app/safety/maintenance">Maintenance →</Link>
        </>
      );
    }
    return (
      <>
        <div className="ui-label">Services</div>
        <div className="ui-kv"><div className="ui-stop-meta">{list(f.details, 'amenities').join(', ') || '—'}</div></div>
      </>
    );
  };

  const detail = (f: Facility) => {
    const v = f.details;
    const lat = text(v, 'lat');
    const lng = text(v, 'lng');
    const mapHref = lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(v))}`;
    const customer = isCustomerSite(f.type);
    const portal = text(v, 'bookingPortal');
    return (
      <div className="ui-expand">
        <div>
          <div className="ui-label">Address</div>
          <div className="ui-kv">
            <div>
              <div className="ui-kv-value">{addressLine(v)}</div>
              {text(v, 'directions') && <div className="ui-stop-meta">{text(v, 'directions')}</div>}
              <a className="ui-link" href={mapHref} target="_blank" rel="noreferrer">Open in Maps ↗</a>
            </div>
            <Item label="Main phone">{text(v, 'phone')}</Item>
            <Item label={customer ? 'Shipping / main contact' : 'Contact'}>
              {[text(v, 'shipName'), text(v, 'shipPhone'), text(v, 'shipEmail')].filter(Boolean).join(' · ')}
            </Item>
            {customer && <Item label="Receiving">{[text(v, 'recvName'), text(v, 'recvPhone'), text(v, 'recvEmail')].filter(Boolean).join(' · ')}</Item>}
            <Item label="After hours">{text(v, 'afterHours')}</Item>
          </div>
        </div>

        <div>
          <div className="ui-label">Hours</div>
          <div className="ui-kv">
            <Item label="Mon–Fri">{hoursOn(v, 1)}</Item>
            <Item label="Saturday">{hoursOn(v, 6)}</Item>
            <Item label="Sunday">{hoursOn(v, 0)}</Item>
            <Item label="Holidays">{text(v, 'holidays')}</Item>
            {customer && <Item label="Scheduling">{text(v, 'scheduling')}</Item>}
            {customer && text(v, 'scheduling') !== 'First come, first served' && (
              <Item label="Booking">
                {[text(v, 'booking'), text(v, 'leadTime') && `${text(v, 'leadTime')} h ahead`].filter(Boolean).join(' · ')}
                {portal && <> · <a className="ui-link" href={portal} target="_blank" rel="noreferrer">Portal ↗</a></>}
              </Item>
            )}
          </div>
        </div>

        <div>
          {customer ? (
            <>
              <div className="ui-label">Dock &amp; loading</div>
              <div className="ui-kv">
                <Item label="Loading">{[text(v, 'loadType'), text(v, 'doors') && Number(text(v, 'doors')) > 0 && `${text(v, 'doors')} doors`].filter(Boolean).join(' · ')}</Item>
                <Item label="Dock">{list(v, 'dockTypes').join(', ')}</Item>
                <Item label="Trailers">{[list(v, 'equipment').join(', '), text(v, 'maxLength') && `up to ${text(v, 'maxLength')}`].filter(Boolean).join(' · ')}</Item>
                <Item label="Lumper">{text(v, 'lumper')}{text(v, 'lumperFee') && text(v, 'lumper').startsWith('Lumper — carrier') ? ` · ~$${text(v, 'lumperFee')}` : ''}</Item>
                <Item label="Time on site">
                  {text(v, 'dwell') && `~${text(v, 'dwell')} h · ${text(v, 'freeTime') || '—'} h free · $${text(v, 'detentionRate') || '—'}/h after`}
                  {detentionRisk(v) && <div style={{ marginTop: 4 }}><Tag label="Detention likely" tagClass="tag-outline" /></div>}
                </Item>
              </div>
            </>
          ) : (
            <>
              <div className="ui-label">{isYard(f.type) ? 'Yard' : 'Stop'}</div>
              <div className="ui-kv">
                <Item label="Ownership">{[text(v, 'ownership'), text(v, 'monthlyCost') && `$${Number(text(v, 'monthlyCost')).toLocaleString('en-US')}/month`].filter(Boolean).join(' · ')}</Item>
                <Item label="Spaces">
                  {[text(v, 'truckSpots') && `${text(v, 'truckSpots')} trucks`, text(v, 'trailerSpots') && `${text(v, 'trailerSpots')} trailers`, text(v, 'bays') && `${text(v, 'bays')} shop bays`].filter(Boolean).join(' · ')}
                </Item>
                <Item label="Security">{list(v, 'security').join(', ')}</Item>
                <Item label="Fuel on site">{text(v, 'fuelOnSite')}</Item>
              </div>
            </>
          )}
          <div className="ui-label" style={{ marginTop: 18 }}>Driver rules</div>
          <div className="ui-kv">
            <Item label="PPE">{list(v, 'ppe').join(', ')}</Item>
            <Item label="Rules">{list(v, 'rules').join(', ')}</Item>
            <Item label="Parking">{text(v, 'parking')}</Item>
            {text(v, 'checkIn') && <div className="ui-stop-meta">{text(v, 'checkIn')}</div>}
          </div>
        </div>

        <div>
          {activity(f)}
          <div className="ui-kv" style={{ marginTop: 18 }}>
            <Item label="Driver rating">{text(v, 'rating')}</Item>
            {text(v, 'notes') && <div className="ui-stop-meta">{text(v, 'notes')}</div>}
            <div className="ui-link-stack">
              <button type="button" className="ui-link" onClick={(e) => { e.stopPropagation(); setEditing(f); }}>Edit facility</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Facility register" flush action={action}>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Facility</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="location">Location</SortTh><SortTh sort={sort} k="hours">Hours · {DAY}</SortTh><SortTh sort={sort} k="scheduling">Scheduling</SortTh>
              <SortTh sort={sort} k="loads" num>Loads</SortTh><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const open = openId === f.id;
              const stops = isCustomerSite(f.type) ? stopsUsing(loads, f.name) : [];
              const live = stops.filter((s) => ACTIVE_STATUSES.includes(s.load.status)).length;
              return (
                <Fragment key={f.id}>
                  <tr id={`fac-${f.id}`} className={`is-clickable${open ? ' is-open' : ''}${f.archived ? ' is-archived' : ''}`} onClick={() => setOpenId(open ? null : f.id)}>
                    <td className="strong">{f.name}</td>
                    <td>{f.archived ? <Tag label="Archived" tagClass="tag-neutral" /> : f.type}</td>
                    <td>{[f.city, f.state].filter(Boolean).join(', ')}</td>
                    <td className={hoursOn(f.details, TODAY_DOW) === 'Closed' ? 'muted' : ''}>{hoursOn(f.details, TODAY_DOW)}</td>
                    <td>{isCustomerSite(f.type) ? schedulingShort(f.details) : <span className="muted">—</span>}</td>
                    <td className="num">{isCustomerSite(f.type) ? (live ? `${live} open · ${stops.length}` : String(stops.length)) : '—'}</td>
                    <td className="num">
                      <button type="button" className="ui-link" onClick={(e) => { e.stopPropagation(); setEditing(f); }}>Edit</button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="ui-expand-cell">{detail(f)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{base.length ? 'Nothing matches the search or filters.' : 'No facilities in this view.'}</div>}
      </Card>

      {unknown.size > 0 && (
        <Card title="Stops not in the register" flush action={<span style={{ fontSize: 13, color: 'var(--ui-muted)' }}>Add them so drivers get the site details</span>}>
          <table className="ui-table">
            <thead>
              <tr><th>Facility on the load</th><th>Address</th><th>Loads</th><th className="num" aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {[...unknown.values()].map((u) => (
                <tr key={u.name}>
                  <td className="strong">{u.name}</td>
                  <td className="muted">{u.address}</td>
                  <td>{u.loads.map((id, i) => <Fragment key={id}>{i > 0 && ', '}<Link className="ui-link" to={`/app/loads/${id}`}>{id}</Link></Fragment>)}</td>
                  <td className="num">
                    <button type="button" className="ui-link" onClick={() => setAdding(prefillFromStop(u.name, u.address, u.kinds))}>+ Add to register</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && <FacilityDialog facility={editing} onClose={() => setEditing(null)} />}
      {adding && <FacilityDialog prefill={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

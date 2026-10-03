// Urgent alerts: the few things that need someone right now, shown in the
// notification bar at the top of the sidebar (release 1.14). Only what puts
// a load, a driver or a customer at risk today belongs here; everything else
// (renewals due, invoices overdue) stays on the dashboard.
import { driverDocuments } from './compliance';
import type { FleetDriver } from './fleet';
import { pickupIso } from './loads';
import type { Load } from './mock';
import type { WorkOrder } from './safetyRecords';

export interface UrgentAlert {
  // Stable, so the list does not jump around between renders.
  key: string;
  text: string;
  // Where to go to deal with it.
  to: string;
}

// Loads that have set off and not yet arrived, and those about to.
const ON_THE_ROAD = ['At pickup', 'In transit', 'Delayed'];
const COMMITTED = ['Dispatched', ...ON_THE_ROAD];

// 'T-114 / RF-88' → ['T-114', 'RF-88'].
const unitsOf = (l: Pick<Load, 'unit'>) => l.unit.split('/').map((u) => u.trim()).filter((u) => u && u !== '—');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function urgentAlerts(loads: Load[], workOrders: WorkOrder[], drivers: FleetDriver[], today: string): UrgentAlert[] {
  const out: UrgentAlert[] = [];
  const committed = loads.filter((l) => COMMITTED.includes(l.status));

  // 1. A truck or trailer broken down or out of service while it has a load.
  const openOrders = workOrders.filter((w) => w.status !== 'Done' && w.status !== 'Cancelled' && w.outOfService);
  for (const w of openOrders) {
    const load = committed.find((l) => unitsOf(l).includes(w.unit));
    if (!load) continue;
    const brokeDown = w.source === 'Breakdown' || w.type === 'Roadside breakdown';
    const where = ON_THE_ROAD.includes(load.status) ? 'while en route with' : 'while dispatched on';
    out.push({
      key: `wo:${w.id}`,
      text: `${w.unitKind} ${w.unit} ${brokeDown ? 'reported a breakdown' : 'is out of service'} ${where} load ${load.id}`,
      to: `/app/loads/${load.id}`,
    });
  }

  // 2. Loads running late.
  for (const l of loads.filter((x) => x.status === 'Delayed')) {
    out.push({ key: `late:${l.id}`, text: `Load ${l.id} is delayed · ${l.route}`, to: `/app/loads/${l.id}` });
  }

  // 3. A pickup today (or already missed) with nobody to haul it.
  for (const l of loads.filter((x) => x.status === 'Needs driver')) {
    const day = pickupIso(l);
    if (!day || day > today) continue;
    out.push({
      key: `nodriver:${l.id}`,
      text: day === today ? `Load ${l.id} picks up today and has no driver` : `Load ${l.id} was due for pickup on ${short(day)} and has no driver`,
      to: `/app/loads/${l.id}`,
    });
  }

  // 4. A driver on a load with an expired CDL or medical card.
  const expired = driverDocuments(drivers).filter((d) => d.status === 'Expired' && (d.document === 'CDL' || d.document === 'Medical card'));
  for (const d of expired) {
    const load = committed.find((l) => l.driver.split('/').map((n) => n.trim()).includes(d.driver));
    if (!load) continue;
    out.push({ key: `doc:${d.driverId}:${d.document}`, text: `${d.driver} is on load ${load.id} with an expired ${d.document === 'CDL' ? 'CDL' : 'medical card'}`, to: `/app/loads/${load.id}` });
  }

  return out;
}

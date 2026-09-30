// Facilities: every place a truck stops — customer pickup and delivery sites,
// Sunridge's own terminals, drop yards and shops, and the truck stops and
// scales on the regular lanes. Each record keeps its table fields plus
// `details`, every field of its Add / Edit form (same shape as the fleet).
// Load stops link to a facility by name, so the demo sites below use the
// exact names on the load board.
import type { FormValues } from './fleet';
import { stopsOf, type Load } from './mock';
import { TODAY } from './planner';

export interface Facility {
  id: string;
  name: string;
  type: string;
  city: string;
  state: string;
  customer: string;
  archived?: boolean;
  details: FormValues;
}

// — choices used by the form —

export const CUSTOMER_SITE_TYPES = ['Shipper', 'Receiver', 'Shipper & receiver', 'Cross-dock', 'Port / rail ramp'];
export const YARD_TYPES = ['Company terminal', 'Drop yard', 'Repair shop'];
export const ROAD_TYPES = ['Truck stop', 'Scale / inspection'];
export const FACILITY_TYPES = [...CUSTOMER_SITE_TYPES, ...YARD_TYPES, ...ROAD_TYPES];

export const SCHEDULING = ['First come, first served', 'Appointment required', 'FCFS or appointment'];
export const BOOKING = ['Phone', 'Email', 'Online portal', 'Customer books it'];
export const DOCK_TYPES = ['Dock-high', 'Ground level', 'Drive-in', 'Side load (forklift)', 'Overhead crane'];
export const LOAD_TYPES = ['Live load / unload', 'Drop and hook', 'Live or drop'];
export const EQUIPMENT_ACCEPTED = ['Dry van', 'Reefer', 'Flatbed', 'Step deck', 'Conestoga', 'Tanker'];
export const MAX_LENGTHS = ['48 ft', '53 ft'];
export const LUMPER = ['No lumper', 'Lumper — carrier pays, bill customer', 'Lumper — facility pays'];
export const SITE_OWNERSHIP = ['Owned', 'Leased', 'Third party'];
export const SECURITY = ['Gated', 'Cameras', 'Guard on site', 'Lit at night'];
export const AMENITIES = ['Diesel', 'DEF', 'CAT scale', 'Truck parking', 'Showers', 'Tire / repair', 'Reefer fuel'];
export const PPE = ['Hi-vis vest', 'Hard hat', 'Steel-toe boots', 'Safety glasses', 'Long pants'];
export const SITE_RULES = [
  'Photo ID at gate', 'TWIC card', 'Driver stays in cab', 'Driver counts freight', 'Seal check at gate',
  'Chock wheels / glad-hand lock', 'No passengers or pets',
];
export const PARKING = ['Overnight parking', 'Staging only (no overnight)', 'No truck parking'];
export const RATINGS = ['5 — Easy in, easy out', '4 — Good', '3 — OK', '2 — Slow', '1 — Avoid if possible'];

export const isCustomerSite = (type: string) => CUSTOMER_SITE_TYPES.includes(type);
export const isYard = (type: string) => YARD_TYPES.includes(type);
export const isRoad = (type: string) => ROAD_TYPES.includes(type);

// — reading a facility —

const str = (v: FormValues, k: string) => {
  const x = v[k];
  return typeof x === 'string' ? x.trim() : '';
};
export const list = (v: FormValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);

// Stop and facility names are matched ignoring case and extra spaces.
export const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export function facilityFor(facilities: Facility[], name: string): Facility | undefined {
  return name.trim() ? facilities.find((f) => sameName(f.name, name)) : undefined;
}

// 0 = Sunday … 6 = Saturday.
export function hoursOn(v: FormValues, day: number): string {
  if (str(v, 'open24') === 'Yes') return 'Open 24 hours';
  const [open, close] = day === 0 ? ['sunOpen', 'sunClose'] : day === 6 ? ['satOpen', 'satClose'] : ['wkOpen', 'wkClose'];
  return str(v, open) && str(v, close) ? `${str(v, open)}–${str(v, close)}` : 'Closed';
}

// The demo's "today" (the planner's), so hours line up with the load board.
export const TODAY_DOW = new Date(`${TODAY}T12:00:00`).getDay();

export function schedulingShort(v: FormValues): string {
  const s = str(v, 'scheduling');
  if (s === 'Appointment required') return 'Appointment';
  if (s === 'FCFS or appointment') return 'FCFS or appt';
  if (s === 'First come, first served') return 'FCFS';
  return '—';
}

export function needsAppointment(v: FormValues) {
  return str(v, 'scheduling') === 'Appointment required';
}

// Typical time on site is longer than the free time: detention is likely.
export function detentionRisk(v: FormValues) {
  const dwell = Number(str(v, 'dwell'));
  const free = Number(str(v, 'freeTime'));
  return dwell > 0 && free > 0 && dwell > free;
}

// One line a dispatcher reads before sending a truck: how to get in and what
// it will cost in time.
export function stopHint(f: Facility): string {
  const v = f.details;
  const parts = [`${hoursOn(v, TODAY_DOW) === 'Closed' ? 'Closed today' : `Today ${hoursOn(v, TODAY_DOW)}`}`];
  if (isCustomerSite(f.type)) {
    const s = str(v, 'scheduling');
    if (s) parts.push(s === 'Appointment required' && str(v, 'booking') ? `Appointment (${str(v, 'booking').toLowerCase()})` : schedulingShort(v));
    if (str(v, 'lumper').startsWith('Lumper — carrier')) parts.push(`Lumper ~$${str(v, 'lumperFee') || '?'}`);
    if (str(v, 'dwell')) parts.push(`~${str(v, 'dwell')} h on site`);
  }
  if (list(v, 'rules').includes('TWIC card')) parts.push('TWIC');
  if (list(v, 'ppe').length) parts.push(`PPE: ${list(v, 'ppe').join(', ').toLowerCase()}`);
  return parts.join(' · ');
}

export function addressLine(v: FormValues) {
  const cityLine = [str(v, 'city'), [str(v, 'state'), str(v, 'zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [str(v, 'street'), cityLine].filter(Boolean).join(', ');
}

export function facilityFromForm(v: FormValues, id: string, prev?: Facility): Facility {
  const type = str(v, 'type');
  return {
    id,
    name: str(v, 'name'),
    type,
    city: str(v, 'city'),
    state: str(v, 'state').toUpperCase(),
    customer: isCustomerSite(type) ? str(v, 'customer') : '',
    archived: prev?.archived,
    details: { ...v, name: str(v, 'name'), state: str(v, 'state').toUpperCase() },
  };
}

// '3900 W Cheyenne Ave, North Las Vegas, NV 89032' → form fields, for adding a
// facility straight from a load stop.
export function prefillFromStop(name: string, address: string): FormValues {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const last = parts.length > 1 ? parts.pop() ?? '' : '';
  const [state = '', zip = ''] = last.split(/\s+/);
  const city = parts.length > 1 ? parts.pop() ?? '' : '';
  return { name, street: parts.join(', '), city, state: state.toUpperCase(), zip };
}

// Every load stop at a facility, newest loads first as on the board.
export interface SiteStop {
  load: Load;
  kind: string;
  when: string;
}

export function stopsUsing(loads: Load[], name: string): SiteStop[] {
  return loads.flatMap((l) => stopsOf(l).filter((s) => sameName(s.name, name)).map((s) => ({ load: l, kind: s.kind, when: s.when })));
}

// Renaming a facility carries through to the loads that stop there.
export function renameInLoad(l: Load, from: string, to: string): Load {
  const hit = (n: string) => sameName(n, from);
  const touches = hit(l.from) || hit(l.to) || (l.stops ?? []).some((s) => hit(s.name));
  if (!touches) return l;
  const form = l.form as { stops?: { facility: string }[] } | undefined;
  return {
    ...l,
    from: hit(l.from) ? to : l.from,
    to: hit(l.to) ? to : l.to,
    stops: l.stops?.map((s) => (hit(s.name) ? { ...s, name: to } : s)),
    form: form && Array.isArray(form.stops)
      ? { ...form, stops: form.stops.map((s) => (hit(s.facility) ? { ...s, facility: to } : s)) }
      : l.form,
  };
}

// — the demo register (Sunridge Freight, Modesto CA) —

const BLANK: FormValues = {
  name: '', type: '', customer: '', siteCode: '', phone: '',
  street: '', city: '', state: '', zip: '', lat: '', lng: '', directions: '',
  open24: 'No', wkOpen: '', wkClose: '', satOpen: '', satClose: '', sunOpen: '', sunClose: '',
  scheduling: '', booking: '', bookingPortal: '', leadTime: '', holidays: '',
  doors: '', dockTypes: [], loadType: '', equipment: [], maxLength: '', lumper: '', lumperFee: '', dwell: '', freeTime: '', detentionRate: '',
  truckSpots: '', trailerSpots: '', bays: '', security: [], fuelOnSite: '', ownership: '', monthlyCost: '', amenities: [],
  ppe: [], rules: [], parking: '', checkIn: '',
  shipName: '', shipPhone: '', shipEmail: '', recvName: '', recvPhone: '', recvEmail: '', afterHours: '',
  rating: '', notes: '',
};

export const FACILITY_BLANK = BLANK;

const site = (v: FormValues): FormValues => ({ ...BLANK, ...v });

const DETAILS: FormValues[] = [
  // — customer sites —
  site({
    name: 'Northgate Cold Storage', type: 'Shipper', customer: 'Northgate Foods', siteCode: 'NGF-FRE-01', phone: '(559) 555-0180',
    street: '4120 S Golden State Blvd', city: 'Fresno', state: 'CA', zip: '93725', lat: '36.6917', lng: '-119.7560',
    directions: 'Trucks use the south gate off E Central Ave. Do not enter from Golden State Blvd — the front lot is cars only.',
    wkOpen: '05:00', wkClose: '21:00', satOpen: '06:00', satClose: '14:00',
    scheduling: 'Appointment required', booking: 'Online portal', bookingPortal: 'https://dock.northgatefoods.example/fresno', leadTime: '24',
    holidays: 'Closed Thanksgiving, Christmas Day, New Year’s Day',
    doors: '24', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Reefer'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '2', freeTime: '2', detentionRate: '75',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Driver stays in cab', 'Seal check at gate'], parking: 'Staging only (no overnight)',
    checkIn: 'Check in at the guard shack with the PO number. Reefer must be pre-cooled to -10 °F and running continuous — they pulp-check before loading.',
    shipName: 'Tomás Villa (shipping lead)', shipPhone: '(559) 555-0184', shipEmail: 'shipping.fresno@northgatefoods.example',
    afterHours: '(559) 555-0199', rating: '4 — Good', notes: 'Frozen produce, usually 40–42K lb. Door assignments by text after check-in.',
  }),
  site({
    name: 'Northgate Creamery', type: 'Shipper', customer: 'Northgate Foods', siteCode: 'NGF-BFL-02', phone: '(661) 555-0122',
    street: '3011 Buck Owens Blvd', city: 'Bakersfield', state: 'CA', zip: '93308', lat: '35.3930', lng: '-119.0430',
    directions: 'From CA-99 take Rosedale Hwy east, right on Buck Owens Blvd. Truck entrance is the second driveway.',
    wkOpen: '04:00', wkClose: '20:00', satOpen: '04:00', satClose: '20:00', sunOpen: '06:00', sunClose: '14:00',
    scheduling: 'Appointment required', booking: 'Email', leadTime: '12',
    doors: '10', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Reefer'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '1.5', freeTime: '2', detentionRate: '75',
    ppe: ['Hi-vis vest', 'Safety glasses'], rules: ['Photo ID at gate', 'Seal check at gate', 'No passengers or pets'], parking: 'Staging only (no overnight)',
    checkIn: 'Dairy: pre-cool to 34 °F. Hairnets are provided at the dock office if you go on the floor.',
    shipName: 'Carla Soto', shipPhone: '(661) 555-0125', shipEmail: 'creamery.shipping@northgatefoods.example',
    rating: '5 — Easy in, easy out', notes: 'Fast turns; usually loaded in under 90 minutes.',
  }),
  site({
    name: 'Reno Grocers DC', type: 'Receiver', customer: 'Northgate Foods', siteCode: 'RG-DC1', phone: '(775) 555-0140',
    street: '1855 E Greg St', city: 'Sparks', state: 'NV', zip: '89431', lat: '39.5220', lng: '-119.7390',
    directions: 'I-80 exit 17 (Rock Blvd) south, left on Greg St. Receiving gate is at the east end of the building.',
    open24: 'Yes',
    scheduling: 'Appointment required', booking: 'Online portal', bookingPortal: 'https://appointments.renogrocers.example', leadTime: '48',
    doors: '40', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Dry van', 'Reefer'], maxLength: '53 ft',
    lumper: 'Lumper — carrier pays, bill customer', lumperFee: '185', dwell: '3.5', freeTime: '2', detentionRate: '75',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Chock wheels / glad-hand lock'], parking: 'Overnight parking',
    checkIn: 'Lumper is paid by Comchek at the receiving window — get a receipt for billing. Late arrivals (over 30 min) are reworked to the next open slot.',
    recvName: 'Receiving office', recvPhone: '(775) 555-0146', recvEmail: 'receiving@renogrocers.example',
    rating: '2 — Slow', notes: 'Detention is common; send the arrival and departure times from the ELD with the invoice.',
  }),
  site({
    name: 'Valley Foods DC', type: 'Receiver', customer: 'Northgate Foods', siteCode: 'VF-PHX', phone: '(602) 555-0171',
    street: '2240 W Buckeye Rd', city: 'Phoenix', state: 'AZ', zip: '85009', lat: '33.4380', lng: '-112.1050',
    directions: 'I-17 exit 197 (Buckeye Rd) west. Enter at the second gate; the first is for outbound.',
    open24: 'Yes',
    scheduling: 'Appointment required', booking: 'Online portal', bookingPortal: 'https://valleyfoods.example/carriers', leadTime: '24',
    doors: '52', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Reefer', 'Dry van'], maxLength: '53 ft',
    lumper: 'Lumper — carrier pays, bill customer', lumperFee: '210', dwell: '4', freeTime: '2', detentionRate: '75',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Driver counts freight'], parking: 'Overnight parking',
    checkIn: 'Temperature is read at the door. Keep the POD and the lumper receipt together.',
    recvName: 'Andre Holt (receiving)', recvPhone: '(602) 555-0175', recvEmail: 'dock@valleyfoods.example',
    rating: '2 — Slow', notes: 'Summer: arrive early; the yard backs up after 10:00.',
  }),
  site({
    name: 'Bayline DC 4', type: 'Shipper & receiver', customer: 'Bayline Distribution', siteCode: 'BAY-04', phone: '(209) 555-0133',
    street: '2900 Navy Dr', city: 'Stockton', state: 'CA', zip: '95206', lat: '37.9420', lng: '-121.3290',
    directions: 'CA-4 west to Navy Dr. The truck gate is past the rail spur; follow the blue signs.',
    wkOpen: '04:00', wkClose: '22:00', satOpen: '06:00', satClose: '14:00',
    scheduling: 'FCFS or appointment', booking: 'Phone', leadTime: '4',
    doors: '60', dockTypes: ['Dock-high', 'Drive-in'], loadType: 'Live or drop', equipment: ['Dry van'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '1.5', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Chock wheels / glad-hand lock'], parking: 'Staging only (no overnight)',
    checkIn: 'Drop trailers go to rows D–F. Preloads are listed on the board inside the dispatch window.',
    shipName: 'Owen Petrakis', shipPhone: '(209) 555-0138', shipEmail: 'owen.petrakis@bayline.example',
    recvName: 'Inbound desk', recvPhone: '(209) 555-0139',
    rating: '4 — Good', notes: 'Pool of 6 Sunridge trailers kept here for preloads.',
  }),
  site({
    name: 'Bayline LA Annex', type: 'Shipper', customer: 'Bayline Distribution', siteCode: 'BAY-LA', phone: '(323) 555-0150',
    street: '5200 S Boyle Ave', city: 'Vernon', state: 'CA', zip: '90058', lat: '33.9960', lng: '-118.2100',
    directions: 'I-710 to Bandini Blvd west, left on Boyle. Tight street — swing wide into the gate.',
    wkOpen: '05:00', wkClose: '17:00',
    scheduling: 'First come, first served',
    doors: '18', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Dry van'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '2', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate'], parking: 'No truck parking',
    checkIn: 'Last load-in at 15:30. No parking on Boyle Ave — the city tickets trucks.',
    shipName: 'Marisol Ortega', shipPhone: '(323) 555-0154',
    rating: '3 — OK',
  }),
  site({
    name: 'Wasatch Crossdock', type: 'Cross-dock', customer: 'Bayline Distribution', siteCode: 'WX-SLC', phone: '(801) 555-0160',
    street: '1740 S 4130 W', city: 'Salt Lake City', state: 'UT', zip: '84104', lat: '40.7320', lng: '-111.9850',
    directions: 'I-80 exit 113 (5600 W) is the easy way in; avoid 4000 W at shift change.',
    wkOpen: '06:00', wkClose: '18:00', satOpen: '06:00', satClose: '18:00',
    scheduling: 'Appointment required', booking: 'Email', leadTime: '24',
    doors: '36', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Dry van', 'Reefer'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '2', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest', 'Steel-toe boots'], rules: ['Photo ID at gate', 'Driver stays in cab'], parking: 'Staging only (no overnight)',
    checkIn: 'Call the number on the gate sign when you are 30 minutes out.',
    recvName: 'Kelsey Brandt', recvPhone: '(801) 555-0163', recvEmail: 'appointments@wasatchx.example',
    rating: '4 — Good',
  }),
  site({
    name: 'Cascade Yard 2', type: 'Shipper', customer: 'Cascade Building Supply', siteCode: 'CBS-SAC2', phone: '(916) 555-0115',
    street: '8300 Elder Creek Rd', city: 'Sacramento', state: 'CA', zip: '95824', lat: '38.5160', lng: '-121.3960',
    directions: 'CA-99 to Florin Perkins Rd north, right on Elder Creek. Scale house is on the left inside the gate.',
    wkOpen: '06:00', wkClose: '15:30',
    scheduling: 'First come, first served',
    doors: '0', dockTypes: ['Ground level', 'Side load (forklift)'], loadType: 'Live load / unload', equipment: ['Flatbed', 'Step deck', 'Conestoga'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '3', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest', 'Hard hat', 'Steel-toe boots'], rules: ['Photo ID at gate', 'Chock wheels / glad-hand lock'], parking: 'Staging only (no overnight)',
    checkIn: 'Driver secures and tarps the load — bring 8 straps, 4 corner protectors and lumber tarps. Weigh out at the scale house before leaving.',
    shipName: 'Marta Lind', shipPhone: '(916) 555-0119', shipEmail: 'marta.lind@cascadebuild.example',
    rating: '3 — OK', notes: 'Loading slows after 13:00; aim to arrive by 09:00.',
  }),
  site({
    name: 'Cascade Mill', type: 'Shipper', customer: 'Cascade Building Supply', siteCode: 'CBS-RDD', phone: '(530) 555-0126',
    street: '3400 Airport Rd', city: 'Redding', state: 'CA', zip: '96002', lat: '40.5230', lng: '-122.3130',
    directions: 'I-5 exit 675 (Cypress Ave) east, right on Airport Rd. Coil building is at the back of the lot.',
    wkOpen: '06:00', wkClose: '14:30',
    scheduling: 'Appointment required', booking: 'Phone', leadTime: '24',
    doors: '0', dockTypes: ['Ground level', 'Overhead crane'], loadType: 'Live load / unload', equipment: ['Flatbed', 'Step deck'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '1.5', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest', 'Hard hat', 'Steel-toe boots', 'Safety glasses'], rules: ['Photo ID at gate', 'Driver stays in cab'], parking: 'No truck parking',
    checkIn: 'Steel coil: bring coil racks and chains (4 per coil). Driver stays clear of the crane — wait in the marked area.',
    shipName: 'Ray Donnelly', shipPhone: '(530) 555-0129',
    rating: '4 — Good',
  }),
  site({
    name: 'Boise Builders Depot', type: 'Receiver', customer: 'Cascade Building Supply', siteCode: 'BBD-MER', phone: '(208) 555-0142',
    street: '440 E Corporate Dr', city: 'Meridian', state: 'ID', zip: '83642', lat: '43.5890', lng: '-116.3920',
    directions: 'I-84 exit 44 (Meridian Rd) north, right on Corporate Dr. Lumber yard entrance is on the east side.',
    wkOpen: '07:00', wkClose: '16:00', satOpen: '08:00', satClose: '12:00',
    scheduling: 'First come, first served',
    doors: '0', dockTypes: ['Ground level', 'Side load (forklift)'], loadType: 'Live load / unload', equipment: ['Flatbed', 'Step deck', 'Conestoga'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '1.5', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest', 'Hard hat'], rules: ['Photo ID at gate'], parking: 'Staging only (no overnight)',
    checkIn: 'Untarp and unstrap in the staging lane before pulling to the forklift.',
    recvName: 'Yard office', recvPhone: '(208) 555-0145',
    rating: '4 — Good',
  }),
  site({
    name: 'Port of Oakland, Berth 22', type: 'Port / rail ramp', customer: 'Harbor Point Retail', siteCode: 'OAK-B22', phone: '(510) 555-0111',
    street: '1599 Maritime St', city: 'Oakland', state: 'CA', zip: '94607', lat: '37.8110', lng: '-122.3150',
    directions: 'I-880 to 7th St west, right on Maritime St. Truck queue forms on Maritime — do not stage on 7th.',
    wkOpen: '07:00', wkClose: '17:00', satOpen: '08:00', satClose: '16:00',
    scheduling: 'Appointment required', booking: 'Online portal', bookingPortal: 'https://portal.oaklandterminals.example', leadTime: '24',
    holidays: 'Closed on ILWU holidays',
    doors: '12', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Dry van'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '3', freeTime: '3', detentionRate: '75',
    ppe: ['Hi-vis vest', 'Steel-toe boots'], rules: ['Photo ID at gate', 'TWIC card', 'Driver stays in cab'], parking: 'No truck parking',
    checkIn: 'TWIC card and the terminal appointment number are both checked at the gate. Transload warehouse is building C.',
    shipName: 'Terminal transload desk', shipPhone: '(510) 555-0117', shipEmail: 'transload@oaklandterminals.example',
    rating: '2 — Slow', notes: 'Harbor Point imports are transloaded here into 53 ft dry vans.',
  }),
  site({
    name: 'Harbor Point DC', type: 'Receiver', customer: 'Harbor Point Retail', siteCode: 'HP-PDX', phone: '(503) 555-0152',
    street: '6200 N Basin Ave', city: 'Portland', state: 'OR', zip: '97217', lat: '45.5970', lng: '-122.7070',
    directions: 'I-5 exit 307 (Marine Dr) west, left on N Portland Rd, right on Basin Ave.',
    wkOpen: '05:00', wkClose: '19:00',
    scheduling: 'Appointment required', booking: 'Email', leadTime: '24',
    doors: '30', dockTypes: ['Dock-high'], loadType: 'Drop and hook', equipment: ['Dry van'], maxLength: '53 ft',
    lumper: 'Lumper — facility pays', dwell: '1', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Chock wheels / glad-hand lock'], parking: 'Staging only (no overnight)',
    checkIn: 'Drop the loaded trailer in the assigned slot and hook an empty from row E.',
    recvName: 'Jules Amari', recvPhone: '(503) 555-0157', recvEmail: 'receiving.pdx@harborpoint.example',
    rating: '5 — Easy in, easy out',
  }),
  site({
    name: 'Sierra Ag Huller 3', type: 'Shipper', customer: 'Sierra Ag Partners', siteCode: 'SAG-H3', phone: '(209) 555-0166',
    street: '1901 Crows Landing Rd', city: 'Modesto', state: 'CA', zip: '95358', lat: '37.6150', lng: '-121.0120',
    directions: 'CA-99 exit Crows Landing Rd south. Huller entrance is past the canal bridge on the right.',
    wkOpen: '06:00', wkClose: '18:00', satOpen: '06:00', satClose: '18:00',
    scheduling: 'First come, first served', holidays: 'Harvest season (Aug–Oct) runs Saturdays too',
    doors: '6', dockTypes: ['Dock-high', 'Side load (forklift)'], loadType: 'Live load / unload', equipment: ['Dry van'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '3', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Seal check at gate'], parking: 'Overnight parking',
    checkIn: 'Food-grade trailers only: swept, dry and odor-free. They inspect before loading and reject wet floors.',
    shipName: 'Ben Okafor', shipPhone: '(209) 555-0168', shipEmail: 'ben.okafor@sierraag.example',
    rating: '3 — OK', notes: 'Close to the Modesto terminal — good for early-morning pre-loads.',
  }),
  site({
    name: 'Front Range Foods', type: 'Receiver', customer: 'Sierra Ag Partners', siteCode: 'FRF-DEN', phone: '(303) 555-0131',
    street: '5400 Havana St', city: 'Denver', state: 'CO', zip: '80239', lat: '39.7960', lng: '-104.8660',
    directions: 'I-70 exit 280 (Havana St) north. Receiving is on the north side of the building.',
    wkOpen: '05:00', wkClose: '15:00',
    scheduling: 'Appointment required', booking: 'Phone', leadTime: '24',
    doors: '20', dockTypes: ['Dock-high'], loadType: 'Live load / unload', equipment: ['Dry van', 'Reefer'], maxLength: '53 ft',
    lumper: 'Lumper — carrier pays, bill customer', lumperFee: '150', dwell: '2.5', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest'], rules: ['Photo ID at gate', 'Driver counts freight'], parking: 'Staging only (no overnight)',
    checkIn: 'Appointments are by phone only, 06:00–14:00 MT.',
    recvName: 'Nina Park', recvPhone: '(303) 555-0134',
    rating: '3 — OK',
  }),
  site({
    name: 'Duwamish Steel Yard', type: 'Receiver', customer: 'Cascade Building Supply', siteCode: 'DSY-SEA', phone: '(206) 555-0120',
    street: '8100 E Marginal Way S', city: 'Seattle', state: 'WA', zip: '98108', lat: '47.5320', lng: '-122.3150',
    directions: 'I-5 exit 158 (Boeing Access Rd) to E Marginal Way north. Gate 3 for inbound steel.',
    wkOpen: '06:00', wkClose: '15:00',
    scheduling: 'FCFS or appointment', booking: 'Phone', leadTime: '12',
    doors: '0', dockTypes: ['Ground level', 'Overhead crane'], loadType: 'Live load / unload', equipment: ['Flatbed', 'Step deck'], maxLength: '53 ft',
    lumper: 'No lumper', dwell: '1.5', freeTime: '2', detentionRate: '60',
    ppe: ['Hi-vis vest', 'Hard hat', 'Steel-toe boots', 'Safety glasses'], rules: ['Photo ID at gate', 'Driver stays in cab'], parking: 'No truck parking',
    checkIn: 'Unchain in the staging lane, then pull under crane bay 2.',
    recvName: 'Gate 3 office', recvPhone: '(206) 555-0124',
    rating: '4 — Good',
  }),

  // — Sunridge yards and shops —
  site({
    name: 'Sunridge Modesto Terminal', type: 'Company terminal', siteCode: 'SRF-MOD', phone: '(209) 555-0100',
    street: '2250 Finch Rd', city: 'Modesto', state: 'CA', zip: '95354', lat: '37.6280', lng: '-120.9580',
    directions: 'CA-99 exit Crows Landing Rd, east on Finch Rd. Keypad gate; code is in the driver app.',
    open24: 'Yes',
    truckSpots: '20', trailerSpots: '35', bays: '3', security: ['Gated', 'Cameras', 'Lit at night'], fuelOnSite: 'Yes', ownership: 'Leased', monthlyCost: '3900',
    ppe: ['Hi-vis vest'], rules: ['Chock wheels / glad-hand lock'], parking: 'Overnight parking',
    checkIn: 'Park tractors in the north row, trailers by type (reefer row A, dry van row B, flatbed along the fence). Post-trip DVIR before leaving the yard.',
    shipName: 'Rosa Medina (dispatch)', shipPhone: '(209) 555-0101', shipEmail: 'dispatch@sunridgefreight.com',
    afterHours: '(209) 555-0109', notes: 'Main yard and office. Lease renews Mar 2027.',
  }),
  site({
    name: 'Sunridge shop · Modesto', type: 'Repair shop', siteCode: 'SRF-SHOP', phone: '(209) 555-0102',
    street: '2250 Finch Rd', city: 'Modesto', state: 'CA', zip: '95354', lat: '37.6282', lng: '-120.9575',
    directions: 'Inside the Modesto terminal, south building.',
    wkOpen: '06:00', wkClose: '18:00', satOpen: '07:00', satClose: '12:00',
    bays: '3', security: ['Gated', 'Cameras'], ownership: 'Leased',
    ppe: ['Safety glasses', 'Steel-toe boots'], rules: ['Chock wheels / glad-hand lock'],
    checkIn: 'Leave keys and a written defect note in the drop box if the shop is closed.',
    shipName: 'Luis Ortega (shop lead)', shipPhone: '(209) 555-0103', shipEmail: 'shop@sunridgefreight.com',
    notes: 'PMs, brakes, tires and DOT annual inspections. Engine work goes out to Valley Diesel & Turbo.',
  }),
  site({
    name: 'Sunridge Fresno Drop Yard', type: 'Drop yard', siteCode: 'SRF-FRE', phone: '(209) 555-0100',
    street: '2920 S Cherry Ave', city: 'Fresno', state: 'CA', zip: '93706', lat: '36.7090', lng: '-119.7690',
    directions: 'CA-99 exit Jensen Ave east, north on Cherry Ave. Gate is shared with Cherry Ave Storage.',
    open24: 'Yes',
    truckSpots: '4', trailerSpots: '12', security: ['Gated', 'Cameras'], fuelOnSite: 'No', ownership: 'Leased', monthlyCost: '1450',
    rules: ['Chock wheels / glad-hand lock'], parking: 'Overnight parking',
    checkIn: 'Trailers only; lock glad-hands on every dropped trailer.',
    shipName: 'Rosa Medina (dispatch)', shipPhone: '(209) 555-0101',
    notes: 'Staging for Northgate Cold Storage reefers.',
  }),
  site({
    name: 'Sunridge Sacramento Drop Yard', type: 'Drop yard', siteCode: 'SRF-SAC', phone: '(209) 555-0100',
    street: '6601 Florin Perkins Rd', city: 'Sacramento', state: 'CA', zip: '95828', lat: '38.4960', lng: '-121.3940',
    directions: 'CA-99 exit Florin Rd east, left on Florin Perkins Rd.',
    open24: 'Yes',
    truckSpots: '2', trailerSpots: '8', security: ['Gated', 'Lit at night'], fuelOnSite: 'No', ownership: 'Leased', monthlyCost: '980',
    rules: ['Chock wheels / glad-hand lock'], parking: 'Overnight parking',
    shipName: 'Evan Brooks (dispatch)', shipPhone: '(209) 555-0105',
    notes: 'Flatbeds for Cascade Yard 2 are staged here overnight.',
  }),
  site({
    name: 'Thermo King · Fresno', type: 'Repair shop', siteCode: 'V-TKF', phone: '(559) 555-0190',
    street: '3285 S Maple Ave', city: 'Fresno', state: 'CA', zip: '93725', lat: '36.7040', lng: '-119.7430',
    wkOpen: '07:00', wkClose: '17:00', satOpen: '08:00', satClose: '12:00',
    bays: '4', ownership: 'Third party',
    ppe: ['Safety glasses'], rules: ['Photo ID at gate'],
    checkIn: 'Reefer service by appointment; bring the unit hours from the controller.',
    shipName: 'Service writer', shipPhone: '(559) 555-0192', shipEmail: 'service@tk-fresno.example',
    notes: 'Authorized reefer service for the Thermo King units on RF-27, RF-09 and RF-88.',
  }),
  site({
    name: 'Valley Truck Center · Stockton', type: 'Repair shop', siteCode: 'V-VTC', phone: '(209) 555-0177',
    street: '4501 S El Dorado St', city: 'Stockton', state: 'CA', zip: '95206', lat: '37.9160', lng: '-121.2930',
    wkOpen: '07:00', wkClose: '19:00', satOpen: '08:00', satClose: '14:00',
    bays: '8', ownership: 'Third party',
    ppe: ['Safety glasses'], rules: ['Photo ID at gate'],
    checkIn: 'DOT annual inspections Tuesday and Thursday mornings.',
    shipName: 'Service desk', shipPhone: '(209) 555-0178',
    notes: 'Warranty work for the Volvo and Freightliner units.',
  }),

  // — on the road —
  site({
    name: 'Westley Truck Stop · I-5 exit 441', type: 'Truck stop', phone: '(209) 555-0112',
    street: '7100 McCracken Rd', city: 'Westley', state: 'CA', zip: '95387', lat: '37.5480', lng: '-121.2000',
    open24: 'Yes',
    truckSpots: '120', amenities: ['Diesel', 'DEF', 'CAT scale', 'Truck parking', 'Showers', 'Reefer fuel'],
    parking: 'Overnight parking',
    notes: 'Fuel-card discount lane. Lot is usually full after 20:00 — reserve or stop earlier.',
  }),
  site({
    name: 'Winnemucca Travel Center · I-80 exit 176', type: 'Truck stop', phone: '(775) 555-0181',
    street: '1500 W Winnemucca Blvd', city: 'Winnemucca', state: 'NV', zip: '89445', lat: '40.9730', lng: '-117.7570',
    open24: 'Yes',
    truckSpots: '85', amenities: ['Diesel', 'DEF', 'CAT scale', 'Truck parking', 'Showers', 'Tire / repair'],
    parking: 'Overnight parking',
    notes: 'Halfway point on Stockton → Salt Lake City; standard 10-hour break stop.',
  }),
  site({
    name: 'Cordelia Truck Scales · I-80 EB', type: 'Scale / inspection', phone: '',
    street: 'I-80 eastbound, east of the I-680 junction', city: 'Fairfield', state: 'CA', zip: '94534', lat: '38.2240', lng: '-122.1320',
    open24: 'No', wkOpen: '06:00', wkClose: '22:00', satOpen: '06:00', satClose: '22:00', sunOpen: '06:00', sunClose: '22:00',
    amenities: [],
    notes: 'Weigh-station bypass works when the transponder is green. Level III inspections are common on Tuesdays.',
  }),
];

export const FACILITY_SEED: Facility[] = DETAILS.map((d, i) => facilityFromForm(d, `FAC-${101 + i}`));

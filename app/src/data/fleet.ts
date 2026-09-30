// Fleet records: drivers, trucks (power units) and trailers. Each record keeps
// the summary fields the tables show plus `details` — every field of its Add /
// Edit form, as strings (lists for multi-choice fields). The demo fleet below is
// complete and consistent with Safety, HR and the load board.
import { COMPLIANCE, DRIVERS, TRAILERS, TRUCKS, type Driver, type Trailer, type Truck } from './mock';

export type FormValues = Record<string, string | string[]>;

export interface FleetDriver extends Driver {
  id: string;
  archived?: boolean;
  details: FormValues;
}

export interface FleetTruck extends Truck {
  id: string;
  archived?: boolean;
  details: FormValues;
}

export interface FleetTrailer extends Trailer {
  id: string;
  archived?: boolean;
  details: FormValues;
}

// — choices used by the forms —

export const TERMINALS = ['Modesto, CA — main yard', 'Fresno, CA — drop yard', 'Sacramento, CA — drop yard'];
export const DISPATCHERS = ['Rosa Medina', 'Evan Brooks'];
export const DRIVER_TYPES = ['Company driver (W-2)', 'Owner-operator (1099)', 'Lease-purchase', 'Team driver'];
export const DRIVER_STATUSES = ['Available', 'On duty', 'Home time', 'Off duty', 'Inactive'];
export const CDL_CLASSES = ['A', 'B', 'C'];
export const ENDORSEMENTS = ['H — Hazmat', 'N — Tanker', 'T — Doubles / triples', 'X — Tanker + hazmat', 'P — Passenger', 'S — School bus'];
export const PAY_TYPES = ['Per mile', '% of line haul', 'Hourly', 'Salary', 'Flat per load'];

export const TRUCK_STATUSES = ['In service', 'Service due', 'In shop', 'Out of service'];
export const TRUCK_OWNERSHIP = ['Owned', 'Leased', 'Lease-purchase', 'Owner-operator'];
export const TRUCK_MAKES = ['Freightliner', 'Kenworth', 'Peterbilt', 'Volvo', 'International', 'Mack', 'Western Star'];
export const CABS = ['Sleeper', 'Day cab'];
export const FUELS = ['Diesel', 'CNG', 'Electric'];
export const TRUCK_AXLES = ['Tandem (6x4)', 'Single (4x2)'];

export const TRAILER_TYPES = ['Reefer', 'Dry van', 'Flatbed', 'Step deck', 'Conestoga', 'Lowboy', 'Tanker'];
export const TRAILER_LENGTHS = ['28', '40', '45', '48', '53'];
export const TRAILER_STATUSES = ['Empty', 'Loaded', 'In shop', 'Inspection', 'Out of service'];
export const TRAILER_OWNERSHIP = ['Owned', 'Leased', 'Rented'];
export const TRAILER_MAKES = ['Utility', 'Great Dane', 'Wabash', 'Hyundai Translead', 'Fontaine', 'Stoughton', 'Vanguard'];
export const TRAILER_AXLES = ['Tandem', 'Spread axle', 'Triple'];
export const SUSPENSIONS = ['Air ride', 'Spring'];
export const DOORS = ['Swing', 'Roll-up'];
export const REEFER_MAKES = ['Thermo King', 'Carrier Transicold'];

export const YES_NO = ['Yes', 'No'];

// — table fields derived from the form —

const DRIVER_TAG: Record<string, string> = {
  'On duty': 'tag-accent', Available: 'tag-neutral', 'Home time': 'tag-neutral', 'Off duty': 'tag-neutral', Inactive: 'tag-outline',
};
const TRUCK_TAG: Record<string, string> = {
  'In service': 'tag-accent', 'Service due': 'tag-outline', 'In shop': 'tag-outline', 'Out of service': 'tag-outline',
};
const TRAILER_TAG: Record<string, string> = {
  Loaded: 'tag-accent', Empty: 'tag-neutral', 'In shop': 'tag-outline', Inspection: 'tag-outline', 'Out of service': 'tag-outline',
};

const str = (v: FormValues, k: string) => {
  const x = v[k];
  return typeof x === 'string' ? x.trim() : '';
};
const thousands = (s: string) => (s && Number(s) >= 0 ? Number(s).toLocaleString('en-US') : '—');

// '2028-04-30' → '04/2028' (how the roster shows CDL expiry).
function monthYear(iso: string) {
  const [y, m] = iso.split('-');
  return y && m ? `${m}/${y}` : '—';
}

export function driverName(v: FormValues) {
  return `${str(v, 'firstName')} ${str(v, 'lastName')}`.trim();
}

export function driverFromForm(v: FormValues, id: string, prev?: FleetDriver): FleetDriver {
  const status = str(v, 'status') || 'Available';
  const onClock = status === 'On duty' || status === 'Available';
  return {
    id,
    name: driverName(v),
    status,
    tagClass: DRIVER_TAG[status] ?? 'tag-neutral',
    unit: str(v, 'truck') || '—',
    load: prev?.load ?? '—',
    hos: prev && prev.hos !== '—' ? prev.hos : onClock ? '11h 00m' : '—',
    cdl: monthYear(str(v, 'cdlExpiry')),
    pay: prev?.pay ?? '$0',
    miles: prev?.miles ?? 0,
    archived: prev?.archived,
    details: v,
  };
}

export function truckFromForm(v: FormValues, id: string, prev?: FleetTruck): FleetTruck {
  const status = str(v, 'status') || 'In service';
  return {
    id,
    unit: str(v, 'unitNumber').toUpperCase(),
    make: `${str(v, 'make')} ${str(v, 'model')} · ${str(v, 'year')}`.trim(),
    plate: `${str(v, 'plateState').toUpperCase()} ${str(v, 'plateNumber').toUpperCase()}`.trim(),
    driver: str(v, 'driver') || 'Unassigned',
    odo: thousands(str(v, 'odometer')),
    service: thousands(str(v, 'nextService')),
    status,
    tagClass: TRUCK_TAG[status] ?? 'tag-neutral',
    archived: prev?.archived,
    details: v,
  };
}

export function trailerFromForm(v: FormValues, id: string, prev?: FleetTrailer): FleetTrailer {
  const status = str(v, 'status') || 'Empty';
  return {
    id,
    unit: str(v, 'unitNumber').toUpperCase(),
    kind: `${str(v, 'type')} · ${str(v, 'length')} ft`,
    status,
    tagClass: TRAILER_TAG[status] ?? 'tag-neutral',
    where: str(v, 'location') || '—',
    archived: prev?.archived,
    details: v,
  };
}

// Next free id: 'DRV-106' → 'DRV-107'.
export function nextId(prefix: string, ids: string[]) {
  const n = Math.max(100, ...ids.map((id) => Number(id.split('-')[1]) || 0)) + 1;
  return `${prefix}-${n}`;
}

// — the demo fleet (Sunridge Freight, Modesto CA) —

const DRIVER_DETAILS: Record<string, FormValues> = {
  'Marcus Hale': {
    firstName: 'Marcus', lastName: 'Hale', dob: '1981-04-12', phone: '(209) 555-0147', email: 'marcus.hale@sunridgefreight.com',
    street: '1420 Coffee Rd', city: 'Modesto', state: 'CA', zip: '95355',
    emergencyName: 'Tanya Hale', emergencyPhone: '(209) 555-0162', emergencyRelation: 'Spouse',
    employeeId: 'DRV-101', driverType: 'Company driver (W-2)', status: 'On duty', hireDate: '2019-03-11',
    terminal: TERMINALS[0], dispatcher: 'Rosa Medina',
    cdlNumber: 'D4827361', cdlState: 'CA', cdlClass: 'A', cdlExpiry: '2028-04-30', endorsements: ['N — Tanker', 'T — Doubles / triples'],
    restrictions: '', twicExpiry: '', hazmatExpiry: '',
    medicalExpiry: '2027-03-15', mvrDate: '2026-03-02', annualReviewDate: '2026-03-11', drugTestDate: '2019-03-05',
    clearinghouseDate: '2025-09-20', roadTestDate: '2019-03-07',
    truck: 'T-114', payType: 'Per mile', payRate: '0.62', fuelCard: '7083 0452 1147', eldId: 'MHALE01',
    notes: 'Prefers Reno and Salt Lake lanes. Hazmat training booked for November.',
  },
  'Dara Whitfield': {
    firstName: 'Dara', lastName: 'Whitfield', dob: '1986-09-02', phone: '(209) 555-0181', email: 'dara.whitfield@sunridgefreight.com',
    street: '3907 Sylvan Ave', city: 'Modesto', state: 'CA', zip: '95356',
    emergencyName: 'Leon Whitfield', emergencyPhone: '(209) 555-0193', emergencyRelation: 'Brother',
    employeeId: 'DRV-102', driverType: 'Company driver (W-2)', status: 'On duty', hireDate: '2020-06-01',
    terminal: TERMINALS[0], dispatcher: 'Rosa Medina',
    cdlNumber: 'D6150294', cdlState: 'CA', cdlClass: 'A', cdlExpiry: '2027-11-30', endorsements: ['T — Doubles / triples'],
    restrictions: '', twicExpiry: '2028-05-14', hazmatExpiry: '',
    medicalExpiry: '2027-06-20', mvrDate: '2026-05-28', annualReviewDate: '2026-06-01', drugTestDate: '2020-05-26',
    clearinghouseDate: '2026-05-28', roadTestDate: '2020-05-28',
    truck: 'T-107', payType: 'Per mile', payRate: '0.60', fuelCard: '7083 0452 1152', eldId: 'DWHITFIELD',
    notes: '',
  },
  'Ellis Nakamura': {
    firstName: 'Ellis', lastName: 'Nakamura', dob: '1990-01-23', phone: '(916) 555-0124', email: 'ellis.nakamura@sunridgefreight.com',
    street: '8120 Florin Rd', city: 'Sacramento', state: 'CA', zip: '95828',
    emergencyName: 'Keiko Nakamura', emergencyPhone: '(916) 555-0139', emergencyRelation: 'Mother',
    employeeId: 'DRV-103', driverType: 'Company driver (W-2)', status: 'On duty', hireDate: '2021-02-15',
    terminal: TERMINALS[2], dispatcher: 'Rosa Medina',
    cdlNumber: 'D3094475', cdlState: 'CA', cdlClass: 'A', cdlExpiry: '2027-02-28', endorsements: [],
    restrictions: 'Corrective lenses', twicExpiry: '', hazmatExpiry: '',
    medicalExpiry: '2026-10-12', mvrDate: '2026-02-10', annualReviewDate: '2026-02-15', drugTestDate: '2021-02-09',
    clearinghouseDate: '2026-02-10', roadTestDate: '2021-02-11',
    truck: 'T-121', payType: '% of line haul', payRate: '25', fuelCard: '7083 0452 1160', eldId: 'ENAKAMURA',
    notes: 'Flatbed certified: tarping and securement.',
  },
  'Priya Raman': {
    firstName: 'Priya', lastName: 'Raman', dob: '1993-06-30', phone: '(559) 555-0172', email: 'priya.raman@sunridgefreight.com',
    street: '455 E Shields Ave', city: 'Fresno', state: 'CA', zip: '93704',
    emergencyName: 'Arjun Raman', emergencyPhone: '(559) 555-0188', emergencyRelation: 'Father',
    employeeId: 'DRV-104', driverType: 'Company driver (W-2)', status: 'Available', hireDate: '2022-07-18',
    terminal: TERMINALS[1], dispatcher: 'Evan Brooks',
    cdlNumber: 'D7728016', cdlState: 'CA', cdlClass: 'A', cdlExpiry: '2026-07-31', endorsements: ['N — Tanker'],
    restrictions: '', twicExpiry: '', hazmatExpiry: '',
    medicalExpiry: '2028-01-09', mvrDate: '2026-07-10', annualReviewDate: '2026-07-18', drugTestDate: '2022-07-12',
    clearinghouseDate: '2026-07-10', roadTestDate: '2022-07-14',
    truck: 'T-103', payType: 'Per mile', payRate: '0.58', fuelCard: '7083 0452 1178', eldId: 'PRAMAN',
    notes: 'CDL renewal appointment at the Fresno DMV pending — do not dispatch until renewed.',
  },
  'Ana Cortez': {
    firstName: 'Ana', lastName: 'Cortez', dob: '1995-11-08', phone: '(530) 555-0115', email: 'ana.cortez@sunridgefreight.com',
    street: '2250 Hilltop Dr', city: 'Redding', state: 'CA', zip: '96002',
    emergencyName: 'Miguel Cortez', emergencyPhone: '(530) 555-0127', emergencyRelation: 'Spouse',
    employeeId: 'DRV-105', driverType: 'Company driver (W-2)', status: 'Available', hireDate: '2023-09-24',
    terminal: TERMINALS[0], dispatcher: 'Evan Brooks',
    cdlNumber: 'D9051182', cdlState: 'CA', cdlClass: 'A', cdlExpiry: '2029-09-30', endorsements: [],
    restrictions: '', twicExpiry: '', hazmatExpiry: '',
    medicalExpiry: '2027-09-12', mvrDate: '2025-09-24', annualReviewDate: '2025-09-24', drugTestDate: '2023-09-18',
    clearinghouseDate: '2025-09-24', roadTestDate: '2023-09-20',
    truck: 'T-109', payType: 'Per mile', payRate: '0.58', fuelCard: '7083 0452 1183', eldId: 'ACORTEZ',
    notes: 'Mentoring Jamal Reed during orientation (ride-along Sep 5).',
  },
  'Tobias Frey': {
    firstName: 'Tobias', lastName: 'Frey', dob: '1978-02-17', phone: '(209) 555-0158', email: 'tobias.frey@sunridgefreight.com',
    street: '618 N Golden State Blvd', city: 'Turlock', state: 'CA', zip: '95380',
    emergencyName: 'Greta Frey', emergencyPhone: '(209) 555-0166', emergencyRelation: 'Spouse',
    employeeId: 'DRV-106', driverType: 'Lease-purchase', status: 'Home time', hireDate: '2018-11-05',
    terminal: TERMINALS[0], dispatcher: 'Rosa Medina',
    cdlNumber: 'D2268940', cdlState: 'CA', cdlClass: 'A', cdlExpiry: '2028-01-31', endorsements: ['H — Hazmat', 'N — Tanker'],
    restrictions: '', twicExpiry: '', hazmatExpiry: '2027-04-30',
    medicalExpiry: '2026-12-02', mvrDate: '2025-11-05', annualReviewDate: '2025-11-05', drugTestDate: '2018-10-30',
    clearinghouseDate: '2025-11-05', roadTestDate: '2018-11-01',
    truck: 'T-118', payType: '% of line haul', payRate: '72', fuelCard: '7083 0452 1191', eldId: 'TFREY',
    notes: 'Lease-purchase on T-118; term ends Nov 15. Home time Sep 1–6.',
  },
};

const TRUCK_DETAILS: Record<string, FormValues> = {
  'T-103': {
    unitNumber: 'T-103', status: 'In service', ownership: 'Owned', driver: 'Priya Raman', terminal: TERMINALS[1],
    vin: '3AKJHHDR5NSNK4271', year: '2022', make: 'Freightliner', model: 'Cascadia', cab: 'Sleeper', fuel: 'Diesel',
    engine: 'Detroit DD15', gvwr: '80000', axles: TRUCK_AXLES[0],
    plateNumber: '8HJ2019', plateState: 'CA', registrationExpiry: '2027-03-31', apportioned: 'Yes', iftaDecal: 'CA 2026 118402',
    dotInspection: '2026-04-18', insuranceExpiry: '2027-01-01',
    odometer: '318440', pmInterval: '25000', nextService: '342000', lastServiceDate: '2026-06-22', eldSerial: 'SAM-VG54-7Z31', tireSize: '295/75R22.5',
    purchaseDate: '2022-02-14', purchasePrice: '168500', lessor: '', leaseEnd: '',
    notes: '',
  },
  'T-107': {
    unitNumber: 'T-107', status: 'In service', ownership: 'Owned', driver: 'Dara Whitfield', terminal: TERMINALS[0],
    vin: '4V4NC9EH7MN283154', year: '2021', make: 'Volvo', model: 'VNL 760', cab: 'Sleeper', fuel: 'Diesel',
    engine: 'Volvo D13', gvwr: '80000', axles: TRUCK_AXLES[0],
    plateNumber: '7RD8842', plateState: 'CA', registrationExpiry: '2027-03-31', apportioned: 'Yes', iftaDecal: 'CA 2026 118403',
    dotInspection: '2026-05-06', insuranceExpiry: '2027-01-01',
    odometer: '402190', pmInterval: '25000', nextService: '425000', lastServiceDate: '2026-07-30', eldSerial: 'SAM-VG54-8K02', tireSize: '295/75R22.5',
    purchaseDate: '2021-05-03', purchasePrice: '154900', lessor: '', leaseEnd: '',
    notes: '',
  },
  'T-109': {
    unitNumber: 'T-109', status: 'In service', ownership: 'Leased', driver: 'Ana Cortez', terminal: TERMINALS[0],
    vin: '1XKYD49X8PJ517630', year: '2023', make: 'Kenworth', model: 'T680', cab: 'Sleeper', fuel: 'Diesel',
    engine: 'PACCAR MX-13', gvwr: '80000', axles: TRUCK_AXLES[0],
    plateNumber: '9KM1174', plateState: 'CA', registrationExpiry: '2027-03-31', apportioned: 'Yes', iftaDecal: 'CA 2026 118404',
    dotInspection: '2026-08-11', insuranceExpiry: '2027-01-01',
    odometer: '141220', pmInterval: '25000', nextService: '165000', lastServiceDate: '2026-08-11', eldSerial: 'SAM-VG54-9C77', tireSize: '295/75R22.5',
    purchaseDate: '', purchasePrice: '', lessor: 'Penske Truck Leasing', leaseEnd: '2028-02-28',
    notes: 'Full-service lease — PMs at Penske Modesto.',
  },
  'T-114': {
    unitNumber: 'T-114', status: 'Service due', ownership: 'Owned', driver: 'Marcus Hale', terminal: TERMINALS[0],
    vin: '1XPBD49X4LD662185', year: '2020', make: 'Peterbilt', model: '579', cab: 'Sleeper', fuel: 'Diesel',
    engine: 'PACCAR MX-13', gvwr: '80000', axles: TRUCK_AXLES[0],
    plateNumber: '6PL4408', plateState: 'CA', registrationExpiry: '2027-03-31', apportioned: 'Yes', iftaDecal: 'CA 2026 118405',
    dotInspection: '2026-03-22', insuranceExpiry: '2027-01-01',
    odometer: '528900', pmInterval: '25000', nextService: '529800', lastServiceDate: '2026-05-02', eldSerial: 'SAM-VG54-2M48', tireSize: '295/75R22.5',
    purchaseDate: '2020-01-20', purchasePrice: '147200', lessor: '', leaseEnd: '',
    notes: 'PM service A booked Sep 5, 07:00, Sunridge shop.',
  },
  'T-118': {
    unitNumber: 'T-118', status: 'In shop', ownership: 'Lease-purchase', driver: 'Tobias Frey', terminal: TERMINALS[0],
    vin: '3AKJGLDR1KSKG0934', year: '2019', make: 'Freightliner', model: 'Cascadia', cab: 'Sleeper', fuel: 'Diesel',
    engine: 'Detroit DD15', gvwr: '80000', axles: TRUCK_AXLES[0],
    plateNumber: '5TT9930', plateState: 'CA', registrationExpiry: '2027-03-31', apportioned: 'Yes', iftaDecal: 'CA 2026 118406',
    dotInspection: '2026-02-09', insuranceExpiry: '2027-01-01',
    odometer: '611780', pmInterval: '25000', nextService: '', lastServiceDate: '2026-09-02', eldSerial: 'SAM-VG54-1R93', tireSize: '295/75R22.5',
    purchaseDate: '2019-03-01', purchasePrice: '132000', lessor: 'Sunridge Freight lease-purchase program', leaseEnd: '2026-11-15',
    notes: 'Turbocharger replacement in progress; parts from Valley Diesel & Turbo.',
  },
  'T-121': {
    unitNumber: 'T-121', status: 'In service', ownership: 'Owned', driver: 'Ellis Nakamura', terminal: TERMINALS[2],
    vin: '3HSDZAPR9NN581426', year: '2022', make: 'International', model: 'LT', cab: 'Sleeper', fuel: 'Diesel',
    engine: 'Cummins X15', gvwr: '80000', axles: TRUCK_AXLES[0],
    plateNumber: '8WQ2251', plateState: 'CA', registrationExpiry: '2027-03-31', apportioned: 'Yes', iftaDecal: 'CA 2026 118407',
    dotInspection: '2026-06-14', insuranceExpiry: '2027-01-01',
    odometer: '275610', pmInterval: '25000', nextService: '298000', lastServiceDate: '2026-07-19', eldSerial: 'SAM-VG54-6T15', tireSize: '295/75R22.5',
    purchaseDate: '2022-04-11', purchasePrice: '149800', lessor: '', leaseEnd: '',
    notes: 'Brake adjustment overdue (roadside violation Aug 28).',
  },
};

function trailerBase(unit: string, type: string, length: string, status: string, location: string): FormValues {
  return { unitNumber: unit, type, length, status, location, ownership: 'Owned' };
}

const REEFER = (make: string, model: string, hours: string, serial: string): FormValues => ({
  reeferMake: make, reeferModel: model, reeferHours: hours, reeferSerial: serial,
});
const NO_REEFER: FormValues = { reeferMake: '', reeferModel: '', reeferHours: '', reeferSerial: '' };

const TRAILER_DETAILS: Record<string, FormValues> = {
  'RF-27': {
    ...trailerBase('RF-27', 'Reefer', '53', 'Loaded', 'Bakersfield, CA'),
    vin: '1UYVS2539N3261847', year: '2022', make: 'Utility', model: '3000R', axles: 'Tandem', suspension: 'Air ride', doors: 'Swing', maxPayload: '45000',
    ...REEFER('Thermo King', 'Precedent S-610M', '6420', 'TK-S610-22-4417'),
    plateNumber: '4RF2771', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-05-20', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-07-08', lastTireCheck: '2026-08-25', notes: '',
  },
  'RF-09': {
    ...trailerBase('RF-09', 'Reefer', '53', 'Empty', 'Yard · Modesto'),
    vin: '1UYVS2533L3128804', year: '2020', make: 'Utility', model: '3000R', axles: 'Tandem', suspension: 'Air ride', doors: 'Swing', maxPayload: '45000',
    ...REEFER('Carrier Transicold', 'X4 7300', '11860', 'CT-X4-20-9058'),
    plateNumber: '4RF0934', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-03-14', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-08-19', lastTireCheck: '2026-08-19', notes: 'Pre-cooled and washed; ready for dispatch.',
  },
  'RF-88': {
    ...trailerBase('RF-88', 'Reefer', '53', 'Loaded', 'En route · I-80'),
    vin: '1UYVS2536P3374512', year: '2023', make: 'Utility', model: '3000R', axles: 'Tandem', suspension: 'Air ride', doors: 'Swing', maxPayload: '45000',
    ...REEFER('Thermo King', 'Precedent S-610M', '3180', 'TK-S610-23-8820'),
    plateNumber: '4RF8812', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-06-02', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-06-02', lastTireCheck: '2026-08-30', notes: '',
  },
  'DV-51': {
    ...trailerBase('DV-51', 'Dry van', '53', 'Loaded', 'Stockton, CA'),
    vin: '1GRAA0621MB705218', year: '2021', make: 'Great Dane', model: 'Champion CL', axles: 'Tandem', suspension: 'Air ride', doors: 'Swing', maxPayload: '47000',
    ...NO_REEFER,
    plateNumber: '4DV5118', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-04-27', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-04-27', lastTireCheck: '2026-08-12', notes: '',
  },
  'DV-88': {
    ...trailerBase('DV-88', 'Dry van', '53', 'Empty', 'Yard · Modesto'),
    vin: '1GRAA0628NB804463', year: '2022', make: 'Great Dane', model: 'Champion CL', axles: 'Tandem', suspension: 'Air ride', doors: 'Roll-up', maxPayload: '47000',
    ...NO_REEFER,
    plateNumber: '4DV8830', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-07-15', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-07-15', lastTireCheck: '2026-09-01', notes: '',
  },
  'DV-14': {
    ...trailerBase('DV-14', 'Dry van', '53', 'Empty', 'Las Vegas, NV'),
    vin: '1JJV532D6KL162049', year: '2019', make: 'Wabash', model: 'DuraPlate', axles: 'Tandem', suspension: 'Spring', doors: 'Swing', maxPayload: '46500',
    ...NO_REEFER,
    plateNumber: '4DV1407', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-01-19', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-05-10', lastTireCheck: '2026-08-04', notes: 'Waiting on a backhaul out of Las Vegas.',
  },
  'FB-04': {
    ...trailerBase('FB-04', 'Flatbed', '48', 'Loaded', 'Redding, CA'),
    vin: '13N148202P1571234', year: '2023', make: 'Fontaine', model: 'Infinity', axles: 'Spread axle', suspension: 'Air ride', doors: '', maxPayload: '48000',
    ...NO_REEFER,
    plateNumber: '4FB0418', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2026-06-24', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-06-24', lastTireCheck: '2026-08-28', notes: 'Carries 12 straps, 4 chains, 2 tarps.',
  },
  'FB-12': {
    ...trailerBase('FB-12', 'Flatbed', '48', 'Inspection', 'Yard · Modesto'),
    vin: '13N148209M1566082', year: '2021', make: 'Fontaine', model: 'Infinity', axles: 'Spread axle', suspension: 'Air ride', doors: '', maxPayload: '48000',
    ...NO_REEFER,
    plateNumber: '4FB1265', plateState: 'CA', registrationExpiry: '2027-03-31', dotInspection: '2025-09-03', insuranceExpiry: '2027-01-01',
    lastServiceDate: '2026-03-30', lastTireCheck: '2026-08-15', notes: 'Annual DOT inspection due today — in the Modesto shop.',
  },
};

export const DRIVER_SEED: FleetDriver[] = DRIVERS.map((d, i) => ({ ...d, id: `DRV-${101 + i}`, details: DRIVER_DETAILS[d.name] ?? {} }));
export const TRUCK_SEED: FleetTruck[] = TRUCKS.map((t, i) => ({ ...t, id: `TRK-${101 + i}`, details: TRUCK_DETAILS[t.unit] ?? {} }));
export const TRAILER_SEED: FleetTrailer[] = TRAILERS.map((t, i) => ({ ...t, id: `TRL-${101 + i}`, details: TRAILER_DETAILS[t.unit] ?? {} }));

export interface WatchItem {
  name: string;
  item: string;
  due: string;
}

// Drivers-tab compliance watchlist: the shared COMPLIANCE items plus the
// other document expiring soon in Safety › Driver Documents (data/safety.ts).
export const WATCHLIST: WatchItem[] = [
  ...COMPLIANCE,
  { name: 'Marcus Hale', item: 'Clearinghouse query', due: 'Sep 20' },
];

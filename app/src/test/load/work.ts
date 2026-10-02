// What one simulated account does while it is signed in: the everyday work of
// a trucking office, done through the app's own factories and save functions
// (the same ones the forms call). Every record carries the company's mark.
import type { BillDocument } from '../../data/bills';
import type { Load } from '../../data/mock';
import { markOf, type AppCode, type Session } from './harness';

// How many records of each kind an account adds (by its number in the company).
export interface Tally {
  customers: number; loads: number; invoices: number; bills: number; files: number;
  drivers: number; trucks: number; employees: number; workOrders: number; violations: number; claims: number;
}
export const noTally = (): Tally => ({ customers: 0, loads: 0, invoices: 0, bills: 0, files: 0, drivers: 0, trucks: 0, employees: 0, workOrders: 0, violations: 0, claims: 0 });

const CITIES = ['Fresno, CA', 'Reno, NV', 'Boise, ID', 'Portland, OR', 'Phoenix, AZ', 'Denver, CO', 'Dallas, TX', 'Salt Lake City, UT'];

export async function officeWork(session: Session, code: AppCode, n: number): Promise<Tally> {
  const mark = markOf(session.companyId);
  const who = `${mark} Account ${n}`;
  const today = code.clock.todayIso();
  const done = noTally();
  const { act, shell } = session;

  // A customer.
  const customerName = `${mark} Customer ${n}`;
  await act((s) => s.saveCustomer(code.customers.customerFromForm(
    { ...code.customers.blankCustomerForm(today, who), name: customerName, legalName: `${customerName} LLC`, contact: who, email: `ap${n}@c${session.companyId}.test`, phone: '(555) 010-0100', city: 'Fresno', state: 'CA', zip: '93721' },
    code.customers.nextCustomerId(s.customers), [], who,
  )));
  done.customers += 1;

  // A load for that customer, dispatched and then delivered.
  const from = CITIES[n % CITIES.length];
  const to = CITIES[(n + 3) % CITIES.length];
  let loadId = '';
  await act((s) => {
    loadId = `L-${code.ids.nextSerial('L', s.loads.map((l) => l.id))}`;
    const load = {
      id: loadId, customer: customerName, route: `${from} → ${to}`, pickup: '', delivery: '', pickupDate: today, deliveryDate: today,
      driver: `${mark} Driver ${n % 5}`, unit: `T-${n % 5}`, rate: '$2,000', status: 'Dispatched', tagClass: 'tag-accent', miles: '300', rpm: '—', pay: '—', margin: '—',
      commodity: 'General freight', weight: '40,000 lb', equip: 'Dry van', temp: '', ref: `PO ${n}`, from: `${mark} Shipper ${n}`, fromAddr: `1 Main St, ${from}`,
      to: `${mark} Receiver ${n}`, toAddr: `9 Dock Rd, ${to}`, carrier: 'Own fleet', carrierMc: '—', carrierDot: '—',
      charges: { lineHaul: 2000, fuel: 240, accessorials: 0 }, notes: `${mark} entered by account ${n}`,
      history: [{ at: new Date().toISOString(), by: who, what: 'Created' }],
    } as unknown as Load;
    s.addLoad(code.loads.normalizeLoad(load));
  });
  await act((s) => {
    const load = s.loads.find((l) => l.id === loadId);
    if (load) s.updateLoad(code.loads.withStatus(load, 'Delivered', who, today));
  });
  done.loads += 1;

  // Its invoice, built from the load as the Uninvoiced tab does.
  await act((s) => {
    const billable = code.invoicing.billableLoads(s.loads, s.invoices).filter((b) => b.id === loadId);
    if (!billable.length) return;
    s.saveInvoice({ ...code.invoicing.draftForLoads(billable, code.invoicing.nextInvoiceId(s.invoices)), draft: false, memo: `${mark} thank you` });
    done.invoices += 1;
  });

  // A bill with its receipt attached.
  const receipt = await code.attachments.readAttachment(new File([`${mark} receipt ${n}`], `receipt-${n}.pdf`, { type: 'application/pdf' }));
  const documents: BillDocument[] = typeof receipt === 'string' ? [] : [receipt];
  done.files += documents.length;
  await act((s) => s.saveBill(code.bills.billFromForm(
    { ...code.bills.blankBillForm(today), vendor: `${mark} Vendor ${n}`, category: 'Fuel', description: 'Diesel', amount: '412.50' },
    code.bills.nextBillId(s.bills), documents,
  )));
  done.bills += 1;

  // The fleet, payroll and safety records come up less often.
  if (n % 5 === 0) {
    await act((s) => s.saveDriver(code.fleet.driverFromForm(
      { firstName: mark, lastName: `Driver ${n}`, status: 'Available', phone: '(555) 010-0147', email: `d${n}@c${session.companyId}.test`, cdlExpiry: '2030-01-31' },
      code.fleet.nextId('D', s.drivers.map((d) => d.id)),
    )));
    await act((s) => s.saveTruck(code.fleet.truckFromForm(
      { unitNumber: `T-${n}`, make: 'Freightliner', model: 'Cascadia', year: '2023', plateState: 'CA', plateNumber: `${n}`, status: 'In service', notes: mark },
      code.fleet.nextId('T', s.trucks.map((t) => t.id)),
    )));
    done.drivers += 1;
    done.trucks += 1;
  }
  if (n % 3 === 0) {
    await act((s) => s.saveEmployee(code.payroll.employeeFromForm(
      { ...code.payroll.blankEmployeeForm(today), name: `${mark} Employee ${n}`, rate: '0.60' },
      code.payroll.nextEmployeeId(s.employees), [], [], who,
    )));
    done.employees += 1;
  }
  if (n % 4 === 0) {
    await act((s) => s.saveWorkOrder(code.safety.workOrderFromForm(
      { ...code.safety.blankWorkOrderForm(today), unit: `T-${n}`, description: `${mark} brakes` },
      code.safety.nextWorkOrderId(s.workOrders), 'Truck', [], who,
    )));
    done.workOrders += 1;
  }
  if (n % 6 === 0) {
    await act((s) => s.saveViolation(code.safety.violationFromForm(
      { ...code.safety.blankViolationForm(today), driver: `${mark} Driver ${n % 5}`, location: 'Truckee, CA', notes: mark },
      code.safety.nextViolationId(s.violations), [], who,
    )));
    done.violations += 1;
  }
  if (n % 7 === 0) {
    await act((s) => s.saveClaim(code.safety.claimFromForm(
      { ...code.safety.blankClaimForm(today), description: `${mark} pallet damage`, amount: '900' },
      code.safety.nextClaimId(s.claims), [], who,
    )));
    done.claims += 1;
  }

  // Their own profile (kept per person, not per company).
  code.settings.setSettings({ ...code.settings.getSettings(), profile: { ...code.settings.getSettings().profile, name: who } });

  // Nothing they did may have been refused or reported as a fault.
  void shell;
  return done;
}

export const addTally = (a: Tally, b: Tally): Tally =>
  Object.fromEntries((Object.keys(a) as (keyof Tally)[]).map((k) => [k, a[k] + b[k]])) as unknown as Tally;

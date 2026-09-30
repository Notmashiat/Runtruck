import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { BATCH_SEED, INVOICE_SEED, type Batch, type InvoiceRecord } from '../data/invoicing';
import { FACILITY_SEED, renameInLoad, sameName, type Facility } from '../data/facilities';
import { DRIVER_SEED, TRAILER_SEED, TRUCK_SEED, type FleetDriver, type FleetTrailer, type FleetTruck } from '../data/fleet';
import { LOADS, type Load } from '../data/mock';
import { usePersisted } from '../lib/persist';
import type { FilterMeta, FilterValue, FilterValues } from '../lib/tableTools';

export type LoadTab = 'Active' | 'Needs POD' | 'Delivered' | 'All';
export type DriverTab = 'All' | 'On duty' | 'Available';

interface AppShellState {
  query: string;
  setQuery: (q: string) => void;
  loadTab: LoadTab;
  setLoadTab: (t: LoadTab) => void;
  driverTab: DriverTab;
  setDriverTab: (t: DriverTab) => void;
  approved: boolean;
  approveAll: () => void;
  // Loads and the fleet are kept in this browser's storage (there is no back
  // end yet), so new, edited, archived and deleted records survive a reload.
  loads: Load[];
  addLoad: (l: Load) => void;
  updateLoad: (l: Load) => void;
  deleteLoad: (id: string) => void;
  drivers: FleetDriver[];
  trucks: FleetTruck[];
  trailers: FleetTrailer[];
  saveDriver: (d: FleetDriver) => void;
  saveTruck: (t: FleetTruck) => void;
  saveTrailer: (t: FleetTrailer) => void;
  archiveDriver: (id: string, archived: boolean) => void;
  archiveTruck: (id: string, archived: boolean) => void;
  archiveTrailer: (id: string, archived: boolean) => void;
  deleteDriver: (id: string) => void;
  deleteTruck: (id: string) => void;
  deleteTrailer: (id: string) => void;
  facilities: Facility[];
  saveFacility: (f: Facility) => void;
  archiveFacility: (id: string, archived: boolean) => void;
  deleteFacility: (id: string) => void;
  invoices: InvoiceRecord[];
  saveInvoice: (inv: InvoiceRecord) => void;
  saveInvoices: (list: InvoiceRecord[]) => void;
  deleteInvoice: (id: string) => void;
  batches: Batch[];
  saveBatch: (b: Batch) => void;
  deleteBatch: (id: string) => void;
  // Table filters, per page ('loads', 'fleet/drivers', …): what each page
  // offers (registered by the page) and what is chosen (kept while you move around).
  filterMeta: Record<string, FilterMeta[]>;
  registerFilters: (page: string, meta: FilterMeta[]) => void;
  filterValues: Record<string, FilterValues>;
  setFilter: (page: string, key: string, value: FilterValue | undefined) => void;
  clearFilters: (page: string) => void;
}

const AppShellContext = createContext<AppShellState | null>(null);

function reviveLoads(raw: unknown): Load[] | null {
  return Array.isArray(raw) && raw.every((l) => l && typeof l.id === 'string' && typeof l.route === 'string' && typeof l.carrier === 'string')
    ? (raw as Load[])
    : null;
}

function reviveRecords<T>(raw: unknown): T[] | null {
  return Array.isArray(raw) && raw.every((r) => r && typeof r.id === 'string' && r.details && typeof r.details === 'object') ? (raw as T[]) : null;
}

function reviveInvoices(raw: unknown): InvoiceRecord[] | null {
  return Array.isArray(raw) && raw.every((r) => r && typeof r.id === 'string' && Array.isArray(r.lines) && r.billTo) ? (raw as InvoiceRecord[]) : null;
}

function reviveBatches(raw: unknown): Batch[] | null {
  return Array.isArray(raw) && raw.every((r) => r && typeof r.id === 'string' && Array.isArray(r.invoiceIds)) ? (raw as Batch[]) : null;
}

// Insert or replace by id.
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [loadTab, setLoadTab] = useState<LoadTab>('Active');
  const [driverTab, setDriverTab] = useState<DriverTab>('All');
  const [approved, setApproved] = useState(false);
  const [loads, setLoads] = usePersisted<Load[]>('runtruck-loads', LOADS, reviveLoads);
  const [drivers, setDrivers] = usePersisted<FleetDriver[]>('runtruck-drivers', DRIVER_SEED, (raw) => reviveRecords<FleetDriver>(raw));
  const [trucks, setTrucks] = usePersisted<FleetTruck[]>('runtruck-trucks', TRUCK_SEED, (raw) => reviveRecords<FleetTruck>(raw));
  const [trailers, setTrailers] = usePersisted<FleetTrailer[]>('runtruck-trailers', TRAILER_SEED, (raw) => reviveRecords<FleetTrailer>(raw));
  const [invoices, setInvoices] = usePersisted<InvoiceRecord[]>('runtruck-invoices', INVOICE_SEED, (raw) => reviveInvoices(raw));
  const [batches, setBatches] = usePersisted<Batch[]>('runtruck-batches', BATCH_SEED, (raw) => reviveBatches(raw));
  const [filterMeta, setFilterMeta] = useState<Record<string, FilterMeta[]>>({});
  const [filterValues, setFilterValues] = useState<Record<string, FilterValues>>({});
  const registerFilters = useCallback((page: string, meta: FilterMeta[]) =>
    setFilterMeta((prev) => (JSON.stringify(prev[page]) === JSON.stringify(meta) ? prev : { ...prev, [page]: meta })), []);
  const setFilter = useCallback((page: string, key: string, value: FilterValue | undefined) =>
    setFilterValues((prev) => {
      const next = { ...(prev[page] ?? {}) };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...prev, [page]: next };
    }), []);
  const clearFilters = useCallback((page: string) => setFilterValues((prev) => ({ ...prev, [page]: {} })), []);
  const [facilities, setFacilities] = usePersisted<Facility[]>('runtruck-facilities', FACILITY_SEED, (raw) => reviveRecords<Facility>(raw));

  // A driver's truck and a truck's driver describe the same assignment, so
  // saving either side updates the other (and frees whatever it replaced).
  const setTruckDriver = (unit: string, name: string, previousName?: string) =>
    setTrucks((list) =>
      list.map((t) => {
        const holdsDriver = t.driver === name || (previousName !== undefined && t.driver === previousName);
        if (t.unit === unit && unit) return { ...t, driver: name, details: { ...t.details, driver: name } };
        if (holdsDriver) return { ...t, driver: 'Unassigned', details: { ...t.details, driver: '' } };
        return t;
      }),
    );

  const value: AppShellState = {
    query,
    setQuery,
    loadTab,
    setLoadTab,
    driverTab,
    setDriverTab,
    approved,
    approveAll: () => setApproved(true),
    loads,
    addLoad: (l) => setLoads((prev) => [l, ...prev]),
    updateLoad: (l) => setLoads((prev) => prev.map((x) => (x.id === l.id ? l : x))),
    deleteLoad: (id) => setLoads((prev) => prev.filter((x) => x.id !== id)),
    drivers,
    trucks,
    trailers,
    saveDriver: (d) => {
      const prev = drivers.find((x) => x.id === d.id);
      const unit = d.unit === '—' ? '' : d.unit;
      // Taking a truck frees it from whichever driver had it.
      setDrivers((list) => upsert(list, d).map((x) => (x.id !== d.id && unit && x.unit === unit ? { ...x, unit: '—', details: { ...x.details, truck: '' } } : x)));
      if (!prev || prev.unit !== d.unit || prev.name !== d.name) setTruckDriver(unit, d.name, prev?.name);
    },
    saveTruck: (t) => {
      const prev = trucks.find((x) => x.id === t.id);
      const name = t.driver === 'Unassigned' ? '' : t.driver;
      // A driver drives one truck: assigning them here frees their old one.
      setTrucks((list) => upsert(list, t).map((x) => (x.id !== t.id && name && x.driver === name ? { ...x, driver: 'Unassigned', details: { ...x.details, driver: '' } } : x)));
      if (!prev || prev.driver !== t.driver || prev.unit !== t.unit) {
        setDrivers((list) =>
          list.map((d) => {
            if (name && d.name === name) return { ...d, unit: t.unit, details: { ...d.details, truck: t.unit } };
            if (d.unit === t.unit || (prev && d.unit === prev.unit)) return { ...d, unit: '—', details: { ...d.details, truck: '' } };
            return d;
          }),
        );
      }
    },
    saveTrailer: (t) => setTrailers((list) => upsert(list, t)),
    // Archiving frees the other side of an assignment (an archived driver is
    // not driving anything); restoring does not reassign it.
    archiveDriver: (id, archived) => {
      const d = drivers.find((x) => x.id === id);
      setDrivers((list) => list.map((x) => (x.id === id ? { ...x, archived, ...(archived ? { unit: '—', details: { ...x.details, truck: '' } } : {}) } : x)));
      if (d && archived) setTrucks((list) => list.map((t) => (t.driver === d.name ? { ...t, driver: 'Unassigned', details: { ...t.details, driver: '' } } : t)));
    },
    archiveTruck: (id, archived) => {
      const t = trucks.find((x) => x.id === id);
      setTrucks((list) => list.map((x) => (x.id === id ? { ...x, archived, ...(archived ? { driver: 'Unassigned', details: { ...x.details, driver: '' } } : {}) } : x)));
      if (t && archived) setDrivers((list) => list.map((d) => (d.unit === t.unit ? { ...d, unit: '—', details: { ...d.details, truck: '' } } : d)));
    },
    archiveTrailer: (id, archived) => setTrailers((list) => list.map((t) => (t.id === id ? { ...t, archived } : t))),
    deleteDriver: (id) => {
      const gone = drivers.find((d) => d.id === id);
      setDrivers((list) => list.filter((d) => d.id !== id));
      if (gone) setTrucks((list) => list.map((t) => (t.driver === gone.name ? { ...t, driver: 'Unassigned', details: { ...t.details, driver: '' } } : t)));
    },
    deleteTruck: (id) => {
      const gone = trucks.find((t) => t.id === id);
      setTrucks((list) => list.filter((t) => t.id !== id));
      if (gone) setDrivers((list) => list.map((d) => (d.unit === gone.unit ? { ...d, unit: '—', details: { ...d.details, truck: '' } } : d)));
    },
    deleteTrailer: (id) => setTrailers((list) => list.filter((t) => t.id !== id)),
    facilities,
    // Loads name their stops, so renaming a facility renames it on its loads.
    saveFacility: (f) => {
      const prev = facilities.find((x) => x.id === f.id);
      setFacilities((list) => upsert(list, f));
      if (prev && !sameName(prev.name, f.name)) setLoads((list) => list.map((l) => renameInLoad(l, prev.name, f.name)));
    },
    archiveFacility: (id, archived) => setFacilities((list) => list.map((f) => (f.id === id ? { ...f, archived } : f))),
    deleteFacility: (id) => setFacilities((list) => list.filter((f) => f.id !== id)),
    invoices,
    saveInvoice: (inv) => setInvoices((list) => upsert(list, inv)),
    saveInvoices: (changed) => setInvoices((list) => changed.reduce((acc, inv) => upsert(acc, inv), list)),
    // A deleted invoice also leaves any batch it was in.
    deleteInvoice: (id) => {
      setInvoices((list) => list.filter((i) => i.id !== id));
      setBatches((list) => list.map((b) => (b.invoiceIds.includes(id) ? { ...b, invoiceIds: b.invoiceIds.filter((x) => x !== id) } : b)));
    },
    batches,
    saveBatch: (b) => setBatches((list) => upsert(list, b)),
    deleteBatch: (id) => setBatches((list) => list.filter((b) => b.id !== id)),
    filterMeta,
    registerFilters,
    filterValues,
    setFilter,
    clearFilters,
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider');
  return ctx;
}

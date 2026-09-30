import { createContext, useContext, useState, type ReactNode } from 'react';
import { DRIVER_SEED, TRAILER_SEED, TRUCK_SEED, type FleetDriver, type FleetTrailer, type FleetTruck } from '../data/fleet';
import { LOADS, type Load } from '../data/mock';
import { usePersisted } from '../lib/persist';

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
    archiveDriver: (id, archived) => setDrivers((list) => list.map((d) => (d.id === id ? { ...d, archived } : d))),
    archiveTruck: (id, archived) => setTrucks((list) => list.map((t) => (t.id === id ? { ...t, archived } : t))),
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
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider');
  return ctx;
}

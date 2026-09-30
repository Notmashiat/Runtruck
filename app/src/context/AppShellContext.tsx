import { createContext, useContext, useState, type ReactNode } from 'react';
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
  // Every load, newest entries first. Kept in this browser's storage (there is
  // no back end yet), so new, edited and deleted loads survive a reload.
  loads: Load[];
  addLoad: (l: Load) => void;
  updateLoad: (l: Load) => void;
  deleteLoad: (id: string) => void;
}

const AppShellContext = createContext<AppShellState | null>(null);

function reviveLoads(raw: unknown): Load[] | null {
  return Array.isArray(raw) && raw.every((l) => l && typeof l.id === 'string' && typeof l.route === 'string' && typeof l.carrier === 'string')
    ? (raw as Load[])
    : null;
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [loadTab, setLoadTab] = useState<LoadTab>('Active');
  const [driverTab, setDriverTab] = useState<DriverTab>('All');
  const [approved, setApproved] = useState(false);
  const [loads, setLoads] = usePersisted<Load[]>('runtruck-loads', LOADS, reviveLoads);

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
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider');
  return ctx;
}

import { createContext, useContext, useState, type ReactNode } from 'react';

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
}

const AppShellContext = createContext<AppShellState | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [loadTab, setLoadTab] = useState<LoadTab>('Active');
  const [driverTab, setDriverTab] = useState<DriverTab>('All');
  const [approved, setApproved] = useState(false);

  const value: AppShellState = {
    query,
    setQuery,
    loadTab,
    setLoadTab,
    driverTab,
    setDriverTab,
    approved,
    approveAll: () => setApproved(true),
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider');
  return ctx;
}

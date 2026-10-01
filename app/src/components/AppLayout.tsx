import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AppShellProvider } from '../context/AppShellContext';
import { useEffect } from 'react';
import { TODAY } from '../data/planner';
import { todayIso } from '../lib/clock';
import { useSettings } from '../lib/settingsStore';

export function AppLayout() {
  useSettings();
  // After midnight, reload once nothing is open so every "today" in the app
  // (dashboard, planner, due dates, demo records) moves to the new day.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (todayIso() !== TODAY && !document.querySelector('dialog[open]')) window.location.reload();
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <AppShellProvider>
      <div className="ui-shell">
        <Sidebar />
        <div className="ui-column">
          <Header />
          <main className="ui-main">
            <Outlet />
          </main>
        </div>
      </div>
    </AppShellProvider>
  );
}

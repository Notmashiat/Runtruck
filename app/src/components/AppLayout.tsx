import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AppShellProvider } from '../context/AppShellContext';
import { useEffect } from 'react';
import { TODAY } from '../data/planner';
import { currentSession } from '../lib/auth';
import { todayIso } from '../lib/clock';
import { useSettings } from '../lib/settingsStore';

export function AppLayout() {
  useSettings();
  const location = useLocation();
  // After midnight, reload once nothing is open so every "today" in the app
  // (dashboard, planner, due dates, demo records) moves to the new day.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (todayIso() !== TODAY && !document.querySelector('dialog[open]')) window.location.reload();
      // A session that runs out while the app is open goes back to the login.
      if (!currentSession()) window.location.assign('/login');
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Not signed in: log in first, then come back here.
  if (!currentSession()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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

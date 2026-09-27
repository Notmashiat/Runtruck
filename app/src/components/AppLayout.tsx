import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AppShellProvider } from '../context/AppShellContext';

export function AppLayout() {
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

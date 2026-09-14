import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AppShellProvider } from '../context/AppShellContext';

export function AppLayout() {
  return (
    <AppShellProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Header />
          <div style={{ flex: 1, overflowY: 'auto', padding: '34px 40px' }}>
            <Outlet />
          </div>
        </div>
      </div>
    </AppShellProvider>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { LandingPage } from './pages/marketing/LandingPage';
import { DashboardPage } from './pages/app/DashboardPage';
import { LoadsPage } from './pages/app/LoadsPage';
import { LoadDetailPage } from './pages/app/LoadDetailPage';
import { DriversPage } from './pages/app/DriversPage';
import { TrucksPage } from './pages/app/TrucksPage';
import { CustomersPage } from './pages/app/CustomersPage';
import { InvoicesPage } from './pages/app/InvoicesPage';
import { SettlementsPage } from './pages/app/SettlementsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="loads" element={<LoadsPage />} />
        <Route path="loads/:id" element={<LoadDetailPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="trucks" element={<TrucksPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="settlements" element={<SettlementsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

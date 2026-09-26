import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { LandingPage } from './pages/marketing/LandingPage';
import { DashboardPage } from './pages/app/DashboardPage';
import { LoadsPage } from './pages/app/LoadsPage';
import { LoadDetailPage } from './pages/app/LoadDetailPage';
import { PlannerPage } from './pages/app/PlannerPage';
import { TrucksPage } from './pages/app/TrucksPage';
import { CustomersPage } from './pages/app/CustomersPage';
import { FacilitiesPage } from './pages/app/FacilitiesPage';
import { AccountingPage } from './pages/app/AccountingPage';
import { DriversPage } from './pages/app/DriversPage';
import { SafetyPage } from './pages/app/SafetyPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="loads" element={<LoadsPage />} />
        <Route path="loads/:id" element={<LoadDetailPage />} />
        <Route path="planner" element={<PlannerPage />} />
        <Route path="fleet" element={<TrucksPage />} />
        <Route path="crm" element={<CustomersPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        <Route path="accounting" element={<AccountingPage tab="Invoicing" />} />
        <Route path="accounting/settlements" element={<AccountingPage tab="Settlements" />} />
        <Route path="hr" element={<DriversPage />} />
        <Route path="safety" element={<SafetyPage />} />
      </Route>
      {/* Section URLs from before the sidebar was reorganised, so old links still land. They
          sit outside the /app layout on purpose: Header looks the section up in HEAD, which
          has no entry for these keys. */}
      <Route path="/app/drivers" element={<Navigate to="/app/hr" replace />} />
      <Route path="/app/trucks" element={<Navigate to="/app/fleet" replace />} />
      <Route path="/app/customers" element={<Navigate to="/app/crm" replace />} />
      <Route path="/app/invoices" element={<Navigate to="/app/accounting" replace />} />
      <Route path="/app/settlements" element={<Navigate to="/app/accounting/settlements" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

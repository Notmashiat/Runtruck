import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { TabbedSection } from './components/TabbedSection';
import { LandingPage } from './pages/marketing/LandingPage';
import { DashboardPage } from './pages/app/DashboardPage';
import { LoadsPage } from './pages/app/LoadsPage';
import { LoadDetailPage } from './pages/app/LoadDetailPage';
import { PlannerPage } from './pages/app/PlannerPage';
import { CustomersPage } from './pages/app/CustomersPage';
import { FacilitiesPage } from './pages/app/FacilitiesPage';
import { SettingsPage } from './pages/app/SettingsPage';
import { getSettings } from './lib/settingsStore';
import { DriversTab } from './pages/app/fleet/DriversTab';
import { TrucksTab } from './pages/app/fleet/TrucksTab';
import { TrailersTab } from './pages/app/fleet/TrailersTab';
import { UninvoicedTab } from './pages/app/accounting/UninvoicedTab';
import { InvoicedTab } from './pages/app/accounting/InvoicedTab';
import { BatchesTab } from './pages/app/accounting/BatchesTab';
import { PastDueTab } from './pages/app/accounting/PastDueTab';
import { PaidTab } from './pages/app/accounting/PaidTab';
import { PayrollTab } from './pages/app/accounting/PayrollTab';
import { BillsTab } from './pages/app/accounting/BillsTab';
import { EmployeeContractsTab } from './pages/app/hr/EmployeeContractsTab';
import { OnboardingTab } from './pages/app/hr/OnboardingTab';
import { MaintenanceTab } from './pages/app/safety/MaintenanceTab';
import { DriverDocumentsTab } from './pages/app/safety/DriverDocumentsTab';
import { ViolationsTab } from './pages/app/safety/ViolationsTab';
import { ClaimSettlementsTab } from './pages/app/safety/ClaimSettlementsTab';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to={getSettings().appearance.startPage} replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="loads" element={<LoadsPage />} />
        <Route path="loads/:id" element={<LoadDetailPage />} />
        <Route path="planner" element={<PlannerPage />} />
        <Route path="fleet" element={<TabbedSection />}>
          <Route index element={<Navigate to="drivers" replace />} />
          <Route path="drivers" element={<DriversTab />} />
          <Route path="trucks" element={<TrucksTab />} />
          <Route path="trailers" element={<TrailersTab />} />
        </Route>
        <Route path="crm" element={<CustomersPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        <Route path="settings" element={<Navigate to="profile" replace />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        <Route path="accounting" element={<TabbedSection />}>
          <Route index element={<Navigate to="uninvoiced" replace />} />
          <Route path="uninvoiced" element={<UninvoicedTab />} />
          <Route path="invoiced" element={<InvoicedTab />} />
          <Route path="batches" element={<BatchesTab />} />
          <Route path="past-due" element={<PastDueTab />} />
          <Route path="paid" element={<PaidTab />} />
          <Route path="payroll" element={<PayrollTab />} />
          <Route path="bills" element={<BillsTab />} />
        </Route>
        <Route path="hr" element={<TabbedSection />}>
          <Route index element={<Navigate to="employee-contracts" replace />} />
          <Route path="employee-contracts" element={<EmployeeContractsTab />} />
          <Route path="onboarding" element={<OnboardingTab />} />
        </Route>
        <Route path="safety" element={<TabbedSection />}>
          <Route index element={<Navigate to="maintenance" replace />} />
          <Route path="maintenance" element={<MaintenanceTab />} />
          <Route path="driver-documents" element={<DriverDocumentsTab />} />
          <Route path="violations" element={<ViolationsTab />} />
          <Route path="settlements" element={<ClaimSettlementsTab />} />
        </Route>
      </Route>
      {/* Section URLs from before the sidebar was reorganised, so old links still land. They
          sit outside the /app layout on purpose: the tab bar and top bar key off the section
          in the URL, and these are not sections any more. */}
      <Route path="/app/drivers" element={<Navigate to="/app/fleet/drivers" replace />} />
      <Route path="/app/trucks" element={<Navigate to="/app/fleet/trucks" replace />} />
      <Route path="/app/customers" element={<Navigate to="/app/crm" replace />} />
      <Route path="/app/invoices" element={<Navigate to="/app/accounting/invoiced" replace />} />
      <Route path="/app/settlements" element={<Navigate to="/app/accounting/payroll" replace />} />
      <Route path="/app/accounting/settlements" element={<Navigate to="/app/accounting/payroll" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

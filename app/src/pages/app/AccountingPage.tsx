import { useNavigate } from 'react-router-dom';
import { InvoicesPage } from './InvoicesPage';
import { SettlementsPage } from './SettlementsPage';

type AccountingTab = 'Invoicing' | 'Settlements';

const TABS: { label: AccountingTab; to: string }[] = [
  { label: 'Invoicing', to: '/app/accounting' },
  { label: 'Settlements', to: '/app/accounting/settlements' },
];

// Accounting holds the two money screens from the original design (invoicing
// and driver settlements) behind one sidebar entry. The tab is part of the URL,
// like every other screen, so a settlements link still opens settlements.
export function AccountingPage({ tab }: { tab: AccountingTab }) {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="seg">
          {/* onChange rather than the label onClick the other tab bars use: a label click also
              fires a synthesised click on its input, and navigate() is not idempotent. */}
          {TABS.map((t) => (
            <label key={t.label} className="seg-opt">
              <input type="radio" name="accttab" checked={tab === t.label} onChange={() => navigate(t.to)} />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {tab === 'Invoicing' ? <InvoicesPage /> : <SettlementsPage />}
    </div>
  );
}

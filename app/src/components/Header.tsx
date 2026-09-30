import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import { UNINVOICED } from '../data/accounting';
import { SECTION_TABS, type ViewKey } from '../data/mock';
import { NewLoadDialog } from './NewLoadDialog';

interface HeadAction {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

// Screens with nothing to filter get no Filters button.
const NO_FILTERS: ViewKey[] = ['dashboard', 'planner', 'facilities'];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { query, setQuery, approveAll, loads } = useAppShell();
  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Route matching is case-insensitive, so normalise before keying off the section.
  const segments = location.pathname.toLowerCase().split('/');
  const view = (segments[2] || 'dashboard') as ViewKey;
  const tab = SECTION_TABS[view] ? segments[3] : undefined;
  const onLoadDetail = view === 'loads' && Boolean(segments[3]);
  const detailLoad = onLoadDetail ? loads.find((l) => l.id.toLowerCase() === segments[3]) : undefined;

  // Keyed by section, or section/tab for the tabbed sections. Most are stubs,
  // as in the original prototype; the ones that navigate are the real flows.
  const actionsFor: Record<string, HeadAction[]> = {
    dashboard: [{ label: '+ New Load', primary: true, onClick: () => setNewLoadOpen(true) }],
    loads: [{ label: '+ New Load', primary: true, onClick: () => setNewLoadOpen(true) }],
    loadDetail: [
      { label: 'Message driver' },
      ...(detailLoad ? [{ label: 'Edit load', onClick: () => setEditOpen(true) }] : []),
      { label: 'Update status', primary: true },
    ],
    'fleet/drivers': [{ label: '+ Add Driver', primary: true }],
    'fleet/trucks': [{ label: 'Log service' }, { label: '+ Add Unit', primary: true }],
    'fleet/trailers': [{ label: '+ Add Trailer', primary: true }],
    crm: [{ label: '+ Add Customer', primary: true }],
    'accounting/uninvoiced': [{ label: `Invoice ${UNINVOICED.length} loads`, primary: true, onClick: () => navigate('/app/accounting/invoiced') }],
    'accounting/invoiced': [{ label: 'Export batch' }, { label: '+ New Batch', primary: true, onClick: () => navigate('/app/accounting/batches') }],
    'accounting/batches': [{ label: '+ New Batch', primary: true }],
    'accounting/past-due': [{ label: 'Send reminders', primary: true }],
    'accounting/paid': [{ label: 'Export' }],
    'accounting/payroll': [{ label: 'Run settlements', primary: true, onClick: () => approveAll() }],
    'accounting/bills': [{ label: '+ Add Bill', primary: true }],
    'hr/employee-contracts': [{ label: '+ New Contract', primary: true }],
    'hr/onboarding': [{ label: '+ Start Onboarding', primary: true }],
    'safety/maintenance': [{ label: '+ Log Service', primary: true }],
    'safety/driver-documents': [{ label: 'Request document', primary: true }],
    'safety/violations': [{ label: '+ Log Violation', primary: true }],
    'safety/settlements': [{ label: '+ New Claim', primary: true }],
  };
  const headActions = actionsFor[onLoadDetail ? 'loadDetail' : tab ? `${view}/${tab}` : view] ?? [];
  const showFilters = !onLoadDetail && !NO_FILTERS.includes(view);

  return (
    <header className="ui-topbar">
      {onLoadDetail ? (
        <button onClick={() => navigate('/app/loads')} className="ui-btn" type="button">
          ← Loads
        </button>
      ) : (
        <input
          className="ui-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search"
        />
      )}
      <div style={{ flex: 1 }} />
      {showFilters && (
        <button className="ui-btn" type="button">
          Filters
        </button>
      )}
      {headActions.map((a) => (
        <button key={a.label} onClick={a.onClick} className={`ui-btn${a.primary ? ' ui-btn-primary' : ''}`} type="button">
          {a.label}
        </button>
      ))}
      {newLoadOpen && (
        <NewLoadDialog onClose={() => setNewLoadOpen(false)} onSaved={(id) => navigate(`/app/loads/${id}`)} />
      )}
      {editOpen && detailLoad && (
        <NewLoadDialog load={detailLoad} onClose={() => setEditOpen(false)} onDeleted={() => { setEditOpen(false); navigate('/app/loads'); }} />
      )}
    </header>
  );
}

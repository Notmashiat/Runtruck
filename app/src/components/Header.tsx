import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import { NAV, SECTION_TABS, type ViewKey } from '../data/mock';
import { isActive, pageKeyOf } from '../lib/tableTools';
import { describe, FilterPanel } from './FilterPanel';
import { BatchDialog } from './BatchDialog';
import { FacilityDialog } from './FacilityDialog';
import { InvoiceDialog } from './InvoiceDialog';
import { ReminderDialog } from './ReminderDialog';
import { DriverDialog, TrailerDialog, TruckDialog } from './FleetDialogs';
import { NewLoadDialog } from './NewLoadDialog';

interface HeadAction {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

// Screens with nothing to filter get no Filters button.
const NO_FILTERS: ViewKey[] = ['dashboard', 'planner'];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { query, setQuery, approveAll, loads, filterMeta, filterValues, setFilter, clearFilters } = useAppShell();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [adding, setAdding] = useState<'driver' | 'truck' | 'trailer' | 'facility' | 'invoice' | 'batch' | 'reminders' | null>(null);

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
    'fleet/drivers': [{ label: '+ Add Driver', primary: true, onClick: () => setAdding('driver') }],
    'fleet/trucks': [{ label: 'Log service' }, { label: '+ Add Unit', primary: true, onClick: () => setAdding('truck') }],
    'fleet/trailers': [{ label: '+ Add Trailer', primary: true, onClick: () => setAdding('trailer') }],
    crm: [{ label: '+ Add Customer', primary: true }],
    facilities: [{ label: '+ Add Facility', primary: true, onClick: () => setAdding('facility') }],
    'accounting/uninvoiced': [{ label: '+ New Invoice', primary: true, onClick: () => setAdding('invoice') }],
    'accounting/invoiced': [{ label: '+ New Invoice', primary: true, onClick: () => setAdding('invoice') }],
    'accounting/batches': [{ label: '+ New Batch', primary: true, onClick: () => setAdding('batch') }],
    'accounting/past-due': [{ label: 'Send reminders', primary: true, onClick: () => setAdding('reminders') }],
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
  const page = pageKeyOf(location.pathname);
  const meta = filterMeta[page] ?? [];
  const values = filterValues[page] ?? {};
  const activeFilters = meta.filter((m) => isActive(values[m.key]));
  const showFilters = !onLoadDetail && !NO_FILTERS.includes(view) && meta.length > 0;
  const navLabel = NAV.find((n) => 'key' in n && n.key === view);
  const pageTitle = [navLabel && 'label' in navLabel ? navLabel.label : view, tab ? SECTION_TABS[view]?.find((t) => t.key === tab)?.label : ''].filter(Boolean).join(' › ');

  return (
    <>
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
        <button className={`ui-btn ui-filters-btn${activeFilters.length ? ' is-on' : ''}`} type="button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          Filters{activeFilters.length > 0 && <span className="ui-filters-count">{activeFilters.length}</span>}
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
      {adding === 'driver' && <DriverDialog onClose={() => setAdding(null)} />}
      {adding === 'truck' && <TruckDialog onClose={() => setAdding(null)} />}
      {adding === 'trailer' && <TrailerDialog onClose={() => setAdding(null)} />}
      {adding === 'facility' && <FacilityDialog onClose={() => setAdding(null)} />}
      {adding === 'invoice' && <InvoiceDialog onClose={() => setAdding(null)} />}
      {adding === 'batch' && <BatchDialog onClose={() => setAdding(null)} />}
      {adding === 'reminders' && <ReminderDialog onClose={() => setAdding(null)} />}
      {filtersOpen && <FilterPanel page={page} title={pageTitle} onClose={() => setFiltersOpen(false)} />}
    </header>
    {showFilters && activeFilters.length > 0 && (
      <div className="ui-filterbar" role="region" aria-label="Active filters">
        {activeFilters.map((m) => (
          <span key={m.key} className="ui-filter-chip">
            <button type="button" className="ui-filter-chip-text" onClick={() => setFiltersOpen(true)}>{describe(m, values[m.key])}</button>
            <button type="button" className="ui-filter-chip-x" aria-label={`Remove ${m.label} filter`} onClick={() => setFilter(page, m.key, undefined)}>×</button>
          </span>
        ))}
        <button type="button" className="ui-link" onClick={() => clearFilters(page)}>Clear all</button>
      </div>
    )}
    </>
  );
}

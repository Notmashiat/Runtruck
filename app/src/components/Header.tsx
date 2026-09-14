import { useLocation, useNavigate } from 'react-router-dom';
import { HEAD, LOADS, type ViewKey } from '../data/mock';
import { useAppShell } from '../context/AppShellContext';

interface HeadAction {
  label: string;
  cls: string;
  onClick: () => void;
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { query, setQuery, approveAll } = useAppShell();

  const segments = location.pathname.split('/');
  const view = (segments[2] || 'dashboard') as ViewKey;
  const loadId = segments[3];
  const sel = loadId ? LOADS.find((l) => l.id === loadId) ?? LOADS[0] : null;

  const showBack = Boolean(sel);
  const showSearch = (view === 'dashboard' || view === 'loads') && !sel;

  const headKicker = sel ? `Load ${sel.id} · ${sel.customer}` : HEAD[view][0];
  const headTitle = sel ? sel.route : HEAD[view][1];

  const actionsFor: Record<string, HeadAction[]> = {
    dashboard: [{ label: 'New load', cls: 'btn-primary', onClick: () => navigate('/app/loads') }],
    loads: [{ label: 'New load', cls: 'btn-primary', onClick: () => navigate('/app/loads') }],
    loadDetail: [
      { label: 'Message driver', cls: 'btn-secondary', onClick: () => {} },
      { label: 'Update status', cls: 'btn-primary', onClick: () => {} },
    ],
    drivers: [{ label: 'Add driver', cls: 'btn-primary', onClick: () => {} }],
    trucks: [
      { label: 'Log service', cls: 'btn-secondary', onClick: () => {} },
      { label: 'Add unit', cls: 'btn-primary', onClick: () => {} },
    ],
    customers: [{ label: 'Add customer', cls: 'btn-primary', onClick: () => {} }],
    invoices: [
      { label: 'Export batch', cls: 'btn-secondary', onClick: () => {} },
      { label: 'Invoice 11 loads', cls: 'btn-primary', onClick: () => navigate('/app/settlements') },
    ],
    settlements: [{ label: 'Run settlements', cls: 'btn-primary', onClick: () => approveAll() }],
  };
  const headActions = actionsFor[sel ? 'loadDetail' : view] ?? [];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '20px 40px',
        borderBottom: '1px solid var(--color-divider)',
        flex: 'none',
      }}
    >
      {showBack && (
        <button onClick={() => navigate('/app/loads')} className="btn btn-ghost" type="button">
          ← Loads
        </button>
      )}
      <div>
        <div className="lbl" style={{ color: 'var(--color-accent-700)' }}>
          {headKicker}
        </div>
        <h1 style={{ fontSize: 30, marginTop: 5 }}>{headTitle}</h1>
      </div>
      <div style={{ flex: 1 }} />
      {showSearch && (
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search loads, drivers, customers"
          style={{ width: 250 }}
        />
      )}
      {headActions.map((a) => (
        <button key={a.label} onClick={a.onClick} className={`btn ${a.cls}`} type="button">
          {a.label}
        </button>
      ))}
    </div>
  );
}

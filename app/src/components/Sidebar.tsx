import { Link, useLocation } from 'react-router-dom';
import {
  NAV,
  LOADS,
  DRIVERS,
  TRUCKS,
  CUSTOMERS,
  INVOICES,
  SETTLEMENTS,
  type ViewKey,
} from '../data/mock';
import { useAppShell } from '../context/AppShellContext';

const COUNTS: Record<ViewKey, string> = {
  dashboard: '',
  loads: String(LOADS.length),
  drivers: String(DRIVERS.length),
  trucks: String(TRUCKS.length),
  customers: String(CUSTOMERS.length),
  invoices: String(INVOICES.length),
  settlements: String(SETTLEMENTS.length),
};

export function Sidebar() {
  const location = useLocation();
  const { setQuery } = useAppShell();
  const activeKey = (location.pathname.split('/')[2] || 'dashboard') as ViewKey;

  return (
    <div
      style={{
        width: 232,
        flex: 'none',
        background: 'var(--color-accent-900)',
        color: 'var(--color-bg)',
        padding: '26px 0',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '0 22px 32px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 16, height: 16, background: 'var(--color-accent-400)' }} />
        <div className="num" style={{ fontSize: 19, letterSpacing: '0.06em' }}>
          RUNTRUCK
        </div>
      </div>

      {NAV.map((n, i) => {
        if ('group' in n) {
          return (
            <div
              key={`group-${i}`}
              style={{
                padding: '30px 22px 12px 22px',
                color: 'var(--color-accent-400)',
                background: 'transparent',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 400,
                cursor: 'default',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1 }}>{n.group}</div>
            </div>
          );
        }
        const on = n.key === activeKey;
        return (
          <Link
            key={n.key}
            to={`/app/${n.key}`}
            onClick={() => setQuery('')}
            style={{
              padding: '10px 22px',
              color: on ? 'var(--color-bg)' : 'var(--color-accent-200)',
              background: on ? 'var(--color-accent)' : 'transparent',
              fontSize: 14,
              letterSpacing: 0,
              textTransform: 'none',
              fontWeight: on ? 500 : 400,
              cursor: 'pointer',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            <div style={{ flex: 1 }}>{n.label}</div>
            <div className="num" style={{ fontSize: 13, opacity: 0.7 }}>
              {COUNTS[n.key]}
            </div>
          </Link>
        );
      })}

      <div style={{ flex: 1, minHeight: 24 }} />
      <div
        style={{
          margin: '0 22px',
          paddingTop: 16,
          borderTop: '1px solid var(--color-accent-700)',
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 500 }}>Rosa Medina</div>
        <div style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>Dispatch · Sunridge Freight</div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { Blueprint } from '../../components/Blueprint';
import { Tag } from '../../components/Tag';
import { useAppShell, type LoadTab } from '../../context/AppShellContext';
import { LOADS } from '../../data/mock';

const TABS: LoadTab[] = ['Active', 'Needs POD', 'Delivered', 'All'];
const ACTIVE_STATUSES = ['In transit', 'At pickup', 'Dispatched', 'Delayed', 'Needs driver'];

function matches(l: (typeof LOADS)[number], q: string) {
  return `${l.id} ${l.customer} ${l.route} ${l.driver}`.toLowerCase().includes(q);
}

export function LoadsPage() {
  const navigate = useNavigate();
  const { query, setQuery, loadTab, setLoadTab } = useAppShell();
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  let loadRows = LOADS;
  if (searching) loadRows = LOADS.filter((l) => matches(l, q));
  else if (loadTab === 'Active') loadRows = LOADS.filter((l) => ACTIVE_STATUSES.includes(l.status));
  else if (loadTab === 'Needs POD') loadRows = LOADS.filter((l) => l.status === 'Needs POD');
  else if (loadTab === 'Delivered') loadRows = LOADS.filter((l) => l.status === 'Delivered');

  const loadCount = searching ? `${loadRows.length} matching “${query}”` : `${loadRows.length} loads`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="seg">
          {TABS.map((t) => (
            <label key={t} className="seg-opt" onClick={() => { setLoadTab(t); setQuery(''); }}>
              <input type="radio" name="loadtab" readOnly checked={!searching && loadTab === t} />
              {t}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>{loadCount}</div>
      </div>

      <div style={{ minWidth: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Load</th><th>Customer</th><th>Route</th><th>Pickup</th><th>Delivery</th><th>Driver / unit</th>
              <th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loadRows.map((l) => (
              <tr key={l.id} onClick={() => navigate(`/app/loads/${l.id}`)} className="row-link">
                <td className="num" style={{ fontSize: 14 }}>{l.id}</td>
                <td>{l.customer}</td>
                <td style={{ color: 'var(--color-neutral-700)' }}>{l.route}</td>
                <td className="num" style={{ fontSize: 14 }}>{l.pickup}</td>
                <td className="num" style={{ fontSize: 14 }}>{l.delivery}</td>
                <td>{l.driver} <span className="num" style={{ color: 'var(--color-neutral-600)' }}>{l.unit}</span></td>
                <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{l.rate}</td>
                <td style={{ textAlign: 'right' }}><Tag label={l.status} tagClass={l.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loadRows.length === 0 && (
        <Blueprint style={{ padding: 44, textAlign: 'center', fontSize: 14, color: 'var(--color-neutral-700)' }}>
          Nothing matches that filter.
        </Blueprint>
      )}
    </div>
  );
}

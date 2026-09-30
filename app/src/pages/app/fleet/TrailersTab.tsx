import { useState } from 'react';
import { Card } from '../../../components/Card';
import { TrailerDialog } from '../../../components/FleetDialogs';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import type { FleetTrailer } from '../../../data/fleet';
import { matchesQuery } from '../../../lib/search';

export function TrailersTab() {
  const { query, trailers } = useAppShell();
  const [editing, setEditing] = useState<FleetTrailer | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = trailers.filter((t) => !t.archived);
  const archivedCount = trailers.length - active.length;
  const loaded = active.filter((t) => t.status === 'Loaded');
  const empty = active.filter((t) => t.status === 'Empty');
  const inspection = active.filter((t) => t.status === 'Inspection' || t.status === 'In shop');
  const countKind = (prefix: string) => active.filter((t) => t.kind.startsWith(prefix)).length;
  const rolling = loaded.filter((t) => t.where.startsWith('En route')).length;
  const atYard = empty.filter((t) => t.where.startsWith('Yard')).length;

  const kpis = [
    { label: 'Trailers', value: String(active.length), note: `${countKind('Reefer')} reefer · ${countKind('Dry van')} dry van · ${countKind('Flatbed')} flatbed` },
    { label: 'Loaded', value: String(loaded.length), note: `${rolling} rolling · ${loaded.length - rolling} at shippers` },
    { label: 'Empty', value: String(empty.length), note: `${atYard} at the Modesto yard` },
    { label: 'Inspection / shop', value: String(inspection.length), note: inspection.map((t) => t.unit).join(', ') || 'None pending' },
  ];

  const rows = (showArchived ? trailers : active).filter((t) => matchesQuery({ ...t, ...t.details }, query));

  const action = archivedCount > 0 && (
    <label className="ui-check">
      <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      Show archived ({archivedCount})
    </label>
  );

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Trailers" flush action={action || undefined}>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Unit</th><th>Type</th><th>Make / year</th><th>Plate</th><th>Status</th><th>Location</th><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={t.archived ? 'is-archived' : ''}>
                <td className="strong">{t.unit}</td>
                <td>{t.kind}</td>
                <td>{[t.details.make, t.details.year].filter(Boolean).join(' · ') || '—'}</td>
                <td className="muted">{[t.details.plateState, t.details.plateNumber].filter(Boolean).join(' ') || '—'}</td>
                <td>{t.archived ? <Tag label="Archived" tagClass="tag-neutral" /> : <Tag label={t.status} tagClass={t.tagClass} />}</td>
                <td>{t.where}</td>
                <td className="num"><button type="button" className="ui-link" onClick={() => setEditing(t)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{query ? `Nothing matches “${query}”.` : 'No trailers yet.'}</div>}
      </Card>

      {editing && <TrailerDialog trailer={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

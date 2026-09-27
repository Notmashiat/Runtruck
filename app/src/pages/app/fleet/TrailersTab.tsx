import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { TRAILERS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';

const loaded = TRAILERS.filter((t) => t.status === 'Loaded');
const empty = TRAILERS.filter((t) => t.status === 'Empty');
const inspection = TRAILERS.filter((t) => t.status === 'Inspection');
const countKind = (prefix: string) => TRAILERS.filter((t) => t.kind.startsWith(prefix)).length;
const rolling = loaded.filter((t) => t.where.startsWith('En route')).length;
const atYard = empty.filter((t) => t.where.startsWith('Yard')).length;

const KPIS = [
  { label: 'Trailers', value: String(TRAILERS.length), note: `${countKind('Reefer')} reefer · ${countKind('Dry van')} dry van · ${countKind('Flatbed')} flatbed` },
  { label: 'Loaded', value: String(loaded.length), note: `${rolling} rolling · ${loaded.length - rolling} at shippers` },
  { label: 'Empty', value: String(empty.length), note: `${atYard} at the Modesto yard` },
  { label: 'Inspection', value: String(inspection.length), note: inspection.length ? `${inspection.map((t) => t.unit).join(', ')} · annual DOT` : 'None pending' },
];

export function TrailersTab() {
  const { query } = useAppShell();
  const rows = TRAILERS.filter((t) => matchesQuery(t, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Trailers" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Unit</th><th>Type</th><th>Status</th><th>Location</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.unit}>
                <td className="strong">{t.unit}</td>
                <td>{t.kind}</td>
                <td><Tag label={t.status} tagClass={t.tagClass} /></td>
                <td>{t.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

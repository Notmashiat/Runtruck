import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { DRIVER_DOCUMENTS } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';

const EXPIRING = DRIVER_DOCUMENTS.filter((d) => d.status === 'Expiring');
const EXPIRED = DRIVER_DOCUMENTS.filter((d) => d.status === 'Expired');
const MISSING = DRIVER_DOCUMENTS.filter((d) => d.status === 'Missing');
const DRIVER_COUNT = new Set(DRIVER_DOCUMENTS.map((d) => d.driver)).size;

const KPIS = [
  { label: 'Documents', value: String(DRIVER_DOCUMENTS.length), note: `${DRIVER_COUNT} drivers on file` },
  { label: 'Expiring (60 d)', value: String(EXPIRING.length), note: 'Renew before Nov 2' },
  { label: 'Expired', value: String(EXPIRED.length), note: EXPIRED.map((d) => `${d.driver} · ${d.document}`).join(', ') || 'None' },
  { label: 'Missing', value: String(MISSING.length), note: MISSING.map((d) => `${d.driver} · ${d.document}`).join(', ') || 'None' },
];

export function DriverDocumentsTab() {
  const { query } = useAppShell();
  const rows = DRIVER_DOCUMENTS.filter((d) => matchesQuery(d, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Driver qualification files" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Driver</th><th>Document</th><th>Expires</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.driver} ${d.document}`}>
                <td className="strong">{d.driver}</td>
                <td>{d.document}</td>
                <td>{d.expires}</td>
                <td className="num"><Tag label={d.status} tagClass={d.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

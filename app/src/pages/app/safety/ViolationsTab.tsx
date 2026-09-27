import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { VIOLATIONS } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';

const OPEN = VIOLATIONS.filter((v) => v.status === 'Open');
const CONTESTED = VIOLATIONS.filter((v) => v.status === 'Contested');
const CLOSED = VIOLATIONS.filter((v) => v.status === 'Closed');
const POINTS = VIOLATIONS.reduce((sum, v) => sum + v.severityPoints, 0);

const KPIS = [
  { label: 'Open', value: String(OPEN.length), note: 'Corrective action pending' },
  { label: 'Points (12 mo)', value: String(POINTS), note: `CSA severity · ${VIOLATIONS.length} violations` },
  { label: 'Contested', value: String(CONTESTED.length), note: 'DataQ challenge filed' },
  { label: 'Closed', value: String(CLOSED.length), note: 'Resolved, on file' },
];

export function ViolationsTab() {
  const { query } = useAppShell();
  const rows = VIOLATIONS.filter((v) => matchesQuery(v, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Roadside inspections & violations" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Date</th><th>Driver</th><th>Unit</th><th>Type</th><th className="num">Points</th><th>Location</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={`${v.date} ${v.driver} ${v.type}`}>
                <td>{v.date}</td>
                <td className="strong">{v.driver}</td>
                <td>{v.unit}</td>
                <td>{v.type}</td>
                <td className="num">{v.severityPoints}</td>
                <td className="muted">{v.location}</td>
                <td className="num"><Tag label={v.status} tagClass={v.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

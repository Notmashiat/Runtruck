import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { CLAIMS, money } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';

// "Open" here covers anything not yet resolved, i.e. Open and Under review.
const OPEN = CLAIMS.filter((c) => c.status === 'Open' || c.status === 'Under review');
const SETTLED = CLAIMS.filter((c) => c.status === 'Settled');
const DENIED = CLAIMS.filter((c) => c.status === 'Denied');
const PAID = CLAIMS.filter((c) => c.paid > 0);

const KPIS = [
  { label: 'Open claims', value: String(OPEN.length), note: `${CLAIMS.filter((c) => c.status === 'Under review').length} under review` },
  { label: 'Reserved', value: money(OPEN.reduce((sum, c) => sum + c.reserved, 0)), note: 'On open claims' },
  { label: 'Paid YTD', value: money(PAID.reduce((sum, c) => sum + c.paid, 0)), note: `${PAID.length} settlements` },
  { label: 'Settled', value: String(SETTLED.length), note: `${DENIED.length} denied` },
];

export function ClaimSettlementsTab() {
  const { query } = useAppShell();
  const rows = CLAIMS.filter((c) => matchesQuery(c, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Claims" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Claim</th><th>Date</th><th>Driver</th><th>Unit</th><th>Type</th><th>Claimant</th>
              <th className="num">Reserved</th><th className="num">Paid</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="strong">{c.id}</td>
                <td>{c.date}</td>
                <td>{c.driver}</td>
                <td>{c.unit}</td>
                <td>{c.type}</td>
                <td>{c.claimant}</td>
                <td className="num">{money(c.reserved)}</td>
                <td className="num">{c.paid > 0 ? money(c.paid) : '—'}</td>
                <td className="num"><Tag label={c.status} tagClass={c.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

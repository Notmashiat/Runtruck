import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { CONTRACTS } from '../../../data/hr';
import { matchesQuery } from '../../../lib/search';

const active = CONTRACTS.filter((c) => c.status === 'Active');
const renewals = CONTRACTS.filter((c) => c.status === 'Renewal due');
const ownerOps = CONTRACTS.filter((c) => c.role === 'Owner-operator');
const drafts = CONTRACTS.filter((c) => c.status === 'Draft');

const KPIS = [
  { label: 'Active contracts', value: String(active.length), note: `${CONTRACTS.length} on file` },
  { label: 'Renewals due (30 d)', value: String(renewals.length), note: 'Raman Sep 20 · Nakamura Oct 1' },
  { label: 'Owner-operators', value: String(ownerOps.length), note: 'Frey · lease-purchase ends Nov 15' },
  { label: 'Drafts', value: String(drafts.length), note: 'Reed · starts Sep 8' },
];

export function EmployeeContractsTab() {
  const { query } = useAppShell();
  const rows = CONTRACTS.filter((c) => matchesQuery(c, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Employee contracts" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Employee</th><th>Role</th><th>Type</th><th>Start</th><th>Renews</th><th>Pay basis</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.employee}>
                <td className="strong">{c.employee}</td>
                <td>{c.role}</td>
                <td>{c.type}</td>
                <td>{c.start}</td>
                <td>{c.renews}</td>
                <td className="muted">{c.payBasis}</td>
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

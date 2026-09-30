import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { CONTRACTS } from '../../../data/hr';
import { TODAY, daysFrom } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'Oct 1' (this year) or 'Mar 14, 2027' → ISO date.
const iso = (s: string) => {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?$/.exec(s.trim());
  return m ? `${m[3] ?? '2026'}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};
const last = (name: string) => name.split(' ').at(-1);

// Counted from the contract rows; renewals from their renewal dates.
const active = CONTRACTS.filter((c) => c.status === 'Active');
const renewals = CONTRACTS.filter((c) => c.status !== 'Draft' && iso(c.renews) && daysFrom(TODAY, iso(c.renews)) >= 0 && daysFrom(TODAY, iso(c.renews)) <= 30);
const ownerOps = CONTRACTS.filter((c) => c.role === 'Owner-operator');
const drafts = CONTRACTS.filter((c) => c.status === 'Draft');

const KPIS = [
  { label: 'Active contracts', value: String(active.length), note: `${CONTRACTS.length} on file` },
  { label: 'Renewals due (30 d)', value: String(renewals.length), note: renewals.map((c) => `${last(c.employee)} ${c.renews}`).join(' · ') || 'None' },
  { label: 'Owner-operators', value: String(ownerOps.length), note: ownerOps.map((c) => `${last(c.employee)} · ${c.type.toLowerCase()} ${c.status === 'Expiring' ? 'ends' : 'renews'} ${c.renews}`).join(' · ') || 'None' },
  { label: 'Drafts', value: String(drafts.length), note: drafts.map((c) => `${last(c.employee)} · starts ${c.start}`).join(' · ') || 'None' },
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

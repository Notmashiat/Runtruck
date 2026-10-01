import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { CONTRACTS, type Contract } from '../../../data/hr';
import { TODAY, daysFrom } from '../../../data/invoicing';
import { currentYear } from '../../../lib/clock';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'Oct 1' (this year) or 'Mar 14, 2027' → ISO date.
const iso = (s: string) => {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?$/.exec(s.trim());
  return m ? `${m[3] ?? String(currentYear())}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
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

const FILTERS: FilterDef<Contract>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (c) => c.status, options: ['Active', 'Renewal due', 'Expiring', 'Draft'] },
  { key: 'role', label: 'Role', type: 'select', get: (c) => c.role },
  { key: 'type', label: 'Contract type', type: 'select', get: (c) => c.type },
  { key: 'renews', label: 'Renews or ends', type: 'dates', get: (c) => iso(c.renews) },
  { key: 'start', label: 'Started', type: 'dates', get: (c) => isoOf(c.start) },
];

export function EmployeeContractsTab() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(CONTRACTS.filter((c) => matchesQuery(c, query)), FILTERS), { renews: (c) => iso(c.renews) });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Employee contracts" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="employee">Employee</SortTh><SortTh sort={sort} k="role">Role</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="start">Start</SortTh><SortTh sort={sort} k="renews">Renews</SortTh><SortTh sort={sort} k="payBasis">Pay basis</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
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
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

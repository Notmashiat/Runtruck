import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { CLAIMS, money, type Claim } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

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

const FILTERS: FilterDef<Claim>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (c) => c.status, options: ['Open', 'Under review', 'Settled', 'Denied'] },
  { key: 'type', label: 'Claim type', type: 'select', get: (c) => c.type },
  { key: 'driver', label: 'Driver', type: 'select', get: (c) => c.driver },
  { key: 'claimant', label: 'Claimant', type: 'select', get: (c) => c.claimant },
  { key: 'date', label: 'Date', type: 'dates', get: (c) => isoOf(c.date) },
  { key: 'reserved', label: 'Reserved', type: 'range', get: (c) => c.reserved, prefix: '$' },
];

export function ClaimSettlementsTab() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(CLAIMS.filter((c) => matchesQuery(c, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Claims" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Claim</SortTh><SortTh sort={sort} k="date">Date</SortTh><SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="claimant">Claimant</SortTh>
              <SortTh sort={sort} k="reserved" num>Reserved</SortTh><SortTh sort={sort} k="paid" num>Paid</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
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
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

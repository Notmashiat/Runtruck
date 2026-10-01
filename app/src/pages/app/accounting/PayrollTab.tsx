import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { dollars, money } from '../../../data/accounting';
import { TODAY } from '../../../data/invoicing';
import { mondayOf } from '../../../data/metrics';
import { shortDate } from '../../../lib/clock';
import { SETTLE_TAG, SETTLEMENTS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';
import { numberOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

type SettlementRow = (typeof SETTLEMENTS)[number] & { tagClass: string };

const FILTERS: FilterDef<SettlementRow>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (s) => s.status },
  { key: 'basis', label: 'Pay basis', type: 'select', get: (s) => (s.basis.includes('%') ? '% of line haul' : s.basis.includes('/ mi') ? 'Per mile' : 'Other') },
  { key: 'net', label: 'Net pay', type: 'range', get: (s) => numberOf(s.net), prefix: '$' },
  { key: 'miles', label: 'Miles', type: 'range', get: (s) => numberOf(s.miles) },
];

// This week's settlements run Monday to Sunday.
const WEEK = shortDate(mondayOf(TODAY));

export function PayrollTab() {
  const { query, approved, approveAll } = useAppShell();

  // "Approve all" flips every Ready settlement to Approved; holds and paid rows stay as they are.
  const settlementRows = SETTLEMENTS.map((x) => {
    const status = approved && x.status === 'Ready' ? 'Approved' : x.status;
    return { ...x, status, tagClass: SETTLE_TAG[status] };
  });
  const ready = settlementRows.filter((s) => s.status === 'Ready').length;
  const gross = settlementRows.reduce((sum, x) => sum + dollars(x.gross), 0);
  const deductions = settlementRows.reduce((sum, x) => sum + dollars(x.ded), 0);
  const net = settlementRows.reduce((sum, x) => sum + dollars(x.net), 0);
  const sort = useSort(usePageFilters(settlementRows.filter((s) => matchesQuery(s, query)), FILTERS));
  const rows = sort.rows;

  const kpis = [
    { label: 'Drivers', value: String(settlementRows.length), note: approved ? 'Approved for payment' : `${ready} ready to approve` },
    { label: 'Gross', value: money(gross), note: `Week of ${WEEK}` },
    { label: 'Deductions', value: money(Math.abs(deductions)), note: 'Fuel advances and escrow' },
    { label: 'Net payable', value: money(net), note: approved ? 'Approved' : 'Awaiting approval' },
  ];

  return (
    <>
      <Kpis items={kpis} />

      <Card
        title={`Driver settlements · week of ${WEEK}`}
        flush
        action={<button type="button" className="ui-link" onClick={approveAll}>{approved ? 'Approved' : 'Approve all'}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Driver</SortTh><SortTh sort={sort} k="basis">Pay basis</SortTh><SortTh sort={sort} k="loads" num>Loads</SortTh><SortTh sort={sort} k="miles" num>Miles</SortTh>
              <SortTh sort={sort} k="gross" num>Gross</SortTh><SortTh sort={sort} k="ded" num>Deductions</SortTh><SortTh sort={sort} k="net" num>Net</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name}>
                <td className="strong">{s.name}</td>
                <td className="muted">{s.basis}</td>
                <td className="num">{s.loads}</td>
                <td className="num">{s.miles}</td>
                <td className="num">{s.gross}</td>
                <td className="num">{s.ded}</td>
                <td className="num strong">{s.net}</td>
                <td className="num"><Tag label={s.status} tagClass={s.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
        <div className="ui-total">Net payable this week <strong>{money(net)}</strong></div>
      </Card>
    </>
  );
}

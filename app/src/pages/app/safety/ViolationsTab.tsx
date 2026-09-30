import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { VIOLATIONS, type Violation } from '../../../data/safety';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

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

const FILTERS: FilterDef<Violation>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (v) => v.status, options: ['Open', 'Contested', 'Closed'] },
  { key: 'driver', label: 'Driver', type: 'select', get: (v) => v.driver },
  { key: 'unit', label: 'Unit', type: 'select', get: (v) => v.unit },
  { key: 'type', label: 'Violation type', type: 'select', get: (v) => v.type },
  { key: 'date', label: 'Date', type: 'dates', get: (v) => isoOf(v.date) },
  { key: 'points', label: 'Severity points', type: 'range', get: (v) => v.severityPoints },
];

export function ViolationsTab() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(VIOLATIONS.filter((v) => matchesQuery(v, query)), FILTERS));
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Roadside inspections & violations" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="date">Date</SortTh><SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="unit">Unit</SortTh><SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="severityPoints" num>Points</SortTh><SortTh sort={sort} k="location">Location</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
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
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

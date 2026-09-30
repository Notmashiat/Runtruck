import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { byUrgency, driverDocuments, renewBy, renewWindow, type DriverDoc } from '../../../data/compliance';
import { fmtDate } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Every qualification document of every active driver, worked out from the
// dates on their driver record (Fleet › Drivers › Edit), most urgent first.
const STATUS_ORDER = ['Expired', 'Missing', 'Expiring', 'Valid'];

const FILTERS: FilterDef<DriverDoc>[] = [
  { key: 'status', label: 'Status', type: 'select', get: (d) => d.status, options: STATUS_ORDER },
  { key: 'document', label: 'Document', type: 'select', get: (d) => d.document },
  { key: 'driver', label: 'Driver', type: 'select', get: (d) => d.driver },
  { key: 'date', label: 'Expires / due', type: 'dates', get: (d) => (d.onFile ? '' : d.date) },
];

export function DriverDocumentsTab() {
  const { query, drivers } = useAppShell();
  const docs = driverDocuments(drivers).sort(byUrgency);
  const of = (status: string) => docs.filter((d) => d.status === status);
  const list = (status: string) => of(status).map((d) => `${d.driver.split(' ').at(-1)} · ${d.document}`).join(', ') || 'None';

  const kpis = [
    { label: 'Documents', value: String(docs.length), note: `${new Set(docs.map((d) => d.driverId)).size} active drivers on file` },
    { label: `Expiring (${renewWindow()} d)`, value: String(of('Expiring').length), note: `Renew before ${fmtDate(renewBy(), true)}` },
    { label: 'Expired', value: String(of('Expired').length), note: list('Expired') },
    { label: 'Missing', value: String(of('Missing').length), note: list('Missing') },
  ];
  const sort = useSort(usePageFilters(docs.filter((d) => matchesQuery(d, query)), FILTERS), { status: (d) => STATUS_ORDER.indexOf(d.status), date: (d) => (d.onFile ? '' : d.date) });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Driver qualification files" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="driver">Driver</SortTh><SortTh sort={sort} k="document">Document</SortTh><SortTh sort={sort} k="date">Expires / due</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.driverId} ${d.document}`}>
                <td className="strong">{d.driver}</td>
                <td>{d.document}</td>
                <td>{d.onFile ? `On file · taken ${fmtDate(d.date)}` : d.date ? fmtDate(d.date) : '—'}</td>
                <td className="num"><Tag label={d.status} tagClass={d.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{docs.length ? 'Nothing matches the search or filters.' : 'No active drivers.'}</div>}
      </Card>
    </>
  );
}

import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { byUrgency, driverDocuments, RENEW_WINDOW, renewBy } from '../../../data/compliance';
import { fmtDate } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';

// Every qualification document of every active driver, worked out from the
// dates on their driver record (Fleet › Drivers › Edit), most urgent first.
export function DriverDocumentsTab() {
  const { query, drivers } = useAppShell();
  const docs = driverDocuments(drivers).sort(byUrgency);
  const of = (status: string) => docs.filter((d) => d.status === status);
  const list = (status: string) => of(status).map((d) => `${d.driver.split(' ').at(-1)} · ${d.document}`).join(', ') || 'None';

  const kpis = [
    { label: 'Documents', value: String(docs.length), note: `${new Set(docs.map((d) => d.driverId)).size} active drivers on file` },
    { label: `Expiring (${RENEW_WINDOW} d)`, value: String(of('Expiring').length), note: `Renew before ${fmtDate(renewBy(), true)}` },
    { label: 'Expired', value: String(of('Expired').length), note: list('Expired') },
    { label: 'Missing', value: String(of('Missing').length), note: list('Missing') },
  ];
  const rows = docs.filter((d) => matchesQuery(d, query));

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Driver qualification files" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Driver</th><th>Document</th><th>Expires / due</th><th className="num">Status</th>
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
        {rows.length === 0 && <div className="ui-empty">{query ? `Nothing matches “${query}”.` : 'No active drivers.'}</div>}
      </Card>
    </>
  );
}

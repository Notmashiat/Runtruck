import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { TRUCKS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';

// Odometer and service readings are display strings: '528,900' → 528900.
const miles = (s: string) => Number(s.replace(/,/g, ''));

const inService = TRUCKS.filter((t) => t.status === 'In service');
const inShop = TRUCKS.filter((t) => t.status === 'In shop');
const serviceDue = TRUCKS.filter((t) => t.status === 'Service due');
const avgOdo = TRUCKS.reduce((sum, t) => sum + miles(t.odo), 0) / TRUCKS.length;

const KPIS = [
  { label: 'Power units', value: String(TRUCKS.length), note: `Avg ${Math.round(avgOdo / 1000)}K mi` },
  { label: 'In service', value: String(inService.length), note: `Of ${TRUCKS.length} units` },
  { label: 'In shop', value: String(inShop.length), note: inShop.length ? `${inShop.map((t) => t.unit).join(', ')} · turbo` : 'Bays clear' },
  { label: 'Service due', value: String(serviceDue.length), note: serviceDue.map((t) => `${t.unit} in ${(miles(t.service) - miles(t.odo)).toLocaleString()} mi`).join(', ') || 'Nothing due' },
];

export function TrucksTab() {
  const { query } = useAppShell();
  const rows = TRUCKS.filter((t) => matchesQuery(t, query));

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Power units" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Unit</th><th>Make / year</th><th>Plate</th><th>Assigned to</th>
              <th className="num">Odometer</th><th className="num">Next service</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.unit}>
                <td className="strong">{t.unit}</td>
                <td>{t.make}</td>
                <td className="muted">{t.plate}</td>
                <td>{t.driver}</td>
                <td className="num">{t.odo}</td>
                <td className="num">{t.service}</td>
                <td className="num"><Tag label={t.status} tagClass={t.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

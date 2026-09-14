import { Blueprint } from '../../components/Blueprint';
import { Tag } from '../../components/Tag';
import { TRAILERS, TRUCKS } from '../../data/mock';

const TRUCK_KPIS = [
  { label: 'Power units', value: String(TRUCKS.length), delta: '4 in service' },
  { label: 'Trailers', value: '8', delta: '3 reefer · 5 dry' },
  { label: 'In shop', value: '1', delta: 'T-118 · turbo' },
  { label: 'Service due', value: '1', delta: 'T-114 in 900 mi' },
];

export function TrucksPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <Blueprint style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', background: 'var(--color-neutral-100)' }}>
        {TRUCK_KPIS.map((k) => (
          <div key={k.label} style={{ padding: '20px 24px', borderRight: '1px solid var(--color-divider)' }}>
            <div className="lbl" style={{ color: 'var(--color-neutral-600)' }}>{k.label}</div>
            <div className="num" style={{ fontSize: 40, lineHeight: 1, marginTop: 12 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-accent-700)', marginTop: 8 }}>{k.delta}</div>
          </div>
        ))}
      </Blueprint>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sect"><h4 style={{ fontSize: 19 }}>Power units</h4></div>
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Unit</th><th>Make / year</th><th>Plate</th><th>Assigned to</th>
                <th style={{ textAlign: 'right' }}>Odometer</th><th style={{ textAlign: 'right' }}>Next service</th><th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {TRUCKS.map((t) => (
                <tr key={t.unit}>
                  <td className="num" style={{ fontSize: 15, fontWeight: 600 }}>{t.unit}</td>
                  <td>{t.make}</td>
                  <td className="num" style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>{t.plate}</td>
                  <td>{t.driver}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{t.odo}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{t.service}</td>
                  <td style={{ textAlign: 'right' }}><Tag label={t.status} tagClass={t.tagClass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sect"><h4 style={{ fontSize: 19 }}>Trailers</h4></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 26 }}>
          {TRAILERS.map((t) => (
            <Blueprint key={t.unit} style={{ padding: 16 }}>
              <div className="num" style={{ fontSize: 22 }}>{t.unit}</div>
              <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 4 }}>{t.kind}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Tag label={t.status} tagClass={t.tagClass} />
                <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{t.where}</div>
              </div>
            </Blueprint>
          ))}
        </div>
      </div>
    </div>
  );
}

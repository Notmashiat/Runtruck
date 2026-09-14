import { Blueprint } from '../../components/Blueprint';
import { Tag } from '../../components/Tag';
import { AR, INVOICES } from '../../data/mock';

export function InvoicesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <Blueprint style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', background: 'var(--color-neutral-100)' }}>
        {AR.map((a) => (
          <div key={a.label} style={{ padding: '20px 24px', borderRight: '1px solid var(--color-divider)' }}>
            <div className="lbl" style={{ color: 'var(--color-neutral-600)' }}>{a.label}</div>
            <div className="num" style={{ fontSize: 38, lineHeight: 1, marginTop: 12 }}>{a.value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginTop: 8 }}>{a.note}</div>
          </div>
        ))}
      </Blueprint>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sect" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h4 style={{ fontSize: 19 }}>Invoices</h4>
          <div style={{ flex: 1 }} />
          <div className="lbl" style={{ color: 'var(--color-accent-700)' }}>Aging report</div>
        </div>
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th><th>Customer</th><th>Load</th><th>Issued</th>
                <th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Age</th><th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((i) => (
                <tr key={i.id}>
                  <td className="num" style={{ fontSize: 14 }}>{i.id}</td>
                  <td>{i.customer}</td>
                  <td className="num" style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>{i.load}</td>
                  <td style={{ color: 'var(--color-neutral-700)' }}>{i.issued}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{i.amount}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{i.age}</td>
                  <td style={{ textAlign: 'right' }}><Tag label={i.status} tagClass={i.tagClass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

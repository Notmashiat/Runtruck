import { Blueprint } from '../../components/Blueprint';
import { Tag } from '../../components/Tag';
import { CUSTOMERS, TOP_ACCOUNTS } from '../../data/mock';

export function CustomersPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 26 }}>
        {TOP_ACCOUNTS.map((a) => (
          <Blueprint key={a.name} style={{ padding: 20 }}>
            <div className="lbl" style={{ color: 'var(--color-accent-700)' }}>{a.tier}</div>
            <div style={{ fontSize: 21, fontFamily: 'var(--font-heading)', fontWeight: 600, marginTop: 8 }}>{a.name}</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 4 }}>{a.contact}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-divider)' }}>
              <div>
                <div className="lbl" style={{ color: 'var(--color-neutral-600)', fontSize: 9 }}>Loads</div>
                <div className="num" style={{ fontSize: 24, marginTop: 4 }}>{a.loads}</div>
              </div>
              <div>
                <div className="lbl" style={{ color: 'var(--color-neutral-600)', fontSize: 9 }}>Revenue</div>
                <div className="num" style={{ fontSize: 24, marginTop: 4 }}>{a.revenue}</div>
              </div>
              <div>
                <div className="lbl" style={{ color: 'var(--color-neutral-600)', fontSize: 9 }}>On time</div>
                <div className="num" style={{ fontSize: 24, marginTop: 4 }}>{a.onTime}</div>
              </div>
            </div>
          </Blueprint>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sect"><h4 style={{ fontSize: 19 }}>All accounts</h4></div>
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th><th>Primary contact</th><th style={{ textAlign: 'right' }}>Loads YTD</th>
                <th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>On time</th>
                <th style={{ textAlign: 'right' }}>Terms</th><th style={{ textAlign: 'right' }}>AR balance</th><th style={{ textAlign: 'right' }}>Standing</th>
              </tr>
            </thead>
            <tbody>
              {CUSTOMERS.map((c) => (
                <tr key={c.name}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: 'var(--color-neutral-700)' }}>{c.contact}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{c.loads}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{c.revenue}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{c.onTime}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{c.terms}</td>
                  <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{c.ar}</td>
                  <td style={{ textAlign: 'right' }}><Tag label={c.tier} tagClass={c.tagClass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

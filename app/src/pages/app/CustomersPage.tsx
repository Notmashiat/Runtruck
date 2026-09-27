import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { CUSTOMERS, TOP_ACCOUNTS } from '../../data/mock';
import { matchesQuery } from '../../lib/search';

const KPIS = [
  { label: 'Accounts', value: String(CUSTOMERS.length), note: '2 key accounts' },
  { label: 'Revenue YTD', value: '$1.3M', note: 'Top 3 accounts = 73%' },
  { label: 'On time', value: '92%', note: 'Weighted by loads' },
  { label: 'Open AR', value: '$91.9K', note: '1 account at risk' },
];

export function CustomersPage() {
  const { query } = useAppShell();
  const rows = CUSTOMERS.filter((c) => matchesQuery(c, query));

  return (
    <>
      <Kpis items={KPIS} />

      <div className="ui-grid-3">
        {TOP_ACCOUNTS.map((a) => (
          <Card key={a.name}>
            <div className="ui-label" style={{ color: 'var(--ui-primary)' }}>{a.tier}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{a.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ui-muted)', marginTop: 2 }}>{a.contact}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--ui-border)' }}>
              {[['Loads', a.loads], ['Revenue', a.revenue], ['On time', a.onTime]].map(([k, v]) => (
                <div key={k}>
                  <div className="ui-label">{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card title="All accounts" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Customer</th><th>Primary contact</th><th className="num">Loads YTD</th><th className="num">Revenue</th>
              <th className="num">On time</th><th className="num">Terms</th><th className="num">AR balance</th><th className="num">Standing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name}>
                <td className="strong">{c.name}</td>
                <td className="muted">{c.contact}</td>
                <td className="num">{c.loads}</td>
                <td className="num">{c.revenue}</td>
                <td className="num">{c.onTime}</td>
                <td className="num">{c.terms}</td>
                <td className="num">{c.ar}</td>
                <td className="num"><Tag label={c.tier} tagClass={c.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
      </Card>
    </>
  );
}

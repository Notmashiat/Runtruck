import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { BILLING, invoiceTotal, statusOf, usd0 } from '../../data/invoicing';
import { compactUsd } from '../../data/metrics';
import { CUSTOMERS } from '../../data/mock';
import { matchesQuery } from '../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../lib/tableTools';

// '$412K' → 412000; '96%' → 96.
const amount = (s: string) => (Number(s.replace(/[^\d.]/g, '')) || 0) * (/K$/i.test(s) ? 1000 : /M$/i.test(s) ? 1_000_000 : 1);
const pct = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;

export function CustomersPage() {
  const { query, invoices } = useAppShell();

  // AR = issued invoices not yet paid, from Accounting.
  const open = invoices.filter((i) => !i.draft && !i.paid);
  const arOf = (name: string) => open.filter((i) => i.customer === name).reduce((s, i) => s + invoiceTotal(i), 0);
  const pastDueOf = (name: string) => open.filter((i) => i.customer === name && statusOf(i) === 'Overdue').length;
  const accounts = CUSTOMERS.map((c) => ({ ...c, ar: usd0(arOf(c.name)), arValue: arOf(c.name), pastDue: pastDueOf(c.name) }));

  const revenue = accounts.reduce((s, c) => s + amount(c.revenue), 0);
  const top3 = [...accounts].sort((a, b) => amount(b.revenue) - amount(a.revenue)).slice(0, 3);
  const loadsYtd = accounts.reduce((s, c) => s + pct(c.loads), 0);
  const onTime = loadsYtd ? accounts.reduce((s, c) => s + pct(c.onTime) * pct(c.loads), 0) / loadsYtd : 0;
  const pastDueAccounts = accounts.filter((c) => c.pastDue > 0);
  const kpis = [
    { label: 'Accounts', value: String(accounts.length), note: `${accounts.filter((c) => c.tier === 'Key account').length} key accounts · ${accounts.filter((c) => c.tier === 'At risk').length} at risk` },
    { label: 'Revenue YTD', value: compactUsd(revenue), note: `Top 3 accounts = ${revenue ? Math.round((top3.reduce((s, c) => s + amount(c.revenue), 0) / revenue) * 100) : 0}%` },
    { label: 'On time', value: `${Math.round(onTime)}%`, note: `Weighted by ${loadsYtd.toLocaleString('en-US')} loads YTD` },
    { label: 'Open AR', value: compactUsd(accounts.reduce((s, c) => s + c.arValue, 0)), note: `${open.length} unpaid invoices · ${pastDueAccounts.length} account(s) past due` },
  ];
  type Account = (typeof accounts)[number];
  const filters: FilterDef<Account>[] = [
    { key: 'tier', label: 'Standing', type: 'select', get: (c) => c.tier },
    { key: 'terms', label: 'Terms', type: 'select', get: (c) => c.terms },
    { key: 'pastDue', label: 'Past due', type: 'toggle', get: (c) => c.pastDue > 0, hint: 'Only accounts with past-due invoices' },
    { key: 'ar', label: 'AR balance', type: 'range', get: (c) => c.arValue, prefix: '$' },
    { key: 'onTime', label: 'On time', type: 'range', get: (c) => pct(c.onTime), suffix: '%' },
  ];
  const sort = useSort(usePageFilters(accounts.filter((c) => matchesQuery(c, query)), filters), { ar: (c) => c.arValue });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <div className="ui-grid-3">
        {top3.map((a, i) => (
          <Card key={a.name}>
            <div className="ui-label" style={{ color: 'var(--ui-primary)' }}>#{i + 1} by revenue · {a.tier}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{a.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ui-muted)', marginTop: 2 }}>{[a.contact, BILLING[a.name]?.email].filter(Boolean).join(' · ')}</div>
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
              <SortTh sort={sort} k="name">Customer</SortTh><SortTh sort={sort} k="contact">Primary contact</SortTh><SortTh sort={sort} k="loads" num>Loads YTD</SortTh><SortTh sort={sort} k="revenue" num>Revenue</SortTh>
              <SortTh sort={sort} k="onTime" num>On time</SortTh><SortTh sort={sort} k="terms" num>Terms</SortTh><SortTh sort={sort} k="ar" num>AR balance</SortTh><SortTh sort={sort} k="tier" num>Standing</SortTh>
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
                <td className="num">{c.ar}{c.pastDue > 0 && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>{c.pastDue} past due</div>}</td>
                <td className="num"><Tag label={c.tier} tagClass={c.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

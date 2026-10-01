import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { PLANS, STATUS_TAG, billingDates, monthlyPrice, todayInZone, type ClientCompany } from '../../../data/companies';
import { fmtDate, usd0 } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { useClients } from './useClients';

const FILTERS: FilterDef<ClientCompany>[] = [
  { key: 'status', label: 'Subscription', type: 'select', get: (c) => c.status, options: ['Active', 'Trial', 'Past due', 'Paused', 'Cancelled'] },
  { key: 'plan', label: 'Plan', type: 'select', get: (c) => c.plan, options: ['Starter', 'Growth', 'Enterprise'] },
  { key: 'cycle', label: 'Billing', type: 'select', get: (c) => c.cycle, options: ['Monthly', 'Annual'] },
  { key: 'started', label: 'Started', type: 'dates', get: (c) => c.started },
];

// Developer › Clients: each company's subscription.
export function ClientsTab() {
  const { query } = useAppShell();
  const companies = useClients();
  const today = todayInZone();
  const count = (s: ClientCompany['status']) => companies.filter((c) => c.status === s).length;
  const renewingSoon = companies.filter((c) => c.status === 'Active' && billingDates(c, today).next <= addDaysIso(today, 7));

  const kpis = [
    { label: 'Active', value: String(count('Active')), note: `${renewingSoon.length} renewing in 7 days` },
    { label: 'In trial', value: String(count('Trial')), note: 'Not paying yet' },
    { label: 'Past due', value: String(count('Past due')), note: 'Payment failed or late' },
    { label: 'Paused or cancelled', value: String(count('Paused') + count('Cancelled')), note: 'Not billed' },
  ];

  const sort = useSort(usePageFilters(companies.filter((c) => matchesQuery(c, query)), FILTERS), {
    price: (c) => monthlyPrice(c), last: (c) => billingDates(c, today).last, next: (c) => billingDates(c, today).next,
  });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Subscriptions" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Company</SortTh><SortTh sort={sort} k="companyId">Company ID</SortTh><SortTh sort={sort} k="plan">Plan</SortTh>
              <SortTh sort={sort} k="cycle">Billing</SortTh><SortTh sort={sort} k="started">Started</SortTh><SortTh sort={sort} k="last">Last payment</SortTh>
              <SortTh sort={sort} k="next">Next renewal</SortTh><SortTh sort={sort} k="trucks" num>Trucks</SortTh><SortTh sort={sort} k="price" num>Price</SortTh>
              <SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const price = monthlyPrice(c);
              const dates = billingDates(c, today);
              const per = PLANS[c.plan].perTruck;
              return (
                <tr key={c.companyId}>
                  <td className="strong">{c.name}</td>
                  <td>{c.companyId}</td>
                  <td>{c.plan}<div className="ui-stop-meta">{PLANS[c.plan].fits}</div></td>
                  <td>{c.cycle}<div className="ui-stop-meta">{c.paymentMethod}</div></td>
                  <td>{fmtDate(c.started)}</td>
                  <td>{c.status === 'Trial' ? '—' : fmtDate(dates.last)}</td>
                  <td>{c.status === 'Cancelled' ? '—' : fmtDate(dates.next)}</td>
                  <td className="num">{c.trucks}</td>
                  <td className="num">
                    {price === null ? 'Custom' : `${usd0(price)} / mo`}
                    {per !== null && <div className="ui-stop-meta">${per} × {c.trucks} trucks</div>}
                  </td>
                  <td className="num"><Tag label={c.status} tagClass={STATUS_TAG[c.status]} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

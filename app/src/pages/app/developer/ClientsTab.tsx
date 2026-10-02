import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import {
  CYCLES, PLANS, STATUS_TAG, STATUSES, addDaysIso, billingDates, monthlyPrice, todayInZone, trialEnded, type ClientCompany,
} from '../../../data/companies';
import { fmtDate, usd0 } from '../../../data/invoicing';
import { useCompanies } from '../../../lib/companyStore';
import { companyReleaseIndex, useReleaseState, versionAt, versions } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { usePaged } from '../../../lib/paging';

const FILTERS: FilterDef<ClientCompany>[] = [
  { key: 'status', label: 'Subscription', type: 'select', get: (c) => c.status, options: STATUSES },
  { key: 'plan', label: 'Plan', type: 'select', get: (c) => c.plan, options: ['Starter', 'Growth', 'Enterprise'] },
  { key: 'cycle', label: 'Billing', type: 'select', get: (c) => c.cycle, options: CYCLES },
  { key: 'started', label: 'Started', type: 'dates', get: (c) => c.started },
];

// Developer › Clients: each company's subscription.
export function ClientsTab() {
  const { query } = useAppShell();
  const companies = useCompanies();
  const releaseState = useReleaseState();
  const versionOf = (c: ClientCompany) => companyReleaseIndex(c, releaseState);
  const allVersions = versions(releaseState);
  // How many versions a company is behind the newest.
  const behind = (c: ClientCompany) => allVersions.length - 1 - allVersions.findIndex((v) => v.id === versionAt(versionOf(c), releaseState).id);
  const today = todayInZone();
  const soon = addDaysIso(today, 7);
  const count = (s: ClientCompany['status']) => companies.filter((c) => c.status === s).length;
  const renewing = companies.filter((c) => c.status === 'Active' && billingDates(c, today).next <= soon).length;
  const trialsOver = companies.filter((c) => trialEnded(c, today)).length;
  const trialsEnding = companies.filter((c) => c.status === 'Trial' && c.trialEnds <= soon).length - trialsOver;

  const kpis = [
    { label: 'Active', value: String(count('Active')), note: `${renewing} billing in 7 days` },
    { label: 'In trial', value: String(count('Trial')), note: `${trialsEnding} ending in 7 days${trialsOver ? ` · ${trialsOver} ended, locked out` : ''}` },
    { label: 'Past due', value: String(count('Past due')), note: 'Payment failed or late' },
    { label: 'Paused or cancelled', value: String(count('Paused') + count('Cancelled')), note: 'Not billed' },
  ];

  const sort = useSort(usePageFilters(companies.filter((c) => matchesQuery(c, query)), FILTERS), {
    version: (c) => versionOf(c), price: (c) => monthlyPrice(c), last: (c) => billingDates(c, today).last, next: (c) => billingDates(c, today).next,
  });
  const rows = sort.rows;
  // Long lists are drawn a page at a time (lib/paging.tsx).
  const paged = usePaged(rows);

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Subscriptions" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Company</SortTh><SortTh sort={sort} k="companyId">Company ID</SortTh><SortTh sort={sort} k="plan">Plan</SortTh>
              <SortTh sort={sort} k="cycle">Billing</SortTh><SortTh sort={sort} k="started">Started</SortTh><SortTh sort={sort} k="last">Last payment</SortTh>
              <SortTh sort={sort} k="next">Next billing</SortTh><SortTh sort={sort} k="version">Version</SortTh><SortTh sort={sort} k="trucks" num>Trucks</SortTh><SortTh sort={sort} k="price" num>Price</SortTh>
              <SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((c) => {
              const price = monthlyPrice(c);
              const dates = billingDates(c, today);
              const per = PLANS[c.plan].perTruck;
              const stopped = c.status === 'Cancelled' || c.status === 'Paused';
              return (
                <tr key={c.companyId}>
                  <td className="strong">{c.name}</td>
                  <td>{c.companyId}</td>
                  <td>{c.plan}<div className="ui-stop-meta">{PLANS[c.plan].fits}</div></td>
                  <td>{c.cycle}<div className="ui-stop-meta">{c.paymentMethod || 'No payment method yet'}</div></td>
                  <td>{fmtDate(c.started)}</td>
                  <td>{dates.last ? fmtDate(dates.last) : '—'}</td>
                  <td>{stopped ? '—' : c.status === 'Trial' ? <>{fmtDate(dates.next)}<div className="ui-stop-meta">{trialEnded(c, today) ? 'Trial ended · cannot sign in' : 'Trial ends'}</div></> : fmtDate(dates.next)}</td>
                  <td>
                    {versionAt(versionOf(c), releaseState).id}
                    <div className="ui-stop-meta">{behind(c) === 0 ? 'Newest' : `${behind(c)} behind`}</div>
                  </td>
                  <td className="num">{c.trucks}</td>
                  <td className="num">
                    {price === null ? 'Custom' : `${usd0(price)} / mo`}
                    <div className="ui-stop-meta">
                      {per !== null ? `$${per} × ${c.trucks} trucks` : 'Enterprise'}
                      {c.cycle === 'Annual' && price !== null ? ` · ${usd0(price * 12)} a year` : ''}
                    </div>
                  </td>
                  <td className="num">{trialEnded(c, today) ? <Tag label="Trial ended" tagClass="tag-outline" /> : <Tag label={c.status} tagClass={STATUS_TAG[c.status]} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && (
          <div className="ui-empty">
            {companies.length === 0 ? 'No client companies yet. + Create company adds the first one.' : 'Nothing matches the search or filters.'}
          </div>
        )}
      </Card>
    </>
  );
}

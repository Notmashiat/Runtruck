import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { STATUS_TAG, monthlyPrice, type ClientCompany } from '../../../data/companies';
import { usd0 } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { useClients } from './useClients';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

const FILTERS: FilterDef<ClientCompany>[] = [
  { key: 'status', label: 'Subscription', type: 'select', get: (c) => c.status, options: ['Active', 'Trial', 'Past due', 'Paused', 'Cancelled'] },
  { key: 'plan', label: 'Plan', type: 'select', get: (c) => c.plan, options: ['Starter', 'Growth', 'Enterprise'] },
  { key: 'state', label: 'State', type: 'select', get: (c) => c.state },
  { key: 'trucks', label: 'Trucks', type: 'range', get: (c) => c.trucks },
];

// Developer › Account manager: every paying company with its Company ID,
// main contact and login accounts.
export function AccountManagerTab() {
  const { query } = useAppShell();
  const companies = useClients();
  const [openId, setOpenId] = useState<string | null>(companies[0]?.companyId ?? null);
  const paying = companies.filter((c) => c.status === 'Active' || c.status === 'Past due');
  const accounts = companies.reduce((n, c) => n + c.accounts.length, 0);
  const mrr = paying.reduce((s, c) => s + (monthlyPrice(c) ?? 0), 0);

  const kpis = [
    { label: 'Paying companies', value: String(paying.length), note: `${companies.length} in the register` },
    { label: 'Login accounts', value: String(accounts), note: `${companies.reduce((n, c) => n + c.accounts.filter((a) => a.role !== 'User').length, 0)} admin` },
    { label: 'Trucks on RunTruck', value: String(companies.reduce((n, c) => n + c.trucks, 0)), note: 'Across all companies' },
    { label: 'Monthly recurring revenue', value: usd0(mrr), note: 'Paying companies' },
  ];

  const sort = useSort(
    usePageFilters(companies.filter((c) => matchesQuery({ ...c, accounts: c.accounts.map((a) => `${a.name} ${a.email}`).join(' ') }, query)), FILTERS),
    { accounts: (c) => c.accounts.length, mrr: (c) => monthlyPrice(c), location: (c) => `${c.state} ${c.city}` },
  );
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Client companies" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="companyId">Company ID</SortTh><SortTh sort={sort} k="name">Company</SortTh><SortTh sort={sort} k="location">Location</SortTh>
              <SortTh sort={sort} k="contact">Main contact</SortTh><SortTh sort={sort} k="accounts" num>Accounts</SortTh><SortTh sort={sort} k="trucks" num>Trucks</SortTh>
              <SortTh sort={sort} k="plan">Plan</SortTh><SortTh sort={sort} k="mrr" num>Monthly</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const open = openId === c.companyId;
              const price = monthlyPrice(c);
              return (
                <Fragment key={c.companyId}>
                  <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setOpenId(open ? null : c.companyId)} aria-expanded={open}>
                    <td className="strong">{c.companyId}</td>
                    <td className="strong">{c.name}</td>
                    <td>{[c.city, c.state].filter(Boolean).join(', ')}</td>
                    <td>{c.contact}</td>
                    <td className="num">{c.accounts.length}</td>
                    <td className="num">{c.trucks}</td>
                    <td>{c.plan}</td>
                    <td className="num">{price === null ? 'Custom' : usd0(price)}</td>
                    <td className="num"><Tag label={c.status} tagClass={STATUS_TAG[c.status]} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-kv-grid dev-facts">
                            {[
                              ['Legal name', c.legal], ['USDOT', c.dot || '—'], ['MC', c.mc || '—'],
                              ['Billing email', c.email], ['Phone', c.phone], ['Team members', String(c.teamMembers)],
                            ].map(([k, v]) => <div key={k}><div className="ui-label">{k}</div><div className="ui-kv-value">{v}</div></div>)}
                          </div>
                          <div className="ui-label" style={{ margin: '16px 0 8px' }}>Login accounts</div>
                          <table className="ui-table ui-table-inner">
                            <thead>
                              <tr><th>Member ID</th><th>Name</th><th>Email</th><th>Role</th><th className="num">Last sign-in</th></tr>
                            </thead>
                            <tbody>
                              {c.accounts.map((a) => (
                                <tr key={a.memberId}>
                                  <td className="strong">{a.memberId}</td>
                                  <td>{a.name}</td>
                                  <td className="muted">{a.email}</td>
                                  <td><Tag label={a.role} tagClass={a.role === 'Super admin' ? 'tag-accent' : 'tag-neutral'} /></td>
                                  <td className="num">{when(a.lastSignIn)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}

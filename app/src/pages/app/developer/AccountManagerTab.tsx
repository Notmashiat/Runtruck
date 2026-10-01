import { Fragment, useState, type ReactNode } from 'react';
import { AccountDialog } from '../../../components/AccountDialog';
import { Card } from '../../../components/Card';
import { CompanyDialog } from '../../../components/CompanyDialog';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { BUSINESS_TYPES, STATUS_TAG, STATUSES, isPaying, monthlyPrice, type ClientCompany } from '../../../data/companies';
import { fmtDate, usd0 } from '../../../data/invoicing';
import { useAccounts } from '../../../lib/accountStore';
import { useCompanies } from '../../../lib/companyStore';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

const FILTERS: FilterDef<ClientCompany>[] = [
  { key: 'status', label: 'Subscription', type: 'select', get: (c) => c.status, options: STATUSES },
  { key: 'plan', label: 'Plan', type: 'select', get: (c) => c.plan, options: ['Starter', 'Growth', 'Enterprise'] },
  { key: 'type', label: 'Business type', type: 'select', get: (c) => c.businessType, options: BUSINESS_TYPES },
  { key: 'state', label: 'State', type: 'select', get: (c) => c.state },
  { key: 'trucks', label: 'Trucks', type: 'range', get: (c) => c.trucks },
  { key: 'created', label: 'Created', type: 'dates', get: (c) => c.created.slice(0, 10) },
];

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

// Developer › Account manager: every client company with its Company ID,
// details, contacts and the login accounts assigned to it.
export function AccountManagerTab() {
  const { query } = useAppShell();
  const companies = useCompanies();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientCompany | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const allAccounts = useAccounts();
  const accountsOf = (id: string) => allAccounts.filter((a) => a.companyId === id);
  const paying = companies.filter(isPaying);
  const accounts = companies.reduce((n, c) => n + accountsOf(c.companyId).length, 0);
  const mrr = paying.reduce((s, c) => s + (monthlyPrice(c) ?? 0), 0);

  const kpis = [
    { label: 'Client companies', value: String(companies.length), note: `${paying.length} paying · ${companies.filter((c) => c.status === 'Trial').length} in trial` },
    { label: 'Login accounts', value: String(accounts), note: 'Assigned to companies' },
    { label: 'Trucks on RunTruck', value: String(companies.reduce((n, c) => n + c.trucks, 0)), note: 'Across all companies' },
    { label: 'Monthly recurring revenue', value: usd0(mrr), note: 'Paying companies' },
  ];

  const sort = useSort(
    usePageFilters(companies.filter((c) => matchesQuery({ ...c, accounts: accountsOf(c.companyId).map((a) => `${a.name} ${a.email} ${a.accountId}`).join(' ') }, query)), FILTERS),
    { accounts: (c) => accountsOf(c.companyId).length, mrr: (c) => monthlyPrice(c), location: (c) => `${c.state} ${c.city}` },
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
                    <td className="strong">{c.name}<div className="ui-stop-meta">{c.businessType}</div></td>
                    <td>{[c.city, c.state].filter(Boolean).join(', ')}</td>
                    <td>{c.contact}</td>
                    <td className="num">{accountsOf(c.companyId).length}</td>
                    <td className="num">{c.trucks}</td>
                    <td>{c.plan}</td>
                    <td className="num">{price === null ? 'Custom' : usd0(price)}</td>
                    <td className="num"><Tag label={c.status} tagClass={STATUS_TAG[c.status]} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>Created {when(c.created)}</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(c)}>Edit company</button>
                          </div>
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Legal name">{c.legal}</Fact>
                            <Fact k="USDOT">{c.dot}</Fact>
                            <Fact k="MC">{c.mc}</Fact>
                            <Fact k="EIN">{c.ein}</Fact>
                            <Fact k="SCAC">{c.scac}</Fact>
                            <Fact k="Website">{c.website}</Fact>
                            <Fact k="Address">{`${c.street}, ${c.city}, ${c.state} ${c.zip}`}</Fact>
                            <Fact k="Time zone">{c.timeZone}</Fact>
                            <Fact k="Main phone">{c.phone}</Fact>
                            <Fact k="Main contact">{[c.contact, c.contactTitle].filter(Boolean).join(', ')}<div className="ui-stop-meta">{c.contactEmail} · {c.contactPhone}</div></Fact>
                            <Fact k="Billing">{c.billingName || c.contact}<div className="ui-stop-meta">{c.billingEmail}</div></Fact>
                            <Fact k="Fleet">{`${c.trucks} trucks · ${c.trailers} trailers · ${c.drivers} drivers`}<div className="ui-stop-meta">{c.equipment.join(', ')}</div></Fact>
                            <Fact k="Subscription">{`${c.plan}, ${c.cycle.toLowerCase()}`}<div className="ui-stop-meta">{c.status === 'Trial' ? `Trial ends ${fmtDate(c.trialEnds)}` : `Since ${fmtDate(c.started)}`}{c.paymentMethod ? ` · ${c.paymentMethod}` : ''}</div></Fact>
                            {c.notes && <Fact k="Notes">{c.notes}</Fact>}
                          </div>
                          <div className="ui-batch-head" style={{ paddingTop: 16 }}>
                            <div className="ui-label">Login accounts</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAddingTo(c.companyId)}>+ Create account for {c.name}</button>
                          </div>
                          {accountsOf(c.companyId).length === 0 ? (
                            <div className="ui-stop-meta">None yet. Accounts created for Company ID {c.companyId} see this company’s data and nothing else.</div>
                          ) : (
                            <table className="ui-table ui-table-inner">
                              <thead>
                                <tr><th>Account ID</th><th>Name</th><th>Login email</th><th>Type</th><th>Status</th><th className="num">Last sign-in</th></tr>
                              </thead>
                              <tbody>
                                {accountsOf(c.companyId).map((a) => (
                                  <tr key={a.accountId}>
                                    <td className="strong">{a.accountId}</td>
                                    <td>{a.name}</td>
                                    <td className="muted">{a.email}</td>
                                    <td><Tag label={a.type} tagClass={a.type === 'Company admin' ? 'tag-green' : 'tag-neutral'} /></td>
                                    <td><Tag label={a.status} tagClass={a.status === 'Active' ? 'tag-green' : 'tag-neutral'} /></td>
                                    <td className="num">{when(a.lastSignIn)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="ui-empty">
            {companies.length === 0 ? 'No client companies yet. + Create company adds the first one.' : 'Nothing matches the search or filters.'}
          </div>
        )}
      </Card>
      {editing && <CompanyDialog company={editing} onClose={() => setEditing(null)} />}
      {addingTo && <AccountDialog companyId={addingTo} onClose={() => setAddingTo(null)} />}
    </>
  );
}

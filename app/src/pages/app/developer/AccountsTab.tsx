import { Fragment, useState, type ReactNode } from 'react';
import { AccountDialog } from '../../../components/AccountDialog';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { PERM_TREE, TYPE_NAMES, describePerms, permits, type Account, type AccountType } from '../../../data/accounts';
import { DEFAULT_SETTINGS, type Settings } from '../../../data/settings';
import { MEMBER_ID, OWNER_COMPANY_ID, OWNER_MEMBER_ID, readRegistry } from '../../../lib/account';
import { useAccounts } from '../../../lib/accountStore';
import { currentSession, ownerEmail } from '../../../lib/auth';
import { companyName } from '../../../lib/companyStore';
import { deactivateAccount } from '../../../lib/deactivate';
import { USER } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';
import { getSettings } from '../../../lib/settingsStore';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

// One row of the list: a registered account, or the owner account.
interface Row {
  accountId: string;
  name: string;
  title: string;
  email: string;
  type: AccountType;
  companyId: string;
  company: string;
  access: string;
  status: string;
  lastSignIn?: string;
  owner: boolean;
  account?: Account;
}

// The owner's name from their Profile (kept with RunTruck's settings).
function ownerName(): string {
  if (MEMBER_ID === OWNER_MEMBER_ID) return getSettings().profile.name;
  const own = readRegistry<Partial<Settings>>(`member-${OWNER_MEMBER_ID}-settings`) ?? readRegistry<Partial<Settings>>('settings');
  return own?.profile?.name || DEFAULT_SETTINGS.profile.name;
}

const TYPE_TAG = (type: AccountType) => (type === 'Super admin' ? 'tag-accent' : type === 'Company admin' ? 'tag-green' : 'tag-neutral');

const FILTERS: FilterDef<Row>[] = [
  { key: 'type', label: 'Account type', type: 'select', get: (r) => r.type, options: TYPE_NAMES },
  { key: 'company', label: 'Company', type: 'select', get: (r) => r.company },
];

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

// Developer › Accounts: every RunTruck login, its company and what it may
// open. Super admins can see and change any of them at any time.
export function AccountsTab() {
  const { query } = useAppShell();
  const accounts = useAccounts();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const session = currentSession();

  const all: Row[] = [
    {
      accountId: OWNER_MEMBER_ID, name: ownerName(), title: 'Owner', email: ownerEmail(), type: 'Super admin', companyId: OWNER_COMPANY_ID,
      company: `${OWNER_COMPANY_ID} · ${companyName(OWNER_COMPANY_ID)}`, access: 'Everything, plus Developer', status: 'Active',
      lastSignIn: session?.memberId === OWNER_MEMBER_ID ? session.started : undefined, owner: true,
    },
    ...accounts.filter((a) => a.status === 'Active').map((a) => ({
      accountId: a.accountId, name: a.name, title: a.title, email: a.email, type: a.type, companyId: a.companyId,
      company: `${a.companyId} · ${companyName(a.companyId)}`,
      access: a.type === 'Super admin' ? 'Everything, plus Developer' : describePerms(a.perms),
      status: a.status, lastSignIn: a.lastSignIn, owner: false, account: a,
    })),
  ];

  const kpis = [
    { label: 'Active accounts', value: String(all.length), note: 'Can log in' },
    { label: 'Super admins', value: String(all.filter((r) => r.type === 'Super admin').length), note: 'Company ID 1 · RunTruck' },
    { label: 'Client accounts', value: String(all.filter((r) => r.companyId !== OWNER_COMPANY_ID).length), note: `${new Set(all.filter((r) => r.companyId !== OWNER_COMPANY_ID).map((r) => r.companyId)).size} companies` },
    { label: 'Deactivated', value: String(accounts.filter((a) => a.status === 'Deactivated').length), note: 'In the Deactivated tab' },
  ];

  const sort = useSort(usePageFilters(all.filter((r) => matchesQuery({ ...r, account: undefined }, query)), FILTERS), {});
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Login accounts" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="accountId">Account ID</SortTh><SortTh sort={sort} k="name">Name</SortTh><SortTh sort={sort} k="email">Login email</SortTh>
              <SortTh sort={sort} k="type">Type</SortTh><SortTh sort={sort} k="company">Company</SortTh>
              <SortTh sort={sort} k="lastSignIn">Last sign-in</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = openId === r.accountId;
              const perms = r.account?.perms ?? [];
              const full = r.type === 'Super admin';
              return (
                <Fragment key={r.accountId}>
                  <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setOpenId(open ? null : r.accountId)} aria-expanded={open}>
                    <td className="strong">{r.accountId}</td>
                    <td className="strong">{r.name}<div className="ui-stop-meta">{r.title}</div></td>
                    <td className="muted">{r.email}</td>
                    <td><Tag label={r.owner ? 'Super admin · owner' : r.type} tagClass={TYPE_TAG(r.type)} /></td>
                    <td>{r.company}</td>
                    <td>{when(r.lastSignIn)}</td>
                    <td className="num"><Tag label={r.status} tagClass={r.status === 'Active' ? 'tag-green' : 'tag-neutral'} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>
                              {r.owner ? 'RunTruck’s owner account. Its email and password change in its own Settings › Security.' : `Created ${when(r.account?.created)}`}
                            </div>
                            <div style={{ flex: 1 }} />
                            {r.account && r.accountId !== session?.memberId && (
                              <button
                                type="button" className="ui-btn ui-btn-sm ui-btn-danger"
                                onClick={() => { if (r.account && window.confirm(`Deactivate ${r.name} (${r.accountId})? They can no longer log in and get no updates until reactivated in Developer › Deactivated.`)) deactivateAccount(r.account, USER.name); }}
                              >
                                Deactivate
                              </button>
                            )}
                            {r.account && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(r.account ?? null)}>Edit account</button>}
                          </div>
                          <div className="ui-kv-grid dev-facts">
                            <Fact k="Company">{r.company}</Fact>
                            <Fact k="Phone">{r.account?.phone}</Fact>
                            <Fact k="Password">{r.account ? `Set ${when(r.account.password.changed)} by ${r.account.password.by === 'self' ? 'them' : 'a super admin'}` : 'Set by the owner'}</Fact>
                            {r.account?.notes && <Fact k="Notes">{r.account.notes}</Fact>}
                          </div>
                          <div className="ui-label" style={{ margin: '16px 0 8px' }}>Access</div>
                          <div className="acc-perms">
                            <span className="acc-perm is-on">Dashboard</span>
                            {PERM_TREE.map((n) => {
                              const on = full || permits(perms, n.key);
                              return (
                                <span key={n.key} className={`acc-perm${on ? ' is-on' : ''}`} title={on ? 'Allowed' : 'Not allowed'}>
                                  {n.label}
                                  {on && n.children.length > 0 && (
                                    <small>{n.children.filter((c) => full || perms.includes(c.key)).map((c) => c.label).join(', ')}</small>
                                  )}
                                </span>
                              );
                            })}
                            <span className={`acc-perm${full ? ' is-on' : ''}`}>Developer</span>
                          </div>
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
      {editing && <AccountDialog account={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

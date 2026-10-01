import { useState } from 'react';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import type { Account } from '../../../data/accounts';
import { STATUS_TAG } from '../../../data/companies';
import { OWNER_COMPANY_ID, OWNER_COMPANY_NAME } from '../../../lib/account';
import { useAccounts } from '../../../lib/accountStore';
import { companyById, useCompanies } from '../../../lib/companyStore';
import { canReactivate, companyVersionId, reactivateAccount, reactivateCompany } from '../../../lib/deactivate';
import { matchesQuery } from '../../../lib/search';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

interface GroupRow {
  companyId: string;
  name: string;
  status?: string;
  deactivated?: { at: string; by: string; version?: string };
  accounts: Account[];
}

// Developer › Deactivated: every deactivated account, under the company it
// belongs to. A deactivated company is greyed out and has to be reactivated
// before its accounts can be.
export function DeactivatedTab() {
  const { query } = useAppShell();
  const companies = useCompanies();
  const accounts = useAccounts();
  const [open, setOpen] = useState<string[]>([]);
  const off = accounts.filter((a) => a.status === 'Deactivated');

  const ids = [...new Set([...off.map((a) => a.companyId), ...companies.filter((c) => c.deactivated).map((c) => c.companyId)])];
  const groups: GroupRow[] = ids
    .map((id) => {
      const c = companyById(id);
      return {
        companyId: id,
        name: id === OWNER_COMPANY_ID ? OWNER_COMPANY_NAME : c?.name ?? `Company ${id}`,
        status: c?.status,
        deactivated: c?.deactivated,
        accounts: off.filter((a) => a.companyId === id),
      };
    })
    .filter((g) => matchesQuery({ name: g.name, id: g.companyId, people: g.accounts.map((a) => `${a.name} ${a.email} ${a.accountId}`).join(' ') }, query))
    .sort((a, b) => Number(Boolean(b.deactivated)) - Number(Boolean(a.deactivated)) || a.name.localeCompare(b.name));

  const kpis = [
    { label: 'Deactivated accounts', value: String(off.length), note: 'Cannot log in or get updates' },
    { label: 'Companies with deactivated accounts', value: String(new Set(off.map((a) => a.companyId)).size), note: 'Under each company below' },
    { label: 'Deactivated companies', value: String(companies.filter((c) => c.deactivated).length), note: 'Greyed out below' },
  ];
  const toggle = (id: string) => setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id]);

  const reactivate = (a: Account) => {
    if (window.confirm(`Reactivate ${a.name} (${a.accountId})? They can log in again and run ${companyVersionId(a.companyId)}, the company's current version${a.deactivatedVersion ? ` (they were on ${a.deactivatedVersion})` : ''}.`)) reactivateAccount(a);
  };

  return (
    <>
      <Kpis items={kpis} />
      <Card title="Deactivated" flush>
        {groups.length === 0 ? (
          <div className="ui-empty">No deactivated accounts or companies. Deactivate an account from its Edit account form, or a company from Account manager.</div>
        ) : (
          <div className="deact-list">
            {groups.map((g) => {
              const isOpen = open.includes(g.companyId);
              const c = companyById(g.companyId);
              return (
                <div key={g.companyId} className={`deact-group${g.deactivated ? ' is-off' : ''}`}>
                  <button type="button" className="deact-head" onClick={() => toggle(g.companyId)} aria-expanded={isOpen}>
                    <span className="ui-caret">{isOpen ? '▾' : '▸'}</span>
                    <span className="deact-name">
                      <strong>{g.name}</strong>
                      <span className="ui-stop-meta" style={{ marginTop: 0 }}>Company ID {g.companyId}</span>
                    </span>
                    <span style={{ flex: 1 }} />
                    {g.deactivated ? <Tag label="Company deactivated" tagClass="tag-outline" /> : g.status && <Tag label={g.status} tagClass={STATUS_TAG[g.status as keyof typeof STATUS_TAG] ?? 'tag-neutral'} />}
                    <span className="deact-count">{g.accounts.length} deactivated account{g.accounts.length === 1 ? '' : 's'}</span>
                  </button>
                  {isOpen && (
                    <div className="deact-body">
                      {g.deactivated && (
                        <div className="deact-note">
                          <span>Deactivated {when(g.deactivated.at)} by {g.deactivated.by}{g.deactivated.version ? ` · kept on version ${g.deactivated.version}` : ''}. Reactivate the company before any of its accounts.</span>
                          {c && (
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => { if (window.confirm(`Reactivate ${c.name} (${c.companyId})? Its accounts stay deactivated until you reactivate each one.`)) reactivateCompany(c); }}>
                              Reactivate company
                            </button>
                          )}
                        </div>
                      )}
                      {g.accounts.length === 0 ? (
                        <div className="ui-stop-meta">No deactivated accounts.</div>
                      ) : (
                        <table className="ui-table ui-table-inner">
                          <thead>
                            <tr><th>Account ID</th><th>Name</th><th>Login email</th><th>Type</th><th>Deactivated</th><th>Version kept</th><th className="num" aria-label="Actions" /></tr>
                          </thead>
                          <tbody>
                            {g.accounts.map((a) => (
                              <tr key={a.accountId}>
                                <td className="strong">{a.accountId}</td>
                                <td>{a.name}</td>
                                <td className="muted">{a.email}</td>
                                <td>{a.type}</td>
                                <td>
                                  {when(a.deactivatedAt)}
                                  <div className="ui-stop-meta">{a.deactivatedWith === 'company' ? 'With the company' : 'On its own'}{a.deactivatedBy ? ` · by ${a.deactivatedBy}` : ''}</div>
                                </td>
                                <td>{a.deactivatedVersion ?? '—'}</td>
                                <td className="num">
                                  <button
                                    type="button" className="ui-btn ui-btn-sm" disabled={!canReactivate(a)} onClick={() => reactivate(a)}
                                    title={canReactivate(a) ? undefined : 'Reactivate the company first'}
                                  >
                                    Reactivate
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

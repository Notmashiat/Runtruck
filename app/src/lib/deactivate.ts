import type { Account } from '../data/accounts';
import type { ClientCompany } from '../data/companies';
import { RELEASES } from '../data/releases';
import { OWNER_COMPANY_ID } from './account';
import { accountsIn, getAccounts, saveAccount } from './accountStore';
import { companyById, saveCompany } from './companyStore';
import { companyReleaseIndex, versionAt } from './releases';

// Deactivating and reactivating accounts and companies (Developer).
//
// A deactivated account cannot log in and gets no updates: it keeps the
// version its company ran when it was deactivated. Deactivating a company
// deactivates all its accounts too; the company has to be reactivated before
// any of them can be. A reactivated account joins its company's current
// version.

// The version a company runs now (RunTruck's own always runs the newest).
export function companyVersionId(companyId: string): string {
  if (companyId === OWNER_COMPANY_ID) return versionAt(RELEASES.length - 1).id;
  const c = companyById(companyId);
  return versionAt(c ? companyReleaseIndex(c) : 0).id;
}

function stamp(a: Account, byName: string, cause: 'account' | 'company'): Account {
  return {
    ...a,
    status: 'Deactivated',
    deactivatedAt: new Date().toISOString(),
    deactivatedBy: byName,
    deactivatedWith: cause,
    deactivatedVersion: companyVersionId(a.companyId),
    updated: new Date().toISOString(),
  };
}

export function deactivateAccount(a: Account, byName: string) {
  if (a.status === 'Deactivated') return;
  saveAccount(stamp(a, byName, 'account'));
}

// Only once its company is active again.
export function canReactivate(a: Account): boolean {
  return a.companyId === OWNER_COMPANY_ID || !companyById(a.companyId)?.deactivated;
}

export function reactivateAccount(a: Account) {
  if (a.status === 'Active' || !canReactivate(a)) return;
  saveAccount({
    ...a, status: 'Active', deactivatedAt: undefined, deactivatedBy: undefined, deactivatedWith: undefined,
    deactivatedVersion: undefined, updated: new Date().toISOString(),
  });
}

// The company and every account in it.
export function deactivateCompany(c: ClientCompany, byName: string) {
  if (c.deactivated) return;
  for (const a of accountsIn(c.companyId)) if (a.status === 'Active') saveAccount(stamp(a, byName, 'company'));
  saveCompany({ ...c, deactivated: { at: new Date().toISOString(), by: byName, version: companyVersionId(c.companyId) } });
}

// The company only: its accounts stay deactivated until each is reactivated.
export function reactivateCompany(c: ClientCompany) {
  if (!c.deactivated) return;
  saveCompany({ ...c, deactivated: undefined });
}

export const deactivatedAccounts = () => getAccounts().filter((a) => a.status === 'Deactivated');

// The one RunTruck account so far, and the company everything belongs to.
// Every record and setting is stored under this company ID
// ('runtruck-30017-loads', …), so the data is tied to the account's company.
// No imports: other modules read this before anything else loads.

export const COMPANY_ID = '30017';
export const MEMBER_ID = '100482731';

// RunTruck roles. A super admin runs RunTruck itself: they see Developer
// (every client company, its accounts and subscription) and create companies
// and accounts. This account is RunTruck's super admin.
export type AccountRole = 'Super admin' | 'Company admin' | 'User';
const ROLES: Record<string, AccountRole> = { [MEMBER_ID]: 'Super admin' };

export function roleOf(memberId: string | undefined): AccountRole {
  return (memberId && ROLES[memberId]) || 'User';
}

// 'runtruck-loads' → 'runtruck-30017-loads'. Keys that are not per company
// (the theme, the login session) are left alone.
const GLOBAL = new Set(['runtruck-theme', 'runtruck-session']);

export function scopedKey(key: string): string {
  if (GLOBAL.has(key) || !key.startsWith('runtruck-') || key.startsWith(`runtruck-${COMPANY_ID}-`)) return key;
  return key.replace(/^runtruck-/, `runtruck-${COMPANY_ID}-`);
}

// Read a company key, moving anything saved before keys were per company.
export function readScoped(key: string): string | null {
  const scoped = scopedKey(key);
  try {
    const value = localStorage.getItem(scoped);
    if (value !== null || scoped === key) return value;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(scoped, legacy);
      localStorage.removeItem(key);
    }
    return legacy;
  } catch {
    return null;
  }
}

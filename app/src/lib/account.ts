// The one RunTruck account so far: RunTruck's owner (super admin), Company
// ID 1. It is not a client company. Every record and setting is stored under
// this company ID ('runtruck-1-loads', …).
// No imports: other modules read this before anything else loads.

export const COMPANY_ID = '1';
export const MEMBER_ID = '100482731';

// RunTruck roles. A super admin runs RunTruck itself: they see Developer
// (every client company, its accounts and subscription) and create companies
// and accounts. This account is RunTruck's super admin.
export type AccountRole = 'Super admin' | 'Company admin' | 'User';
const ROLES: Record<string, AccountRole> = { [MEMBER_ID]: 'Super admin' };

export function roleOf(memberId: string | undefined): AccountRole {
  return (memberId && ROLES[memberId]) || 'User';
}

// 'runtruck-loads' → 'runtruck-1-loads'. Keys that are not per company
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

// Company IDs this account had before; what was saved under them moves to
// the current ID.
const FORMER_IDS = ['30017'];

// 'runtruck-30017-loads' → 'runtruck-1-loads'. Other keys are left alone.
export function currentKey(key: string): string {
  for (const id of FORMER_IDS) {
    const prefix = `runtruck-${id}-`;
    if (key.startsWith(prefix)) return `runtruck-${COMPANY_ID}-${key.slice(prefix.length)}`;
  }
  return key;
}

// Runs once, as the app loads: records, settings, the changed password and
// the open session all carry over to the new company ID.
function moveFormerKeys() {
  try {
    for (const k of Object.keys(localStorage)) {
      const to = currentKey(k);
      if (to === k) continue;
      const value = localStorage.getItem(k);
      if (value !== null && localStorage.getItem(to) === null) localStorage.setItem(to, value);
      localStorage.removeItem(k);
    }
    for (const store of [sessionStorage, localStorage]) {
      const raw = store.getItem('runtruck-session');
      const s = raw ? (JSON.parse(raw) as { companyId?: string } | null) : null;
      if (s && s.companyId && FORMER_IDS.includes(s.companyId)) store.setItem('runtruck-session', JSON.stringify({ ...s, companyId: COMPANY_ID }));
    }
  } catch {
    // Storage blocked or damaged: nothing to move.
  }
}
moveFormerKeys();

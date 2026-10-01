import { ALL_PERMS, permits, type AccountType } from '../data/accounts';
import { DEFAULT_SETTINGS } from '../data/settings';
import {
  COMPANY_ID, MEMBER_ID, OWNER_COMPANY_ID, OWNER_MEMBER_ID, registryKey, storedSession,
} from './account';
import { accountByEmail, accountById, saveAccount } from './accountStore';
import { companyById } from './companyStore';
import { MIN_PASSWORD, makePasswordRecord, passwordFits, passwordProblems as problemsFor, type PasswordRecord } from './password';
import { getSettings } from './settingsStore';

// Logging in. There are two kinds of account:
// - RunTruck's owner (Account ID 100482731, Company ID 1). Until the password
//   is changed in Settings › Security it is the starting password below.
// - Accounts made in Developer › Create account (lib/accountStore.ts), each
//   with its own login email, password, Company ID and permissions.
// A session opens exactly one company's data (lib/account.ts). There is no
// server yet, so all of this lives in this browser: it is a gate in the
// browser, not server-side security.

export { MIN_PASSWORD };

// The owner's starting password fingerprint (the password itself is not in the code).
const STARTING: PasswordRecord = {
  salt: '10bd890a82a7af9eafb061e54ffa5ecb',
  hash: 'd330e5c7bf6ce5ba8851c4baf52495e9e2f5c0c0d4b5538d3d0d549707af9379',
  iterations: 210_000,
};

const OWNER_AUTH_KEY = registryKey('auth');
const OWNER_EMAIL_KEY = registryKey('login-email');
const SESSION_KEY = 'runtruck-session';
const FAILS_KEY = 'runtruck-login-fails';
const REMEMBER_DAYS = 30;
const SESSION_HOURS = 12;
const MAX_TRIES = 5;
const LOCK_SECONDS = 60;

export interface Session {
  companyId: string;
  memberId: string;
  email: string;
  started: string;
  expires: string;
  remember: boolean;
}

// — the owner account —

function ownerPassword(): PasswordRecord {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNER_AUTH_KEY) ?? 'null') as PasswordRecord | null;
    if (saved && saved.salt && saved.hash && saved.iterations) return saved;
  } catch {
    // Fall back to the starting password.
  }
  return STARTING;
}

interface LoginEmailRecord {
  email: string;
  changed: string;
}

function ownerEmailRecord(): LoginEmailRecord | null {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNER_EMAIL_KEY) ?? 'null') as LoginEmailRecord | null;
    if (saved && typeof saved.email === 'string' && saved.email.includes('@')) return saved;
  } catch {
    // Fall back to the original email.
  }
  return null;
}

// The owner's login email: changed only in Settings › Security; until then
// the account's original email.
export function ownerEmail(): string {
  return ownerEmailRecord()?.email ?? DEFAULT_SETTINGS.profile.email;
}

// Until a login email is set, the owner's Profile email also works (it used
// to be the login email).
function ownerEmailMatches(typed: string): boolean {
  const t = typed.trim().toLowerCase();
  const accepted = ownerEmailRecord() ? [ownerEmail()] : [ownerEmail(), MEMBER_ID === OWNER_MEMBER_ID ? getSettings().profile.email : ''];
  return accepted.some((e) => e && e.trim().toLowerCase() === t);
}

// — the signed-in account —

export interface Me {
  accountId: string;
  companyId: string;
  type: AccountType;
  email: string;
  perms: string[];
  owner: boolean;
}

function meFor(memberId: string, companyId: string): Me | null {
  if (memberId === OWNER_MEMBER_ID) {
    return companyId === OWNER_COMPANY_ID
      ? { accountId: OWNER_MEMBER_ID, companyId, type: 'Super admin', email: ownerEmail(), perms: ALL_PERMS, owner: true }
      : null;
  }
  const a = accountById(memberId);
  if (!a || a.status !== 'Active' || a.companyId !== companyId) return null;
  return { accountId: a.accountId, companyId: a.companyId, type: a.type, email: a.email, perms: a.type === 'Super admin' ? ALL_PERMS : a.perms, owner: false };
}

// The account this page was opened for (null when signed out).
export function me(): Me | null {
  return currentSession() ? meFor(MEMBER_ID, COMPANY_ID) : null;
}

// A super admin: RunTruck staff under Company ID 1. Only they see Developer.
export function isSuperAdmin(): boolean {
  const m = me();
  return Boolean(m && m.type === 'Super admin' && m.companyId === OWNER_COMPANY_ID);
}

// Whether the signed-in account may open a section or tab ('loads',
// 'fleet/trucks', 'settings/company'). Everyone has the Dashboard, Settings
// (their own Profile, Security and Appearance); Developer is super admins only.
export function can(key: string): boolean {
  const m = me();
  if (!m) return false;
  if (key === 'developer' || key.startsWith('developer/')) return isSuperAdmin();
  if (m.type === 'Super admin') return true;
  if (key === 'settings') return true;
  return permits(m.perms, key);
}

// '/app/accounting/past-due' → can('accounting/past-due').
export function canPath(path: string): boolean {
  const [, , section = 'dashboard', tab] = path.toLowerCase().split('/');
  if (section === 'loads') return can('loads');
  return can(tab ? `${section}/${tab}` : section);
}

// — too many tries —

function fails(): { count: number; until: number } {
  try {
    return JSON.parse(sessionStorage.getItem(FAILS_KEY) ?? 'null') ?? { count: 0, until: 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

// Seconds left before another try is allowed (0 = go ahead).
export function lockedFor(): number {
  return Math.max(0, Math.ceil((fails().until - Date.now()) / 1000));
}

function noteFail() {
  const f = fails();
  const count = f.count + 1;
  const next = count >= MAX_TRIES ? { count: 0, until: Date.now() + LOCK_SECONDS * 1000 } : { count, until: 0 };
  try {
    sessionStorage.setItem(FAILS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: no lockout.
  }
}

// — logging in and out —

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'locked' | 'email' | 'password' | 'disabled' | 'company'; seconds?: number; company?: string };

function openSession(companyId: string, memberId: string, email: string, remember: boolean) {
  const now = Date.now();
  const session: Session = {
    companyId,
    memberId,
    email,
    started: new Date(now).toISOString(),
    expires: new Date(now + (remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000)).toISOString(),
    remember,
  };
  logOut();
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the person has to log in again after reloading.
  }
}

// Check the email and password and open a session. The caller then reloads
// the app, so it opens with that account's company and nothing else.
export async function logIn(email: string, password: string, remember: boolean): Promise<LoginResult> {
  if (lockedFor() > 0) return { ok: false, reason: 'locked', seconds: lockedFor() };
  // Spaces copied around a password are not part of it.
  const typed = password.trim();
  const fail = (reason: 'email' | 'password'): LoginResult => {
    noteFail();
    return lockedFor() > 0 ? { ok: false, reason: 'locked', seconds: lockedFor() } : { ok: false, reason };
  };

  if (ownerEmailMatches(email)) {
    if (!(await passwordFits(typed, ownerPassword()))) return fail('password');
    openSession(OWNER_COMPANY_ID, OWNER_MEMBER_ID, ownerEmail(), remember);
  } else {
    const a = accountByEmail(email);
    if (!a) return fail('email');
    if (!(await passwordFits(typed, a.password))) return fail('password');
    if (a.status !== 'Active') return { ok: false, reason: 'disabled' };
    if (a.companyId !== OWNER_COMPANY_ID) {
      const c = companyById(a.companyId);
      if (!c || c.status === 'Paused' || c.status === 'Cancelled') return { ok: false, reason: 'company', company: c ? `${c.name} (${c.status.toLowerCase()})` : 'This company' };
    }
    saveAccount({ ...a, lastSignIn: new Date().toISOString() });
    openSession(a.companyId, a.accountId, a.email, remember);
  }
  try {
    sessionStorage.removeItem(FAILS_KEY);
  } catch {
    // Nothing to clear.
  }
  return { ok: true };
}

// The session this page runs on: it must still be valid, for an account that
// is active, and for the company this page opened. A session for a different
// account (from another tab) does not count: see sessionChanged().
export function currentSession(): Session | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const s = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Session | null;
      if (s && s.companyId === COMPANY_ID && s.memberId === MEMBER_ID && Date.parse(s.expires) > Date.now() && meFor(s.memberId, s.companyId)) return s;
    } catch {
      // Ignore a damaged session.
    }
  }
  return null;
}

// Someone logged in as a different account in another tab: this page holds
// the other company's data, so it must reload before showing anything.
export function sessionChanged(): boolean {
  const s = storedSession();
  return Boolean(s && (s.companyId !== COMPANY_ID || s.memberId !== MEMBER_ID));
}

export function logOut() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.removeItem(SESSION_KEY);
    } catch {
      // Nothing to remove.
    }
  }
}

// Log out and reload on the login page, so no company data stays in memory.
export function logOutAndLeave() {
  logOut();
  window.location.replace('/login');
}

// — the signed-in account's own login —

export function accountEmail(): string {
  return me()?.email ?? ownerEmail();
}

export function passwordChangedOn(): string | undefined {
  const m = me();
  if (!m) return undefined;
  return m.owner ? ownerPassword().changed : accountById(m.accountId)?.password.changed;
}

export function loginEmailChangedOn(): string | undefined {
  const m = me();
  if (!m) return undefined;
  return m.owner ? ownerEmailRecord()?.changed : accountById(m.accountId)?.updated;
}

export const passwordProblems = (next: string) => problemsFor(next, accountEmail());

async function currentFits(current: string): Promise<boolean> {
  const m = me();
  if (!m) return false;
  if (m.owner) return passwordFits(current, ownerPassword());
  const a = accountById(m.accountId);
  return Boolean(a && (await passwordFits(current, a.password)));
}

// Every account can change its own password.
export async function changePassword(current: string, next: string): Promise<'ok' | 'wrong-current' | 'weak'> {
  if (!(await currentFits(current))) return 'wrong-current';
  if (passwordProblems(next).length) return 'weak';
  const record = await makePasswordRecord(next);
  const m = me();
  if (m?.owner) {
    localStorage.setItem(OWNER_AUTH_KEY, JSON.stringify(record));
  } else if (m) {
    const a = accountById(m.accountId);
    if (a) saveAccount({ ...a, password: { ...record, by: 'self' } });
  }
  return 'ok';
}

// Whether a login email is free (no other account, owner included, uses it).
export function emailTaken(email: string, exceptId?: string): boolean {
  const e = email.trim().toLowerCase();
  if (exceptId !== OWNER_MEMBER_ID && ownerEmail().toLowerCase() === e) return true;
  const other = accountByEmail(e);
  return Boolean(other && other.accountId !== exceptId);
}

// Only super admins change a login email (their own here; anyone's in
// Developer). Everyone else asks a RunTruck super admin.
export async function changeLoginEmail(current: string, next: string): Promise<'ok' | 'wrong-current' | 'invalid' | 'taken' | 'not-allowed'> {
  const m = me();
  if (!m || !isSuperAdmin()) return 'not-allowed';
  if (!(await currentFits(current))) return 'wrong-current';
  const email = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'invalid';
  if (emailTaken(email, m.accountId)) return 'taken';
  if (m.owner) {
    localStorage.setItem(OWNER_EMAIL_KEY, JSON.stringify({ email, changed: new Date().toISOString() } satisfies LoginEmailRecord));
  } else {
    const a = accountById(m.accountId);
    if (a) saveAccount({ ...a, email, updated: new Date().toISOString() });
  }
  // The open session now shows the new email.
  for (const store of [sessionStorage, localStorage]) {
    try {
      const s = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Session | null;
      if (s) store.setItem(SESSION_KEY, JSON.stringify({ ...s, email }));
    } catch {
      // Ignore a damaged session.
    }
  }
  return 'ok';
}

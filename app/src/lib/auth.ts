import { COMPANY_ID, MEMBER_ID, roleOf, scopedKey } from './account';
import { DEFAULT_SETTINGS } from '../data/settings';
import { getSettings } from './settingsStore';

// Logging in to the one account (company 30017).
//
// The password is never stored: only a PBKDF2-SHA-256 fingerprint (salted,
// 210,000 rounds). Until it is changed in Settings › Security the account
// uses the starting password below; a changed password is kept in this
// browser under the company ID. There is no server yet, so this is a gate
// in the browser, not server-side security.

interface PasswordRecord {
  salt: string;
  hash: string;
  iterations: number;
  changed?: string;
}

// The starting password's fingerprint (the password itself is not in the code).
const STARTING: PasswordRecord = {
  salt: '10bd890a82a7af9eafb061e54ffa5ecb',
  hash: 'd330e5c7bf6ce5ba8851c4baf52495e9e2f5c0c0d4b5538d3d0d549707af9379',
  iterations: 210_000,
};

const AUTH_KEY = scopedKey('runtruck-auth');
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

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) => new Uint8Array(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

async function fingerprint(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password) as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex) as BufferSource, iterations, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

function passwordRecord(): PasswordRecord {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as PasswordRecord | null;
    if (saved && saved.salt && saved.hash && saved.iterations) return saved;
  } catch {
    // Fall back to the starting password.
  }
  return STARTING;
}

export function passwordChangedOn(): string | undefined {
  return passwordRecord().changed;
}

// The account's login email is the email in Settings › Profile.
export function accountEmail(): string {
  return getSettings().profile.email.trim();
}

async function passwordMatches(password: string): Promise<boolean> {
  const rec = passwordRecord();
  return (await fingerprint(password, rec.salt, rec.iterations)) === rec.hash;
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

export type LoginResult = { ok: true } | { ok: false; reason: 'locked' | 'email' | 'password'; seconds?: number };

// The emails the account answers to: the one in Settings › Profile, and the
// account's original email (so changing the profile email never locks you out).
function emailMatches(email: string): boolean {
  const typed = email.trim().toLowerCase();
  return [accountEmail(), DEFAULT_SETTINGS.profile.email].some((e) => e.trim().toLowerCase() === typed);
}

// 'rosa.medina@sunridgefreight.com' → 'r•••@sunridgefreight.com', as a hint.
export function emailHint(): string {
  const [name, domain] = accountEmail().split('@');
  return `${name.slice(0, 1)}•••@${domain ?? ''}`;
}

export async function logIn(email: string, password: string, remember: boolean): Promise<LoginResult> {
  if (lockedFor() > 0) return { ok: false, reason: 'locked', seconds: lockedFor() };
  // Spaces copied around a password are not part of it.
  const emailOk = emailMatches(email);
  const passwordOk = await passwordMatches(password.trim());
  if (!emailOk || !passwordOk) {
    noteFail();
    if (lockedFor() > 0) return { ok: false, reason: 'locked', seconds: lockedFor() };
    return { ok: false, reason: emailOk ? 'password' : 'email' };
  }
  try {
    sessionStorage.removeItem(FAILS_KEY);
  } catch {
    // Nothing to clear.
  }
  const now = Date.now();
  const session: Session = {
    companyId: COMPANY_ID,
    memberId: MEMBER_ID,
    email: accountEmail(),
    started: new Date(now).toISOString(),
    expires: new Date(now + (remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000)).toISOString(),
    remember,
  };
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the person has to log in again after reloading.
  }
  return { ok: true };
}

export function currentSession(): Session | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const s = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Session | null;
      if (s && s.companyId === COMPANY_ID && s.memberId === MEMBER_ID && Date.parse(s.expires) > Date.now()) return s;
    } catch {
      // Ignore a damaged session.
    }
  }
  return null;
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

// — changing the password —

export const MIN_PASSWORD = 10;

export function passwordProblems(next: string): string[] {
  const out: string[] = [];
  if (next.length < MIN_PASSWORD) out.push(`At least ${MIN_PASSWORD} characters`);
  if (next !== next.trim()) out.push('No spaces at the start or end');
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) out.push('Letters and at least one number');
  if (next.toLowerCase().includes(accountEmail().split('@')[0].toLowerCase())) out.push('Not based on your email');
  return out;
}

export async function changePassword(current: string, next: string): Promise<'ok' | 'wrong-current' | 'weak'> {
  if (!(await passwordMatches(current))) return 'wrong-current';
  if (passwordProblems(next).length) return 'weak';
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const record: PasswordRecord = { salt, hash: await fingerprint(next, salt, STARTING.iterations), iterations: STARTING.iterations, changed: new Date().toISOString() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(record));
  return 'ok';
}

// Whether the signed-in member is a RunTruck super admin (sees Developer).
export function isSuperAdmin(): boolean {
  return roleOf(currentSession()?.memberId) === 'Super admin';
}

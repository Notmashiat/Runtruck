import { useSyncExternalStore } from 'react';
import { reviveAccount, type Account } from '../data/accounts';
import { OWNER_MEMBER_ID, readRegistry, registryKey } from './account';
import { onStorageChange, writeJson } from './storage';

// Every login account made in Developer (runtruck-1-accounts) and every
// Account ID ever issued (runtruck-1-account-ids). An ID stays issued when
// its account is deleted, so no Account ID is ever given out twice. The
// owner account (100482731) lives in lib/auth.ts and is not in this list.

const KEY = 'accounts';
const IDS_KEY = 'account-ids';

function load(): Account[] {
  const raw = readRegistry<unknown[]>(KEY);
  return Array.isArray(raw) ? raw.map(reviveAccount).filter((a): a is Account => a !== null) : [];
}

function loadIssued(list: Account[]): string[] {
  const saved = readRegistry<unknown[]>(IDS_KEY);
  const ids = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  return [...new Set([...ids, ...list.map((a) => a.accountId)])];
}

let accounts: Account[] = load();
let issued: string[] = loadIssued(accounts);
const listeners = new Set<() => void>();

// Take what storage holds now. Another tab may have added, changed or
// deactivated accounts since this one loaded, so this runs when that tab
// saves and again just before this tab changes anything: a tab left open
// never writes an old copy of the list over a newer one.
function refresh() {
  accounts = load();
  issued = [...new Set([...issued, ...loadIssued(accounts)])];
}

function persist() {
  writeJson(registryKey(KEY), accounts);
  writeJson(registryKey(IDS_KEY), issued);
  listeners.forEach((l) => l());
}

// Re-read the saved accounts (and tell anything showing them).
export function reloadAccounts() {
  refresh();
  listeners.forEach((l) => l());
}
onStorageChange(registryKey(KEY), reloadAccounts);

export function getAccounts(): Account[] {
  return accounts;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAccounts(): Account[] {
  return useSyncExternalStore(subscribe, getAccounts, getAccounts);
}

export const accountById = (id: string) => accounts.find((a) => a.accountId === id);
export const accountByEmail = (email: string) => accounts.find((a) => a.email.trim().toLowerCase() === email.trim().toLowerCase());
export const accountsIn = (companyId: string) => accounts.filter((a) => a.companyId === companyId);

export function isAccountIdIssued(id: string): boolean {
  return id === OWNER_MEMBER_ID || issued.includes(id);
}

// A random ten-digit Account ID (1000000000–9999999999) never issued before.
export function newAccountId(): string {
  for (;;) {
    const [a, b] = crypto.getRandomValues(new Uint32Array(2));
    const id = String(1_000_000_000 + (a % 90_000) * 100_000 + (b % 100_000));
    if (!isAccountIdIssued(id)) return id;
  }
}

// Add or update an account. A new account's ID is recorded as issued for good.
export function saveAccount(a: Account) {
  refresh();
  const exists = accounts.some((x) => x.accountId === a.accountId);
  accounts = exists ? accounts.map((x) => (x.accountId === a.accountId ? a : x)) : [...accounts, a];
  if (!issued.includes(a.accountId)) issued = [...issued, a.accountId];
  persist();
}

// Remove an account. Its ID stays issued and is never reused.
export function deleteAccount(id: string) {
  refresh();
  accounts = accounts.filter((a) => a.accountId !== id);
  persist();
}

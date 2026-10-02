// The one place RunTruck reads and writes saved data.
//
// Today everything is kept in this browser (localStorage for records and
// settings, IndexedDB for attached files — lib/fileStore.ts). Every module
// that saves goes through the functions here, which gives three things:
//
// 1. A failed save is never silent. If the browser's storage is full or
//    blocked, the failure is recorded (lib/errorLog.ts) and the app shows a
//    banner (components/StorageBanner.tsx) instead of pretending it saved.
// 2. Two tabs stay in step. A change saved in one tab is handed to the same
//    store in the other tabs (onStorageChange), so the second tab does not
//    overwrite it with an older copy.
// 3. One seam for a server. When records move to a database, this file and
//    lib/persist.ts are where reads and writes are redirected; the pages
//    keep calling the same save functions.
import { useSyncExternalStore } from 'react';
import { reportError } from './errorLog';

export type StorageProblem = 'full' | 'blocked';

// Keys whose latest value did not reach storage, and why.
const failed = new Map<string, StorageProblem>();
const listeners = new Set<() => void>();
let snapshot: StorageProblem | null = null;

function publish() {
  const next = failed.size === 0 ? null : [...failed.values()].includes('full') ? 'full' : 'blocked';
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

function isQuota(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// The saved value, or null when there is none or it is damaged.
export function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

// Save a value. Returns false (and reports it) when the browser refused.
export function writeText(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    if (failed.delete(key)) publish();
    return true;
  } catch (e) {
    const problem: StorageProblem = isQuota(e) ? 'full' : 'blocked';
    // Report each key once per problem, not on every keystroke.
    if (failed.get(key) !== problem) reportError(e, { kind: 'storage', where: `Saving ${key}` });
    failed.set(key, problem);
    publish();
    return false;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch (e) {
    reportError(e, { kind: 'storage', where: `Saving ${key}` });
    return false;
  }
  return writeText(key, text);
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
  if (failed.delete(key)) publish();
}

// Remove every key that starts with `prefix` (a deleted company's records).
export function removeKeysWithPrefix(prefix: string): number {
  if (!prefix) return 0;
  const gone: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) gone.push(k);
    }
  } catch {
    return 0;
  }
  gone.forEach(removeKey);
  return gone.length;
}

// — whether saving works —

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getProblem = () => snapshot;

// 'full' or 'blocked' while the latest changes are not saved; null when all is well.
export function useStorageProblem(): StorageProblem | null {
  return useSyncExternalStore(subscribe, getProblem, getProblem);
}

// Browsers give a site about 5 million characters of localStorage.
export const STORAGE_LIMIT = 5_000_000;

// How much of this browser's storage RunTruck uses (characters, and the share of the limit).
export function storageUsage(): { used: number; share: number } {
  let used = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) used += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    // Storage blocked: nothing is used.
  }
  return { used, share: used / STORAGE_LIMIT };
}

// — other tabs —

// Call `fn` when another tab saves `key` (the new text, or null if removed).
// The browser only tells the tabs that did not make the change.
export function onStorageChange(key: string, fn: (raw: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: StorageEvent) => {
    if (e.storageArea === localStorage && e.key === key) fn(e.newValue);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

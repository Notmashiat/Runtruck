// What went wrong, written down so a developer can find it afterwards.
//
// Every problem the app catches lands here: a screen that failed to draw
// (components/ErrorBoundary.tsx), an error in a click handler or a timer,
// a promise nobody caught, a save that did not reach storage, a page whose
// code would not download. Each gets a short reference ('ERR-M3K2A9') that
// is shown to the person, and an entry with everything needed to trace it:
// when, where on screen, which address, which company and account, which
// build, and the stack.
//
// The log is kept in memory and in this browser's storage (the newest
// MAX_ENTRIES, per company). RunTruck has no server yet; when it does,
// setErrorSink() is the one place to send entries to it (or to a service
// such as Sentry). Developer › Error log shows what this device recorded.
//
// This module must never throw and must not import the storage layer
// (lib/storage.ts reports its own failures here).
import { useSyncExternalStore } from 'react';
import { COMPANY_ID, MEMBER_ID, scopedKey } from './account';

export type ErrorKind = 'screen' | 'script' | 'promise' | 'storage' | 'update';

export interface ErrorEntry {
  // The reference shown to the person: 'ERR-M3K2A9'.
  id: string;
  // First and latest time it happened (ISO), and how many times.
  at: string;
  last: string;
  count: number;
  kind: ErrorKind;
  // The part of the screen that reported it: 'Page', 'Top bar', 'Form'…
  where: string;
  message: string;
  // The JavaScript stack, then React's component stack for screen errors.
  stack: string;
  // The address that was open ('/app/accounting/bills').
  path: string;
  companyId: string;
  memberId: string;
  // The code that was running: the release the company is on and the build.
  release: string;
  build: string;
  agent: string;
}

export interface ErrorContext {
  kind: ErrorKind;
  where: string;
  componentStack?: string | null;
}

const KEY = scopedKey('runtruck-errors');
const MAX_ENTRIES = 50;
const MAX_TEXT = 6000;

// The build this page runs: the commit Vercel built, or 'dev' locally.
export const BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

function load(): ErrorEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((e): e is ErrorEntry => Boolean(e) && typeof e.id === 'string' && typeof e.message === 'string').slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let entries: ErrorEntry[] = load();
const listeners = new Set<() => void>();
let release = '';
let sink: ((entry: ErrorEntry) => void) | null = null;

// The release the signed-in company runs, set once the app has worked it out.
export function setErrorRelease(id: string) {
  release = id;
}

// Where entries go besides this device: a server endpoint or a monitoring
// service. Not set today (there is no server).
export function setErrorSink(fn: ((entry: ErrorEntry) => void) | null) {
  sink = fn;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the log lasts for this visit.
  }
  listeners.forEach((l) => l());
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… (cut)` : s);

function parts(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack ?? '' };
  if (typeof error === 'string') return { message: error, stack: '' };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: '' };
  } catch {
    return { message: String(error), stack: '' };
  }
}

const newId = () => `ERR-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();

// Record a problem and return its entry. The same problem in the same place
// counts up instead of filling the log.
export function reportError(error: unknown, context: ErrorContext): ErrorEntry {
  const now = new Date().toISOString();
  try {
    const { message, stack } = parts(error);
    const fullStack = clip([stack, context.componentStack ? `Component stack:${context.componentStack}` : ''].filter(Boolean).join('\n'));
    const same = entries.find((e) => e.kind === context.kind && e.where === context.where && e.message === message);
    const entry: ErrorEntry = same
      ? { ...same, last: now, count: same.count + 1 }
      : {
          id: newId(), at: now, last: now, count: 1, kind: context.kind, where: context.where, message: clip(message), stack: fullStack,
          path: typeof location === 'undefined' ? '' : location.pathname + location.search,
          companyId: COMPANY_ID, memberId: MEMBER_ID, release, build: BUILD,
          agent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        };
    entries = [entry, ...entries.filter((e) => e !== same)].slice(0, MAX_ENTRIES);
    console.error(`[RunTruck] ${entry.id} · ${entry.kind} · ${entry.where} · ${entry.path}\n${entry.message}`, error);
    persist();
    if (!same) {
      try {
        sink?.(entry);
      } catch {
        // A broken sink must not cause a second error.
      }
    }
    return entry;
  } catch {
    // Reporting itself failed: still hand back something to show.
    return { id: 'ERR-UNKNOWN', at: now, last: now, count: 1, kind: context.kind, where: context.where, message: String(error), stack: '', path: '', companyId: COMPANY_ID, memberId: MEMBER_ID, release, build: BUILD, agent: '' };
  }
}

export function getErrorLog(): ErrorEntry[] {
  return entries;
}

export function clearErrorLog() {
  entries = [];
  persist();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useErrorLog(): ErrorEntry[] {
  return useSyncExternalStore(subscribe, getErrorLog, getErrorLog);
}

// Everything about one problem as text, to paste into an email or a ticket.
export function describeError(e: ErrorEntry): string {
  return [
    `RunTruck error ${e.id}`,
    `When: ${e.at}${e.count > 1 ? ` (${e.count} times, last ${e.last})` : ''}`,
    `Where: ${e.where} · ${e.path}`,
    `Kind: ${e.kind}`,
    `Company ID: ${e.companyId} · Account ID: ${e.memberId}`,
    `Release: ${e.release || '—'} · Build: ${e.build}`,
    `Browser: ${e.agent}`,
    `Message: ${e.message}`,
    e.stack ? `Stack:\n${e.stack}` : '',
  ].filter(Boolean).join('\n');
}

// A page whose code could not be downloaded (offline, or a new version went
// out while this tab was open) rather than a fault in the page itself.
export function isLoadFailure(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically|Unable to preload CSS/i.test(text);
}

// Browser noise that is not a RunTruck fault.
const IGNORED = [/ResizeObserver loop/i];

// Errors outside React's drawing: click handlers, timers, promises. They do
// not take the screen down, but without this nobody would know they happened.
let installed = false;
export function installErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Errors thrown by browser extensions or other sites' scripts are not ours.
  const foreign = (stack: unknown, file = '') =>
    (file !== '' && !file.startsWith(location.origin)) || (typeof stack === 'string' && /https?:|-extension:/.test(stack) && !stack.includes(location.origin));
  window.addEventListener('error', (e) => {
    const message = e.message || '';
    if (IGNORED.some((r) => r.test(message))) return;
    // A stylesheet, image or script that failed to load has no error object.
    if (!e.error && !message) return;
    if (foreign((e.error as Error | undefined)?.stack, e.filename)) return;
    reportError(e.error ?? message, { kind: 'script', where: 'Action' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (foreign((e.reason as Error | undefined)?.stack)) return;
    reportError(e.reason ?? 'Promise rejected', { kind: 'promise', where: 'Background task' });
  });
}

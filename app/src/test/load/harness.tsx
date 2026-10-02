// The load test's tools: a browser with room for many companies, and a way
// to "be" one account of one company for a while.
//
// RunTruck decides whose data is open once, as its code loads (lib/account.ts
// reads the saved session). So each simulated session saves a session, loads
// the app's code afresh (vi.resetModules) and mounts the real data provider
// (context/AppShellContext.tsx), exactly as opening the site while signed in
// does. Everything it saves goes through the app's own save functions into
// the same storage every other simulated company uses, which is what makes
// this a test of whether companies stay apart.
//
// Nothing here touches a real browser or the live site: the storage is in
// memory and is gone when the test ends.
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

// — storage —

// localStorage without the 5 MB limit (the limit is measured on its own in
// the tests), which counts what is written to it.
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  writes = 0;
  bytesWritten = 0;
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) {
    this.writes += 1;
    this.bytesWritten += v.length;
    this.data.set(k, String(v));
  }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  keys() { return [...this.data.keys()]; }
  size() {
    let n = 0;
    for (const [k, v] of this.data) n += k.length + v.length;
    return n;
  }
}

export function useMemoryStorage(): MemoryStorage {
  const mem = new MemoryStorage();
  for (const target of [globalThis, window]) Object.defineProperty(target, 'localStorage', { value: mem, configurable: true, writable: true });
  return mem;
}

// The little of IndexedDB that lib/fileStore.ts uses, kept in memory. The
// returned map is every stored file by its key ('<company ID>:<file id>').
export function useMemoryFiles(): Map<string, unknown> {
  const files = new Map<string, unknown>();
  const request = <T,>(result: T) => ({ result, error: null });
  const store = {
    put: (value: unknown, key: string) => { files.set(key, value); return request(undefined); },
    get: (key: string) => request(files.get(key)),
    getAllKeys: () => request([...files.keys()]),
    delete: (key: string) => { files.delete(key); return request(undefined); },
    count: () => request(files.size),
  };
  const db = {
    createObjectStore: () => store,
    transaction: () => {
      const tx: { objectStore: () => typeof store; oncomplete: null | (() => void); onerror: null; onabort: null; error: null } = { objectStore: () => store, oncomplete: null, onerror: null, onabort: null, error: null };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };
  const fake = {
    open: () => {
      const req: { result: typeof db; error: null; onupgradeneeded: null | (() => void); onsuccess: null | (() => void); onerror: null } = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => { req.onupgradeneeded?.(); req.onsuccess?.(); }, 0);
      return req;
    },
  };
  for (const target of [globalThis, window]) Object.defineProperty(target, 'indexedDB', { value: fake, configurable: true, writable: true });
  return files;
}

// — sessions —

type Shell = ReturnType<typeof import('../../context/AppShellContext')['useAppShell']>;

export interface Session {
  companyId: string;
  memberId: string;
  // The app's records and save functions, as a screen gets them.
  shell: () => Shell;
  // Do something a person would (a save, an edit) and let the app settle.
  act: (what: (s: Shell) => void) => Promise<void>;
}

const signIn = (companyId: string, memberId: string) => {
  const now = Date.now();
  sessionStorage.setItem('runtruck-session', JSON.stringify({
    companyId, memberId, email: `a${memberId}@c${companyId}.test`,
    started: new Date(now).toISOString(), expires: new Date(now + 3_600_000).toISOString(), remember: false,
  }));
};

// Open RunTruck as one account, do `work`, and close it again (which is when
// a tab's last changes reach storage). Returns what `work` returns.
export async function asAccount<T>(companyId: string, memberId: string, work: (session: Session) => Promise<T>): Promise<T> {
  signIn(companyId, memberId);
  // The listeners this "tab" adds to the window, taken away again when it
  // closes (a real tab's go with it; here they would pile up and hold every
  // earlier session's copy of the app in memory).
  const added: [string, EventListenerOrEventListenerObject, unknown][] = [];
  const add = window.addEventListener;
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, options?: unknown) => {
    added.push([type, fn, options]);
    add.call(window, type, fn, options as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  vi.resetModules();
  const { AppShellProvider, useAppShell } = await import('../../context/AppShellContext');
  // What the app gives a screen, caught by a component inside the provider.
  const seen: { shell?: Shell } = {};
  const keep = (shell: Shell) => { seen.shell = shell; };
  function Probe({ onShell }: { onShell: (shell: Shell) => void }) {
    onShell(useAppShell());
    return null;
  }
  const view = render(<AppShellProvider><Probe onShell={keep} /></AppShellProvider>);
  // Let start-up jobs (the attached-files clean-up) finish.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  try {
    return await work({
      companyId, memberId,
      shell: () => seen.shell as Shell,
      act: async (what) => { await act(async () => { what(seen.shell as Shell); }); },
    });
  } finally {
    view.unmount();
    window.addEventListener = add;
    for (const [type, fn, options] of added) window.removeEventListener(type, fn, options as EventListenerOptions);
  }
}

// The app's code as the open session sees it (same copies the provider uses).
export const appCode = async () => ({
  account: await import('../../lib/account'),
  attachments: await import('../../lib/attachments'),
  bills: await import('../../data/bills'),
  clock: await import('../../lib/clock'),
  customers: await import('../../data/customers'),
  errorLog: await import('../../lib/errorLog'),
  fileStore: await import('../../lib/fileStore'),
  fleet: await import('../../data/fleet'),
  ids: await import('../../lib/ids'),
  invoicing: await import('../../data/invoicing'),
  loads: await import('../../data/loads'),
  payroll: await import('../../data/payroll'),
  safety: await import('../../data/safetyRecords'),
  settings: await import('../../lib/settingsStore'),
});
export type AppCode = Awaited<ReturnType<typeof appCode>>;

// The mark every record of a company carries, so a record that turns up in
// the wrong place can be recognised.
export const markOf = (companyId: string) => `[C${companyId}]`;
const MARK = /\[C(\d+)\]/g;

// The companies whose marks appear in a piece of stored text.
export function marksIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(MARK)) out.add(m[1]);
  return out;
}

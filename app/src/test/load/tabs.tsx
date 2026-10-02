// Several browser tabs open at once, for the load tests.
//
// A real browser tells every *other* tab when one tab saves (the "storage"
// event). Here all the simulated tabs share one window, so this file keeps
// track of which tab is listening for what and delivers each save to the
// others only, when the test says so. That lets a test decide whether two
// saves happen one after the other (each tab hears about the other's save
// first) or at the very same moment (neither has heard yet).
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import type { MemoryStorage, Session } from './harness';

type Listener = (e: Event) => void;
type Shell = ReturnType<Session['shell']>;

export interface Tab extends Session {
  name: string;
  close: () => void;
}

export function tabs(storage: MemoryStorage) {
  const listening = new Map<string, Set<Listener>>();
  // Saves not yet announced to the other tabs: [tab that saved, key, new text].
  let pending: [string, string, string][] = [];
  let current = '';

  // Note which tab adds each "storage" listener.
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = ((type: string, fn: Listener, options?: unknown) => {
    if (type === 'storage' && current) {
      if (!listening.has(current)) listening.set(current, new Set());
      listening.get(current)?.add(fn);
      return;
    }
    add(type, fn as EventListener, options as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, fn: Listener, options?: unknown) => {
    if (type === 'storage') listening.forEach((set) => set.delete(fn));
    remove(type, fn as EventListener, options as EventListenerOptions);
  }) as typeof window.removeEventListener;

  // Note which tab makes each save.
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key: string, value: string) => {
    setItem(key, value);
    if (current) pending.push([current, key, value]);
  };

  const as = async <T,>(name: string, work: () => Promise<T> | T): Promise<T> => {
    const before = current;
    current = name;
    try {
      return await work();
    } finally {
      current = before;
    }
  };

  // Tell every other tab about the saves made so far, oldest first.
  const deliver = async () => {
    const batch = pending;
    pending = [];
    for (const [from, key, newValue] of batch) {
      for (const [name, set] of listening) {
        if (name === from) continue;
        const event = Object.assign(new Event('storage'), { key, newValue, storageArea: storage });
        await as(name, () => act(async () => { set.forEach((fn) => fn(event)); }));
      }
    }
    if (pending.length) await deliver();
  };

  // Open RunTruck in a new tab as an account.
  const open = async (name: string, companyId: string, memberId: string): Promise<Tab> =>
    as(name, async () => {
      const now = Date.now();
      sessionStorage.setItem('runtruck-session', JSON.stringify({
        companyId, memberId, email: `a${memberId}@c${companyId}.test`, started: new Date(now).toISOString(), expires: new Date(now + 3_600_000).toISOString(), remember: false,
      }));
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
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      return {
        name, companyId, memberId,
        shell: () => seen.shell as Shell,
        act: (what) => as(name, () => act(async () => { what(seen.shell as Shell); })),
        close: () => { void as(name, () => view.unmount()); listening.delete(name); },
      };
    });

  return { open, deliver, as };
}

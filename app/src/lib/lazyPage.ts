// Screens are downloaded the first time they are opened (see App.tsx). When
// RunTruck is updated, the files an open tab knows about no longer exist on
// the server, so opening a new screen in that tab fails to download. The
// fix is to reload once, which fetches the new version; if the download
// still fails (offline), the error boundary explains and offers a reload.
import { lazy, type ComponentType } from 'react';
import { isLoadFailure } from './errorLog';

const RELOADED_KEY = 'runtruck-reloaded-at';
const RELOAD_GAP_MS = 30_000;

function reloadOnce(error: unknown): Promise<never> {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
  } catch {
    // Storage blocked: fall through to the error boundary.
    throw error;
  }
  // Already reloaded moments ago and it still fails: stop, and show the error.
  if (!isLoadFailure(error) || Date.now() - last < RELOAD_GAP_MS) throw error;
  try {
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    throw error;
  }
  window.location.reload();
  // Keep the "Loading…" state on screen until the reload takes over.
  return new Promise<never>(() => undefined);
}

// The exports of a module that are components.
type ComponentKeys<M> = { [K in keyof M]: M[K] extends ComponentType<never> ? K : never }[keyof M];
type PropsOf<C> = C extends ComponentType<infer P> ? P : never;

// lazy() for a named export: lazyNamed(() => import('./pages/X'), 'X').
export function lazyNamed<M, K extends ComponentKeys<M>>(load: () => Promise<M>, name: K) {
  return lazy(() => load().catch(reloadOnce).then((m) => ({ default: m[name] as ComponentType<PropsOf<M[K]>> })));
}

import { useSyncExternalStore } from 'react';
import { mergeSettings, type Settings } from '../data/settings';

// The saved settings (runtruck-settings), readable anywhere with
// getSettings() and in components with useSettings(). lib/applySettings.ts
// carries changes into the rest of the app.

const KEY = 'runtruck-settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s = mergeSettings(JSON.parse(raw ?? 'null'));
    // Before Settings existed, dark mode was saved on its own.
    if (raw === null && localStorage.getItem('runtruck-theme') === 'dark') s.appearance.theme = 'Dark';
    return s;
  } catch {
    return mergeSettings(null);
  }
}

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return current;
}

export function setSettings(next: Settings) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the settings last for this visit.
  }
  listeners.forEach((l) => l(next));
}

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettings() {
  const s = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const update = (fn: (prev: Settings) => Settings) => setSettings(fn(getSettings()));
  return [s, update] as const;
}

// A number setting, or the fallback when it is blank or not a number.
export function numSetting(value: string, fallback: number): number {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) ? n : fallback;
}

// '{invoice} is due {due}' with { invoice: 'INV-1', due: 'Oct 3' }. A line
// that ends up as just a label ('Your reference:') is dropped.
export function fillTemplate(template: string, vars: Record<string, string>): string {
  const filled = template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  return filled
    .split('\n')
    .filter((line) => !/^[^:\n]{1,40}:\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

import { useSyncExternalStore } from 'react';
import { mergeSettings, startingSettings, type Settings, type StartingCompany, type StartingPerson } from '../data/settings';
import { COMPANY_ID, IS_DEMO, MEMBER_ID, OWNER_MEMBER_ID, readRegistry, readScoped, scopedKey } from './account';

// The saved settings, readable anywhere with getSettings() and in components
// with useSettings(). lib/applySettings.ts carries changes into the rest of
// the app. Company settings are shared by the company's accounts
// (runtruck-<company ID>-settings); Profile and Appearance belong to each
// account (runtruck-<company ID>-member-<account ID>-settings).

const KEY = 'runtruck-settings';
const PERSONAL_KEY = `runtruck-member-${MEMBER_ID}-settings`;

type Stored = Partial<Settings> | null;

function parse(raw: string | null): Stored {
  try {
    const v = JSON.parse(raw ?? 'null') as unknown;
    return v && typeof v === 'object' ? (v as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

// How a company's settings start: RunTruck's workspace has the demo
// company; a client company starts from its own details in the client
// register, and each account from its own name and email.
export function defaultSettings(): Settings {
  const company = IS_DEMO ? null : (readRegistry<StartingCompany[]>('companies') ?? []).find((c) => c?.companyId === COMPANY_ID) ?? null;
  const person = MEMBER_ID === OWNER_MEMBER_ID ? null : (readRegistry<StartingPerson[]>('accounts') ?? []).find((a) => a?.accountId === MEMBER_ID) ?? null;
  return startingSettings(company, person, IS_DEMO);
}

function load(): Settings {
  const shared = parse(readScoped(KEY));
  // The owner's Profile and Appearance were kept with the company settings
  // before each account had its own.
  const personal = parse(readScoped(PERSONAL_KEY)) ?? (MEMBER_ID === OWNER_MEMBER_ID && shared ? { profile: shared.profile, appearance: shared.appearance } : null);
  const s = mergeSettings({ ...(shared ?? {}), profile: personal?.profile, appearance: personal?.appearance }, defaultSettings());
  // Before Settings existed, dark mode was saved on its own.
  if (!personal && localStorage.getItem('runtruck-theme') === 'dark') s.appearance.theme = 'Dark';
  return s;
}

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return current;
}

export function setSettings(next: Settings) {
  current = next;
  try {
    const { profile, appearance, ...shared } = next;
    localStorage.setItem(scopedKey(KEY), JSON.stringify(shared));
    localStorage.setItem(scopedKey(PERSONAL_KEY), JSON.stringify({ profile, appearance }));
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

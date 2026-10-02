import { useSyncExternalStore } from 'react';
import { BASELINE, RELEASES, releaseIndex, releaseOf, type Change, type Release } from '../data/releases';
import { COMPANY_ID, IS_DEMO, readRegistry, registryKey } from './account';
import { onStorageChange, writeJson } from './storage';

// Which version each company runs, and how versions are put together.
//
// Releases are written in code (data/releases.ts). A super admin can merge
// releases that have not gone out yet into one version, deploy a version to
// companies, and later redeploy it to companies that were left out or roll
// it back from some. Everything is kept in runtruck-1-release-state; super
// admins (Company ID 1) always run the newest code.

export type ReleaseAction = 'deploy' | 'redeploy' | 'rollback';

export interface ReleaseEvent {
  id: string;
  at: string;
  by: string;
  byName: string;
  action: ReleaseAction;
  // The version (by its last release) the action was about.
  release: string;
  companies: string[];
  // What companies created from then on start on, if the action changed it.
  newCompanies?: 'on' | 'off';
}

export interface Merge {
  id: string;
  title: string;
  releases: string[];
  at: string;
  byName: string;
}

interface State {
  // A company's release, once a super admin has deployed or rolled back for it.
  assignments: Record<string, string>;
  // What new companies start on, from a point in time.
  defaults: { release: string; at: string }[];
  log: ReleaseEvent[];
  merges: Merge[];
}

export interface Version {
  id: string;
  title: string;
  date: string;
  releases: Release[];
  changes: Change[];
  first: number;
  last: number;
  baseline: boolean;
  merge?: Merge;
}

const KEY = 'release-state';
const EMPTY: State = { assignments: {}, defaults: [], log: [], merges: [] };

// Deployments saved before versions could be merged or managed per company.
interface OldDeployment {
  id: string;
  release: string;
  at: string;
  by: string;
  byName: string;
  companies: string[];
  forNew: boolean;
}

function migrate(old: OldDeployment[]): State {
  const s: State = { assignments: {}, defaults: [], log: [], merges: [] };
  for (const d of [...old].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    for (const c of d.companies) {
      if (releaseIndex(d.release) > releaseIndex(s.assignments[c] ?? BASELINE.id)) s.assignments[c] = d.release;
    }
    if (d.forNew) s.defaults.push({ release: d.release, at: d.at });
    s.log.push({ id: d.id, at: d.at, by: d.by, byName: d.byName, action: 'deploy', release: d.release, companies: d.companies, newCompanies: d.forNew ? 'on' : undefined });
  }
  return s;
}

function load(): State {
  const raw = readRegistry<Partial<State>>(KEY);
  if (raw && typeof raw === 'object') {
    const known = (id: unknown) => typeof id === 'string' && releaseIndex(id) >= 0;
    return {
      assignments: Object.fromEntries(Object.entries(raw.assignments ?? {}).filter(([, r]) => known(r))),
      defaults: (raw.defaults ?? []).filter((d) => d && known(d.release) && typeof d.at === 'string'),
      log: (raw.log ?? []).filter((e) => e && known(e.release) && Array.isArray(e.companies)),
      merges: (raw.merges ?? []).filter((m) => m && Array.isArray(m.releases) && m.releases.every(known)),
    };
  }
  const old = readRegistry<OldDeployment[]>('deployments');
  return Array.isArray(old) ? migrate(old.filter((d) => d && releaseIndex(d.release) >= 0 && Array.isArray(d.companies))) : EMPTY;
}

let state: State = load();
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  writeJson(registryKey(KEY), state);
  listeners.forEach((l) => l());
}

// Another tab deployed, rolled back or merged: show it here too. Which
// release this page itself runs (ownIndex below) stays as it was worked out
// when the page loaded; a company gets a new release on its next page load.
onStorageChange(registryKey(KEY), () => {
  state = load();
  listeners.forEach((l) => l());
});

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getState = () => state;
export function useReleaseState() {
  return useSyncExternalStore(subscribe, getState, getState);
}
export type ReleaseState = State;

// — reading —

const BASE = releaseIndex(BASELINE.id);

// What companies created now start on.
function defaultIndex(s: State, at?: string): number {
  const before = s.defaults.filter((d) => !at || d.at < at).sort((a, b) => (a.at < b.at ? -1 : 1));
  return before.length ? releaseIndex(before[before.length - 1].release) : BASE;
}

// A company's release (an index into RELEASES).
export function companyReleaseIndex(company: { companyId: string; created?: string }, s: State = state): number {
  const set = s.assignments[company.companyId];
  if (set) return releaseIndex(set);
  return company.created ? defaultIndex(s, company.created) : BASE;
}

export const newCompaniesIndex = (s: State = state) => defaultIndex(s);

// The newest release any company (or new companies) has been given.
export function latestDeployedIndex(s: State = state): number {
  return Math.max(BASE, ...Object.values(s.assignments).map(releaseIndex), ...s.defaults.map((d) => releaseIndex(d.release)));
}

// Releases grouped into versions: merged ones count as one.
export function versions(s: State = state): Version[] {
  const out: Version[] = [];
  RELEASES.forEach((r, i) => {
    const m = s.merges.find((x) => x.releases.includes(r.id));
    const prev = out[out.length - 1];
    if (m && prev?.merge === m) {
      prev.releases.push(r);
      prev.changes.push(...r.changes);
      prev.last = i;
      prev.date = r.date;
      return;
    }
    out.push({
      id: m ? m.id : r.id, title: m ? m.title : r.title, date: r.date, releases: [r], changes: [...r.changes],
      first: i, last: i, baseline: Boolean(r.baseline), merge: m,
    });
  });
  return out;
}

export function versionAt(index: number, s: State = state): Version {
  const list = versions(s);
  return list.find((v) => index >= v.first && index <= v.last) ?? list[0];
}

export function pendingVersions(s: State = state): Version[] {
  const deployed = latestDeployedIndex(s);
  return versions(s).filter((v) => v.first > deployed);
}

// The release this page runs, worked out once as it loads.
const ownIndex: number = IS_DEMO
  ? RELEASES.length - 1
  : companyReleaseIndex((readRegistry<{ companyId: string; created?: string }[]>('companies') ?? []).find((c) => c?.companyId === COMPANY_ID) ?? { companyId: COMPANY_ID });

export const currentRelease = (): Release => RELEASES[ownIndex];

// Whether a change (an id from data/releases.ts) is switched on for the
// signed-in company. Unknown ids are off, so nothing leaks by mistake.
export function isLive(changeId: string): boolean {
  const r = releaseOf(changeId);
  return r ? releaseIndex(r.id) <= ownIndex : false;
}

// — changing —

const eventId = () => `REL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

// Send a version (and everything before it) to companies. New companies
// start on it too unless told otherwise.
export function deployVersion(v: Version, companies: string[], newCompanies: boolean, by: string, byName: string) {
  state = load();
  const s = state;
  const release = RELEASES[v.last].id;
  const assignments = { ...s.assignments };
  for (const c of companies) if (releaseIndex(assignments[c] ?? BASELINE.id) < v.last) assignments[c] = release;
  const at = new Date().toISOString();
  commit({
    ...s,
    assignments,
    defaults: newCompanies && defaultIndex(s) < v.last ? [...s.defaults, { release, at }] : s.defaults,
    log: [...s.log, { id: eventId(), at, by, byName, action: 'deploy', release, companies, newCompanies: newCompanies ? 'on' : undefined }],
  });
}

// Pick exactly which companies have a version: tick to redeploy it to
// companies that were left out, untick to roll it back (to the version
// before it). `companies` maps each company to whether it should have it.
export function setVersionCompanies(
  v: Version,
  want: Record<string, boolean>,
  current: { companyId: string; created?: string }[],
  newCompanies: boolean,
  by: string,
  byName: string,
) {
  state = load();
  const s = state;
  const release = RELEASES[v.last].id;
  const before = RELEASES[v.first - 1]?.id ?? BASELINE.id;
  const assignments = { ...s.assignments };
  const gained: string[] = [];
  const lost: string[] = [];
  for (const c of current) {
    if (!(c.companyId in want)) continue;
    const has = companyReleaseIndex(c, s) >= v.first;
    if (want[c.companyId] && !has) {
      assignments[c.companyId] = release;
      gained.push(c.companyId);
    } else if (!want[c.companyId] && has) {
      assignments[c.companyId] = before;
      lost.push(c.companyId);
    }
  }
  const at = new Date().toISOString();
  const newHas = defaultIndex(s) >= v.first;
  const defaults = newCompanies === newHas ? s.defaults : [...s.defaults, { release: newCompanies ? release : before, at }];
  const flip = newCompanies === newHas ? undefined : newCompanies ? 'on' as const : 'off' as const;
  const log = [...s.log];
  if (gained.length || flip === 'on') log.push({ id: eventId(), at, by, byName, action: 'redeploy', release, companies: gained, newCompanies: flip === 'on' ? 'on' : undefined });
  if (lost.length || flip === 'off') log.push({ id: eventId(), at, by, byName, action: 'rollback', release, companies: lost, newCompanies: flip === 'off' ? 'off' : undefined });
  commit({ ...s, assignments, defaults, log });
}

// Merge versions that have not gone out yet into one. Versions go out in
// order, so anything between the chosen ones is merged in too.
export function mergeVersions(chosen: Version[], id: string, title: string, byName: string): Merge | null {
  if (chosen.length < 2) return null;
  state = load();
  const first = Math.min(...chosen.map((v) => v.first));
  const last = Math.max(...chosen.map((v) => v.last));
  if (first <= latestDeployedIndex(state)) return null;
  const releases = RELEASES.slice(first, last + 1).map((r) => r.id);
  const merge: Merge = { id: id.trim(), title: title.trim(), releases, at: new Date().toISOString(), byName };
  commit({ ...state, merges: [...state.merges.filter((m) => !m.releases.some((r) => releases.includes(r))), merge] });
  return merge;
}

// Undo a merge that has not gone out yet.
export function splitVersion(v: Version) {
  if (!v.merge || v.first <= latestDeployedIndex(state)) return;
  const id = v.merge.id;
  state = load();
  commit({ ...state, merges: state.merges.filter((m) => m.id !== id) });
}

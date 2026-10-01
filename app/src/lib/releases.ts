import { useSyncExternalStore } from 'react';
import { BASELINE, RELEASES, releaseIndex, releaseOf, type Release } from '../data/releases';
import { COMPANY_ID, IS_DEMO, readRegistry, registryKey } from './account';

// Which release each company runs. A super admin deploys a release in
// Developer › Releases; the deployment is recorded (runtruck-1-deployments)
// and every company it went to runs that release, and everything before it,
// from the next time it opens RunTruck. Super admins (Company ID 1) always
// run the newest release.

export interface Deployment {
  id: string;
  release: string;
  at: string;
  by: string;
  byName: string;
  companies: string[];
  // Companies created after this deployment start on it too.
  forNew: boolean;
}

const KEY = 'deployments';

function valid(d: unknown): d is Deployment {
  const x = d as Partial<Deployment> | null;
  return Boolean(x && typeof x.id === 'string' && typeof x.release === 'string' && releaseIndex(x.release) >= 0 && typeof x.at === 'string' && Array.isArray(x.companies));
}

function load(): Deployment[] {
  const raw = readRegistry<unknown[]>(KEY);
  return Array.isArray(raw) ? raw.filter(valid) : [];
}

let deployments: Deployment[] = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(registryKey(KEY), JSON.stringify(deployments));
  } catch {
    // Storage blocked: the deployment lasts for this visit.
  }
  listeners.forEach((l) => l());
}

export function getDeployments(): Deployment[] {
  return deployments;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDeployments(): Deployment[] {
  return useSyncExternalStore(subscribe, getDeployments, getDeployments);
}

// A company's release (as an index into RELEASES): the baseline, raised by
// every deployment that included it, and by any deployment made for new
// companies before it was created.
export function companyReleaseIndex(company: { companyId: string; created?: string }, list: Deployment[] = deployments): number {
  let level = releaseIndex(BASELINE.id);
  for (const d of list) {
    const i = releaseIndex(d.release);
    if (i > level && (d.companies.includes(company.companyId) || (d.forNew && Boolean(company.created) && String(company.created) > d.at))) level = i;
  }
  return level;
}

// The newest release deployed to anyone (the baseline if none yet).
export function latestDeployedIndex(list: Deployment[] = deployments): number {
  return Math.max(releaseIndex(BASELINE.id), ...list.map((d) => releaseIndex(d.release)));
}

// Releases written but not deployed yet.
export function pendingReleases(list: Deployment[] = deployments): Release[] {
  return RELEASES.slice(latestDeployedIndex(list) + 1);
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

export function deploy(release: string, companies: string[], by: string, byName: string): Deployment {
  const d: Deployment = {
    id: `DEP-${Date.now().toString(36).toUpperCase()}`,
    release,
    at: new Date().toISOString(),
    by,
    byName,
    companies,
    forNew: true,
  };
  deployments = [...deployments, d];
  persist();
  return d;
}

// Undo a deployment: its companies go back to whatever they had before.
export function rollBack(id: string) {
  deployments = deployments.filter((d) => d.id !== id);
  persist();
}

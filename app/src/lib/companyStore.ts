import { useSyncExternalStore } from 'react';
import { reviveCompany, type ClientCompany } from '../data/companies';
import { COMPANY_ID, readScoped, scopedKey } from './account';

// The client companies (runtruck-1-companies) and every Company ID ever
// issued (runtruck-1-company-ids). An ID stays issued when its company is
// deleted, so no Company ID is ever given out twice.

const KEY = 'runtruck-companies';
const IDS_KEY = 'runtruck-company-ids';
// IDs RunTruck used before client companies existed.
const RESERVED = [COMPANY_ID, '30017'];

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(readScoped(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function load(): ClientCompany[] {
  const raw = read<unknown[]>(KEY, []);
  return Array.isArray(raw) ? raw.map(reviveCompany).filter((c): c is ClientCompany => c !== null) : [];
}

let companies: ClientCompany[] = load();
let issued: string[] = (() => {
  const saved = read<unknown[]>(IDS_KEY, []);
  const ids = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  return [...new Set([...ids, ...companies.map((c) => c.companyId)])];
})();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(scopedKey(KEY), JSON.stringify(companies));
    localStorage.setItem(scopedKey(IDS_KEY), JSON.stringify(issued));
  } catch {
    // Storage blocked: the companies last for this visit.
  }
  listeners.forEach((l) => l());
}

export function getCompanies(): ClientCompany[] {
  return companies;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useCompanies(): ClientCompany[] {
  return useSyncExternalStore(subscribe, getCompanies, getCompanies);
}

export function isIssued(id: string): boolean {
  return issued.includes(id) || RESERVED.includes(id);
}

// A random seven-digit Company ID (1000000–9999999) never issued before.
export function newCompanyId(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 9_000_000;
    const id = String(1_000_000 + n);
    if (!isIssued(id)) return id;
  }
}

// Add or update a company. A new company's ID is recorded as issued for good.
export function saveCompany(c: ClientCompany) {
  const exists = companies.some((x) => x.companyId === c.companyId);
  companies = exists ? companies.map((x) => (x.companyId === c.companyId ? c : x)) : [...companies, c];
  if (!issued.includes(c.companyId)) issued = [...issued, c.companyId];
  persist();
}

// Remove a company. Its ID stays issued and is never reused.
export function deleteCompany(id: string) {
  companies = companies.filter((c) => c.companyId !== id);
  persist();
}

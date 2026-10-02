import { useSyncExternalStore } from 'react';
import { reviveCompany, type ClientCompany } from '../data/companies';
import { OWNER_COMPANY_ID, OWNER_COMPANY_NAME, readRegistry, registryKey } from './account';
import { purgeCompanyFiles } from './fileStore';
import { onStorageChange, removeKeysWithPrefix, writeJson } from './storage';

// The client companies (runtruck-1-companies) and every Company ID ever
// issued (runtruck-1-company-ids). An ID stays issued when its company is
// deleted, so no Company ID is ever given out twice. These are RunTruck's
// own registers, kept under Company ID 1 whoever is signed in.

const KEY = 'companies';
const IDS_KEY = 'company-ids';
// IDs RunTruck used before client companies existed.
const RESERVED = [OWNER_COMPANY_ID, '30017'];

function read<T>(key: string, fallback: T): T {
  return readRegistry<T>(key) ?? fallback;
}

function load(): ClientCompany[] {
  const raw = read<unknown[]>(KEY, []);
  return Array.isArray(raw) ? raw.map(reviveCompany).filter((c): c is ClientCompany => c !== null) : [];
}

function loadIssued(list: ClientCompany[]): string[] {
  const saved = read<unknown[]>(IDS_KEY, []);
  const ids = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  return [...new Set([...ids, ...list.map((c) => c.companyId)])];
}

let companies: ClientCompany[] = load();
let issued: string[] = loadIssued(companies);
const listeners = new Set<() => void>();

// Take what storage holds now (another tab may have changed it): see
// lib/accountStore.ts for why this runs before every change.
function refresh() {
  companies = load();
  issued = [...new Set([...issued, ...loadIssued(companies)])];
}

function persist() {
  writeJson(registryKey(KEY), companies);
  writeJson(registryKey(IDS_KEY), issued);
  listeners.forEach((l) => l());
}

// Re-read the saved companies (and tell anything showing them).
export function reloadCompanies() {
  refresh();
  listeners.forEach((l) => l());
}
onStorageChange(registryKey(KEY), reloadCompanies);

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

export const companyById = (id: string) => companies.find((c) => c.companyId === id);

// 'RunTruck' for Company ID 1, otherwise the client's name.
export function companyName(id: string): string {
  return id === OWNER_COMPANY_ID ? OWNER_COMPANY_NAME : companyById(id)?.name ?? `Company ${id}`;
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
  refresh();
  const exists = companies.some((x) => x.companyId === c.companyId);
  companies = exists ? companies.map((x) => (x.companyId === c.companyId ? c : x)) : [...companies, c];
  if (!issued.includes(c.companyId)) issued = [...issued, c.companyId];
  persist();
}

// Remove a company, with everything it kept in this browser. Its ID stays
// issued and is never reused.
export function deleteCompany(id: string) {
  refresh();
  companies = companies.filter((c) => c.companyId !== id);
  persist();
  purgeCompanyData(id);
}

// A deleted company's records ('runtruck-<id>-…') and attached files. Left
// behind, they would use up the storage every other company shares and stay
// readable on this computer. RunTruck's own workspace is never purged.
export function purgeCompanyData(id: string) {
  if (!/^\d+$/.test(id) || id === OWNER_COMPANY_ID) return;
  removeKeysWithPrefix(`runtruck-${id}-`);
  // No files, or no file storage in this browser: nothing to remove.
  purgeCompanyFiles(id).catch(() => undefined);
}

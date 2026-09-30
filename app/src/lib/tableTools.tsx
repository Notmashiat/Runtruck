import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';

// Sorting and filtering for the app's tables.
//
// Sorting: useSort + <SortTh>. Click a column header to sort ascending, again
// for descending, a third time to go back to the original order. Values are
// compared by what they mean: money, miles, weights, percentages, hours
// ('6h 20m'), dates ('Sep 3', 'Mar 14, 2027', '04/2028', ISO) and ids
// ('L-40199' before 'L-40218'); blanks ('—') always go last.
//
// Filtering: usePageFilters(rows, defs) registers the page's filters with the
// top bar's Filters button (components/FilterPanel.tsx) and returns the rows
// that match the chosen values.

// — values —

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR = 2026; // the demo's current year, for dates written without one

// Any displayed date → 'YYYY-MM-DD' ('' if it is not a date).
export function isoOf(value: unknown): string {
  const s = String(value ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?$/.exec(s);
  if (m && MONTHS.includes(m[1])) return `${m[3] ?? YEAR}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[1])) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-01`;
  m = /^(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1]}-01`;
  return '';
}

// '$2,450.00' → 2450; '-$142' → -142; '41,200 lb' → 41200; '96%' → 96; '$29.7K' → 29700.
export function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').trim();
  const m = /^(-)?\$?(-)?([\d,]*\.?\d+)\s*([KM](?![a-z]))?\s*(%|mi|lb|d|h|ft|lb total|total|\/ mi|\/ hr|\/ yr)?$/i.exec(s);
  if (!m) return null;
  let n = parseFloat(m[3].replace(/,/g, ''));
  if (m[4]?.toUpperCase() === 'K') n *= 1000;
  if (m[4]?.toUpperCase() === 'M') n *= 1_000_000;
  return m[1] || m[2] ? -n : n;
}

type Key = number | string | null;

export function sortValue(value: unknown): Key {
  if (value === null || value === undefined || value === false) return null;
  if (value === true) return 1;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.join(', ').toLowerCase() || null;
  const s = String(value).trim();
  if (!s || s === '—' || s === '-') return null;
  const iso = isoOf(s);
  if (iso) return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const hm = /^(\d+)h (\d+)m$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = numberOf(s);
  if (n !== null) return n;
  return s.toLowerCase();
}

function compareKeys(a: Key, b: Key): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// — sorting —

export type SortDir = 'asc' | 'desc';

export interface Sort<T> {
  rows: T[];
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
}

// `get` reads a column's value from a row (by default the property of the
// same name); give it for columns that show something worked out.
export function useSort<T>(rows: T[], get?: Partial<Record<string, (row: T) => unknown>>): Sort<T> {
  const [state, setState] = useState<{ key: string; dir: SortDir } | null>(null);
  const sorted = useMemo(() => {
    if (!state) return rows;
    const read = get?.[state.key] ?? ((r: T) => (r as Record<string, unknown>)[state.key]);
    return rows
      .map((row, i) => ({ row, i, k: sortValue(read(row)) }))
      .sort((a, b) => {
        if (a.k === null && b.k === null) return a.i - b.i;
        if (a.k === null) return 1; // blanks last either way
        if (b.k === null) return -1;
        const c = compareKeys(a.k, b.k);
        return (state.dir === 'asc' ? c : -c) || a.i - b.i;
      })
      .map((x) => x.row);
  }, [rows, state, get]);
  const toggle = (key: string) =>
    setState((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
  return { rows: sorted, key: state?.key ?? null, dir: state?.dir ?? 'asc', toggle };
}

export function SortTh<T>({ sort, k, children, num }: { sort: Sort<T>; k: string; children: ReactNode; num?: boolean }) {
  const on = sort.key === k;
  return (
    <th className={`${num ? 'num ' : ''}ui-sortable${on ? ' is-sorted' : ''}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="ui-sort-btn" onClick={() => sort.toggle(k)} title="Sort">
        <span>{children}</span>
        <span className="ui-sort-icon" aria-hidden="true">{on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

// — filtering —

export type FilterDef<T> =
  | { key: string; label: string; type: 'select'; get: (row: T) => string | string[]; options?: string[] }
  | { key: string; label: string; type: 'range'; get: (row: T) => number | null; prefix?: string; suffix?: string }
  | { key: string; label: string; type: 'dates'; get: (row: T) => string }
  | { key: string; label: string; type: 'toggle'; get: (row: T) => boolean; hint?: string };

export interface FilterMeta {
  key: string;
  label: string;
  type: 'select' | 'range' | 'dates' | 'toggle';
  options?: { value: string; count: number }[];
  prefix?: string;
  suffix?: string;
  hint?: string;
}

export type RangeValue = { min?: string; max?: string };
export type DatesValue = { from?: string; to?: string };
export type FilterValue = string[] | RangeValue | DatesValue | boolean;
export type FilterValues = Record<string, FilterValue>;

export function isActive(v: FilterValue | undefined): boolean {
  if (v === undefined || v === false) return false;
  if (v === true) return true;
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((x) => x !== undefined && x !== '');
}

function matches<T>(row: T, def: FilterDef<T>, v: FilterValue): boolean {
  switch (def.type) {
    case 'select': {
      const got = def.get(row);
      const values = Array.isArray(got) ? got : [got];
      return (v as string[]).some((x) => values.includes(x));
    }
    case 'range': {
      const n = def.get(row);
      const { min, max } = v as RangeValue;
      if (n === null) return false;
      if (min !== undefined && min !== '' && n < Number(min)) return false;
      if (max !== undefined && max !== '' && n > Number(max)) return false;
      return true;
    }
    case 'dates': {
      const d = def.get(row);
      const { from, to } = v as DatesValue;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }
    case 'toggle':
      return v === true ? def.get(row) : true;
  }
}

// The page key the Filters button uses: 'loads', 'fleet/drivers', …
export function pageKeyOf(pathname: string): string {
  const parts = pathname.toLowerCase().split('/').filter(Boolean);
  return parts.slice(1, 3).join('/');
}

export function usePageFilters<T>(rows: T[], defs: FilterDef<T>[]): T[] {
  const { pathname } = useLocation();
  const page = pageKeyOf(pathname);
  const { filterValues, registerFilters } = useAppShell();
  const values = filterValues[page] ?? {};

  // What the Filters panel shows: each filter, with the choices and how many rows have each.
  const meta: FilterMeta[] = defs.map((d) => {
    if (d.type === 'range') return { key: d.key, label: d.label, type: d.type, prefix: d.prefix, suffix: d.suffix };
    if (d.type === 'toggle') return { key: d.key, label: d.label, type: d.type, hint: d.hint };
    if (d.type === 'dates') return { key: d.key, label: d.label, type: d.type };
    const counts = new Map<string, number>();
    for (const r of rows) {
      const got = d.get(r);
      for (const x of Array.isArray(got) ? got : [got]) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    for (const x of d.options ?? []) if (!counts.has(x)) counts.set(x, 0);
    const chosen = (values[d.key] as string[] | undefined) ?? [];
    for (const x of chosen) if (!counts.has(x)) counts.set(x, 0);
    const options = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (d.options ? d.options.indexOf(a.value) - d.options.indexOf(b.value) : b.count - a.count || a.value.localeCompare(b.value)));
    return { key: d.key, label: d.label, type: 'select', options };
  });
  const metaJson = JSON.stringify(meta);
  useEffect(() => {
    registerFilters(page, JSON.parse(metaJson) as FilterMeta[]);
  }, [page, metaJson, registerFilters]);

  return rows.filter((r) => defs.every((d) => !isActive(values[d.key]) || matches(r, d, values[d.key])));
}


// Record numbers that are never given out twice.
//
// A new record's number is one more than the highest ever used for its kind
// ('L' loads, 'INV' invoices, 'DRV' drivers, 'WO' work orders…). "Ever used"
// is the point: counting only the records that exist now would hand the
// number of a deleted record to the next new one, and whatever still points
// at the old number (an attached file, a link from another record) would
// silently attach itself to the new record.
//
// The highest number seen per kind is kept under
// runtruck-<company ID>-id-counters. context/AppShellContext.tsx raises it
// whenever a list changes (noteIds), so it survives deletions.
import { scopedKey } from './account';
import { onStorageChange, readJson, writeJson } from './storage';

const KEY = scopedKey('runtruck-id-counters');

function load(): Record<string, number> {
  const raw = readJson<Record<string, unknown>>(KEY);
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
  }
  return out;
}

let marks = load();

// Another tab created records: take the higher of each count.
onStorageChange(KEY, () => {
  const theirs = load();
  const merged = { ...marks };
  for (const [k, v] of Object.entries(theirs)) merged[k] = Math.max(merged[k] ?? 0, v);
  marks = merged;
});

// The number at the end of an id: 'L-40218' → 40218, 'WO-1001' → 1001.
export const serialOf = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0) || 0;

function highest(kind: string, ids: string[], serial: (id: string) => number): number {
  let top = marks[kind] ?? 0;
  for (const id of ids) {
    const n = serial(id);
    if (n > top) top = n;
  }
  return top;
}

// The next free number for a kind: above every id given, every number ever
// noted, and `floor` (where numbering starts).
export function nextSerial(kind: string, ids: string[], floor = 0, serial: (id: string) => number = serialOf): number {
  return Math.max(floor, highest(kind, ids, serial)) + 1;
}

// Remember the highest number among these ids, for good.
export function noteIds(kind: string, ids: string[], serial: (id: string) => number = serialOf) {
  const top = highest(kind, ids, serial);
  if (top <= (marks[kind] ?? 0)) return;
  marks = { ...marks, [kind]: top };
  writeJson(KEY, marks);
}

// For tests: forget everything noted.
export function resetIdCounters() {
  marks = {};
}

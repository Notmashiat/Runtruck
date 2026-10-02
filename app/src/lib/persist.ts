import { useEffect, useRef, useState } from 'react';
import { readScoped, scopedKey } from './account';
import { reportError } from './errorLog';
import { onStorageChange, readJson, readText, writeJson, writeText } from './storage';

// useState that survives reloads, stored under the account's company ID
// (lib/account.ts) through lib/storage.ts. `revive` gets the parsed value and
// returns what to use (or null when it does not fit, which gives the
// fallback).
//
// - Nothing is written until the value first changes, so built-in demo data
//   that was never edited is not frozen in storage (it moves with the date).
// - A save the browser refuses is reported and shown (see lib/storage.ts);
//   the value stays in memory.
// - When another tab saves the same key, this tab takes that value, so the
//   two never overwrite each other with an older copy.
// - Saved data that cannot be read is never silently replaced: unreadable
//   text is copied to '<key>-damaged', and single records that do not fit
//   are set aside by reviveList() below.
export function usePersisted<T>(key: string, fallback: T, revive: (raw: unknown) => T | null = (raw) => raw as T) {
  const [value, setValue] = useState<T>(() => {
    const raw = readScoped(key);
    if (raw === null) return fallback;
    try {
      const revived = revive(JSON.parse(raw));
      if (revived !== null) return revived;
    } catch {
      // Not JSON, or the reviver could not make sense of it.
    }
    setAside(scopedKey(key), raw);
    return fallback;
  });
  // The value storage holds (or, before the first save, the starting value).
  const synced = useRef(value);
  const reviveRef = useRef(revive);
  useEffect(() => {
    reviveRef.current = revive;
  });

  useEffect(() => {
    if (value === synced.current) return;
    synced.current = value;
    writeJson(scopedKey(key), value);
  }, [key, value]);

  useEffect(
    () =>
      onStorageChange(scopedKey(key), (raw) => {
        if (raw === null) return;
        try {
          const next = reviveRef.current(JSON.parse(raw));
          if (next === null) return;
          synced.current = next;
          setValue(next);
        } catch {
          // The other tab wrote something unreadable: keep what this tab has.
        }
      }),
    [key],
  );

  return [value, setValue] as const;
}

// — data that could not be read —

let problems = 0;

// Whether anything saved could not be read when this page loaded. While
// true, clean-up jobs that delete things "nothing points to" must not run:
// the records that point to them may be among the unreadable ones.
export function hadLoadProblems(): boolean {
  return problems > 0;
}

// Keep a copy of saved text that could not be read, before the next save
// replaces it, so a developer can recover it.
function setAside(scoped: string, raw: string) {
  problems += 1;
  const copy = `${scoped}-damaged`;
  if (readText(copy) !== raw) writeText(copy, raw);
  reportError(new Error(`Saved data under ${scoped} could not be read; a copy was kept under ${copy}`), { kind: 'storage', where: `Loading ${scoped}` });
}

const QUARANTINE_KEY = 'runtruck-quarantine';
const QUARANTINE_MAX = 200;

interface Quarantined {
  at: string;
  list: string;
  record: unknown;
}

// Records that could not be used are set aside here rather than thrown away,
// so a developer can look at them and put them back by hand.
function quarantine(list: string, records: unknown[]) {
  problems += 1;
  const key = scopedKey(QUARANTINE_KEY);
  const kept = readJson<Quarantined[]>(key);
  const have = Array.isArray(kept) ? kept : [];
  const seen = new Set(have.map((q) => JSON.stringify(q.record)));
  const fresh = records.filter((r) => !seen.has(JSON.stringify(r)));
  if (fresh.length === 0) return;
  const at = new Date().toISOString();
  writeJson(key, [...have, ...fresh.map((record) => ({ at, list, record }))].slice(-QUARANTINE_MAX));
  reportError(new Error(`${fresh.length} damaged ${list} record${fresh.length === 1 ? '' : 's'} could not be read and ${fresh.length === 1 ? 'was' : 'were'} set aside under ${key}`), { kind: 'storage', where: `Loading ${list}` });
}

// A saved list, record by record: the ones that pass `fits` are kept (and
// passed through `repair` to fill in fields added since they were saved);
// the rest are set aside. One damaged record no longer empties the list.
// Returns null when what was saved is not a list at all.
export function reviveList<T>(list: string, raw: unknown, fits: (record: Record<string, unknown>) => boolean, repair: (record: T) => T = (r) => r): T[] | null {
  if (!Array.isArray(raw)) return null;
  const good: T[] = [];
  const bad: unknown[] = [];
  for (const r of raw) {
    let ok = false;
    try {
      ok = Boolean(r) && typeof r === 'object' && fits(r as Record<string, unknown>);
    } catch {
      ok = false;
    }
    if (ok) good.push(repair(r as T));
    else bad.push(r);
  }
  if (bad.length) quarantine(list, bad);
  return good;
}

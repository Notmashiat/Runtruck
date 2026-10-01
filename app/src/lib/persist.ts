import { useEffect, useRef, useState } from 'react';
import { readScoped, scopedKey } from './account';

// useState that survives reloads via localStorage, stored under the account's
// company ID (lib/account.ts). `revive` gets the parsed
// value and returns what to use (or the fallback when it does not fit).
// Nothing is written until the value first changes, so built-in demo data
// that was never edited is not frozen in storage (it moves with the date).
export function usePersisted<T>(key: string, fallback: T, revive: (raw: unknown) => T | null = (raw) => raw as T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = readScoped(key);
      return raw === null ? fallback : revive(JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const first = useRef(value);

  useEffect(() => {
    if (value === first.current) return;
    try {
      localStorage.setItem(scopedKey(key), JSON.stringify(value));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

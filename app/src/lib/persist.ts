import { useEffect, useState } from 'react';

// useState that survives reloads via localStorage. `revive` gets the parsed
// value and returns what to use (or the fallback when it does not fit).
export function usePersisted<T>(key: string, fallback: T, revive: (raw: unknown) => T | null = (raw) => raw as T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : revive(JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

import { useEffect, useState } from 'react';
import { getSettings } from './settingsStore';

// The app's clock: today's date and the current time in the time zone chosen
// in Settings › Profile (or this device's), and the shifting that keeps the
// built-in demo records current.

// Settings › Profile time zones → IANA names. Anything else = this device.
const ZONES: Record<string, string> = {
  'Pacific Time (Los Angeles)': 'America/Los_Angeles',
  'Mountain Time (Denver)': 'America/Denver',
  'Arizona (Phoenix)': 'America/Phoenix',
  'Central Time (Chicago)': 'America/Chicago',
  'Eastern Time (New York)': 'America/New_York',
  'Alaska Time (Anchorage)': 'America/Anchorage',
  'Hawaii Time (Honolulu)': 'Pacific/Honolulu',
};

export function timeZone(): string | undefined {
  return ZONES[getSettings().profile.timeZone];
}

// 'YYYY-MM-DD' for a moment, in the chosen time zone.
export function isoDateAt(at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  }
}

export function todayIso(): string {
  return isoDateAt(new Date());
}

export function currentYear(): number {
  return Number(todayIso().slice(0, 4));
}

export function formatNow(at: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timeZone(), ...options }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(at);
  }
}

// The hour (0–23) now, in the chosen time zone.
export function hourNow(): number {
  return Number(formatNow(new Date(), { hour: 'numeric', hourCycle: 'h23' })) % 24;
}

// Re-renders every `ms` so clocks on screen stay right.
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

// — keeping the demo current —
//
// The built-in demo records were written around Thursday, September 3,
// 2026. They are moved by the number of days between then and today, so
// "today's" pickups are today and due dates stay the same distance away.
// Records you create or edit carry real dates and are never moved.

export const DEMO_ANCHOR = '2026-09-03';
const DEMO_YEAR = 2026;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOfUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const DEMO_SHIFT = Math.round((utc(todayIso()) - utc(DEMO_ANCHOR)) / 86_400_000);

export function shiftIso(iso: string): string {
  return isoOfUtc(utc(iso) + DEMO_SHIFT * 86_400_000);
}

// 'Oct 1' this year, 'Jan 4, 2027' in any other year.
export function shortDate(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const label = `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  return y === currentYear() ? label : `${label}, ${y}`;
}

// A short date as written in the app ('Oct 1', 'Mar 14, 2027') → ISO. With
// no year, it is this year.
export function isoFromText(s: string): string {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?$/.exec(s.trim());
  if (!m || !MON.includes(m[1])) return '';
  return `${m[3] ?? currentYear()}-${String(MON.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// Move every date inside a demo record: ISO dates, and short dates in text
// ('Sep 5', 'Mon Sep 7', 'Mar 14, 2027'; no year = 2026, as written).
function shiftText(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return shiftIso(s);
  return s.replace(/\b(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat) )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:, (\d{4}))?\b(?!\d)/g, (_m, dow: string | undefined, mon: string, day: string, year: string | undefined) => {
    const iso = shiftIso(`${year ?? DEMO_YEAR}-${String(MON.indexOf(mon) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`);
    const label = shortDate(iso);
    return dow ? `${DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${label}` : label;
  });
}

export function shiftDemo<T>(value: T): T {
  if (DEMO_SHIFT === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return shiftText(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

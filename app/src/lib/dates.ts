// Calendar date helpers. Dates travel as 'YYYY-MM-DD' strings and times as
// minutes after midnight; Date objects are only built in local time, so no
// timezone shifts creep in.
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function startOfWeek(d: Date, weekStart: number): Date {
  return addDays(d, -((d.getDay() - weekStart + 7) % 7));
}

// 'Sep 3' (the mock data's short dates) → '2026-09-03'.
export function shortToIso(s: string, year: number): string | null {
  const [mon, day] = s.trim().split(/\s+/);
  const m = MONTHS.findIndex((x) => x.startsWith(mon));
  const d = Number(day);
  return m >= 0 && d > 0 ? `${year}-${pad(m + 1)}-${pad(d)}` : null;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function toHhmm(min: number): string {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

export function formatTime(min: number, hour24: boolean): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  if (hour24) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${pad(m)} ${suffix}` : `${h12} ${suffix}`;
}

export function shortLabel(d: Date): string {
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

// Date arithmetic on 'YYYY-MM-DD' strings, the form every saved date has.
//
// All of it is done in UTC on whole days, so neither the computer's time
// zone nor daylight saving can move a date by a day. A value that is not a
// real 'YYYY-MM-DD' date (blank, or a typing slip like a five-digit year)
// gives '' (or NaN for a difference) instead of throwing, so one bad date in
// one record cannot take a screen down.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utcOf(iso: string): number {
  const m = ISO.exec(iso ?? '');
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  // Reject dates that do not exist ('2026-02-31' would roll into March).
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : NaN;
}

function isoOf(t: number): string {
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (y < 1 || y > 9999) return '';
  return `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Whether a value is a real date in 'YYYY-MM-DD' form.
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(utcOf(v));

// The date `n` days later (earlier when negative).
export function addDaysIso(iso: string, n: number): string {
  return isoOf(utcOf(iso) + n * DAY_MS);
}

// The date `n` months later, on the same day of the month, or on `day` when
// given (which keeps a monthly series on its day: the 31st, then Feb 28,
// then the 31st again). A shorter month gives its last day.
export function addMonthsIso(iso: string, n: number, day?: number): string {
  const t = utcOf(iso);
  if (!Number.isFinite(t)) return '';
  const from = new Date(t);
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return isoOf(Date.UTC(y, m, Math.min(day ?? from.getUTCDate(), last)));
}

// Whole days from `from` to `to` (negative when `to` is earlier; NaN when
// either is not a date).
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

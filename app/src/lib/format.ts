// How times saved with a record are shown (logs, "created", "paid").
import { formatNow, isoDateAt } from './clock';

// 'Oct 2, 2026, 1:00 AM' for a saved moment (an ISO time).
export const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : formatNow(d, { dateStyle: 'medium', timeStyle: 'short' });
};

// The calendar day of a saved moment, in the app's time zone. Demo records
// are stamped at noon UTC on their date, which is that date everywhere.
export const dayOf = (iso: string): string => {
  if (/T12:00:00\.000Z$/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : isoDateAt(d);
};

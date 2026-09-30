// Driver qualification documents, worked out from each driver's record (the
// dates on the Add / Edit driver form). Used by Fleet › Drivers (watchlist)
// and Safety › Driver documents.
import type { FleetDriver } from './fleet';
import { TODAY, addDays, daysFrom } from './invoicing';

export type DocStatus = 'Valid' | 'Expiring' | 'Expired' | 'Missing';

export interface DriverDoc {
  driverId: string;
  driver: string;
  document: string;
  // When it runs out ('' if missing). For the drug test: when it was taken.
  date: string;
  onFile?: boolean;
  status: DocStatus;
  tagClass: string;
}

// "Expiring" means within this many days of today.
export const RENEW_WINDOW = 60;

export const DOC_TAG: Record<DocStatus, string> = { Valid: 'tag-green', Expiring: 'tag-outline', Expired: 'tag-outline', Missing: 'tag-outline' };
const ORDER: Record<DocStatus, number> = { Expired: 0, Missing: 1, Expiring: 2, Valid: 3 };

// MVR review, annual review and Clearinghouse query are due a year after the last one.
const nextYear = (iso: string) => (/^\d{4}-/.test(iso) ? `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}` : '');

function status(date: string): DocStatus {
  if (!date) return 'Missing';
  const left = daysFrom(TODAY, date);
  return left < 0 ? 'Expired' : left <= RENEW_WINDOW ? 'Expiring' : 'Valid';
}

export function driverDocuments(drivers: FleetDriver[]): DriverDoc[] {
  const out: DriverDoc[] = [];
  for (const d of drivers.filter((x) => !x.archived)) {
    const v = d.details;
    const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
    const endorsements = Array.isArray(v.endorsements) ? v.endorsements : [];
    const hazmat = endorsements.some((e) => e.startsWith('H') || e.startsWith('X')) || s('hazmatExpiry');
    const add = (document: string, date: string) => {
      const st = status(date);
      out.push({ driverId: d.id, driver: d.name, document, date, status: st, tagClass: DOC_TAG[st] });
    };
    add('CDL', s('cdlExpiry'));
    add('Medical card', s('medicalExpiry'));
    if (hazmat) add('Hazmat endorsement', s('hazmatExpiry'));
    if (s('twicExpiry')) add('TWIC card', s('twicExpiry'));
    add('MVR review', nextYear(s('mvrDate')));
    add('Annual review', nextYear(s('annualReviewDate')));
    add('Clearinghouse query', nextYear(s('clearinghouseDate')));
    const drug = s('drugTestDate');
    out.push({
      driverId: d.id, driver: d.name, document: 'Pre-employment drug test', date: drug, onFile: Boolean(drug),
      status: drug ? 'Valid' : 'Missing', tagClass: DOC_TAG[drug ? 'Valid' : 'Missing'],
    });
  }
  return out;
}

// Most urgent first: expired, missing, expiring (soonest first), then valid.
export function byUrgency(a: DriverDoc, b: DriverDoc) {
  return ORDER[a.status] - ORDER[b.status] || (a.date || '9999').localeCompare(b.date || '9999') || a.driver.localeCompare(b.driver);
}

export const renewBy = () => addDays(TODAY, RENEW_WINDOW);

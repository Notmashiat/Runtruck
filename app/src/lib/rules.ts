// Field checks shared by the record forms: each returns a message when the
// value is not acceptable, or null.

export const STATE = (value: string) => (/^[A-Z]{2}$/.test(value.toUpperCase()) ? null : 'Two-letter state, e.g. CA');
export const ZIP = (value: string) => (/^\d{5}(-\d{4})?$/.test(value) ? null : 'Five digits, e.g. 95355');
export const PHONE = (value: string) => (value.replace(/\D/g, '').length >= 10 ? null : 'Ten digits, e.g. (209) 555-0147');
export const POSITIVE = (value: string) => (Number(value) > 0 ? null : 'Must be more than 0');
export const NON_NEGATIVE = (value: string) => (Number(value) >= 0 ? null : 'Cannot be negative');
export const YEAR = (value: string) => (/^\d{4}$/.test(value) && Number(value) >= 1980 && Number(value) <= 2027 ? null : 'Model year between 1980 and 2027');
// 17 characters, no I, O or Q (they are never used in a VIN).
export const VIN = (value: string) => (/^[A-HJ-NPR-Z0-9]{17}$/.test(value.toUpperCase()) ? null : '17 letters and digits, no I, O or Q');
export const UNIQUE = (taken: string[], what: string) => (value: string) =>
  taken.some((t) => t.toUpperCase() === value.trim().toUpperCase()) ? `Another ${what} already uses ${value.trim().toUpperCase()}` : null;

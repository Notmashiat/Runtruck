import { describe, expect, it } from 'vitest';
import { addDaysIso, addMonthsIso, daysBetweenIso, isIsoDate } from './isoDates';

describe('isIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('20260-01-01')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe('addDaysIso', () => {
  it('crosses months and years', () => {
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('gives an empty string for a bad date instead of throwing', () => {
    expect(addDaysIso('', 7)).toBe('');
    expect(addDaysIso('202611-01-01', 7)).toBe('');
  });
});

describe('addMonthsIso', () => {
  it('uses the last day of a shorter month', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('returns to the anchor day after a short month', () => {
    expect(addMonthsIso('2026-02-28', 1, 31)).toBe('2026-03-31');
  });

  it('gives an empty string for a bad date', () => {
    expect(addMonthsIso('nope', 1)).toBe('');
  });
});

describe('daysBetweenIso', () => {
  it('counts whole days, negative when the second date is earlier', () => {
    expect(daysBetweenIso('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetweenIso('2026-10-31', '2026-10-01')).toBe(-30);
  });

  it('is NaN when either date is not a date', () => {
    expect(daysBetweenIso('', '2026-10-01')).toBeNaN();
  });
});

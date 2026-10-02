// The rules of loads, contracts and safety records.
import { describe, expect, it } from 'vitest';
import { currentEnd, parseOffer } from './hrRecords';
import { deliveryIso, isDelivered, lineHaulOf, loadTotal, withStatus } from './loads';
import type { Load } from './mock';
import { countsAgainst, isRemoved, weightedPoints, type ViolationRecord } from './safetyRecords';

describe('loads', () => {
  const load = {
    id: 'L-1', customer: 'Acme', status: 'In transit', rate: '$2,000', pickup: 'Dec 30', delivery: 'Jan 2, 2027',
    pickupDate: '2026-12-30', deliveryDate: '2027-01-02', charges: { lineHaul: 2000, fuel: 240, accessorials: 150 }, history: [],
  } as unknown as Load;

  it('bills line haul, fuel surcharge and accessorials', () => {
    expect(lineHaulOf(load)).toBe(2000);
    expect(loadTotal(load)).toBe(2390);
  });

  it('falls back to the rate for loads saved before charges were kept', () => {
    expect(loadTotal({ rate: '$1,850', charges: undefined })).toBe(1850);
  });

  it('records the delivery day and a history line when delivered', () => {
    const done = withStatus(load, 'Delivered', 'Rosa', '2027-01-03');
    expect(done.status).toBe('Delivered');
    expect(isDelivered(done.status)).toBe(true);
    expect(deliveryIso(done)).toBe('2027-01-03');
    expect(done.history?.at(-1)?.what).toBe('Status: In transit → Delivered');
  });

  it('forgets the delivery day when a load goes back on the road', () => {
    const done = withStatus(load, 'Delivered', 'Rosa', '2027-01-03');
    expect(deliveryIso(withStatus(done, 'In transit', 'Rosa'))).toBe('2027-01-02');
  });
});

describe('contracts', () => {
  it('reads an offer as it is usually written', () => {
    expect(parseOffer('58 cpm')).toEqual({ payBasis: 'Per mile', rate: 0.58 });
    expect(parseOffer('$.62 / mi')).toEqual({ payBasis: 'Per mile', rate: 0.62 });
    expect(parseOffer('27% of line haul')).toEqual({ payBasis: '% of line haul', rate: 27 });
    expect(parseOffer('to be agreed')).toBeNull();
  });

  it('renews from the original end date, without drifting off the 31st', () => {
    const c = { termType: 'Fixed term', end: '2025-08-31', renewal: 'Renews automatically', termLength: '6 months' } as Parameters<typeof currentEnd>[0];
    expect(currentEnd(c, '2026-03-15')).toBe('2026-08-31');
  });

  it('has no end date when the saved one is not a date', () => {
    const c = { termType: 'Fixed term', end: '20260-01-01', renewal: 'Renews automatically', termLength: '1 year' } as Parameters<typeof currentEnd>[0];
    expect(currentEnd(c, '2026-03-15')).toBe('');
  });
});

describe('violations', () => {
  const v = (more: Partial<ViolationRecord>) => ({ basic: 'Vehicle maintenance', severity: 4, oos: false, date: '2026-09-01', status: 'Open', resolution: '', ...more }) as ViolationRecord;
  const today = '2026-10-02';

  it('weights a recent violation three times, more when out of service', () => {
    expect(weightedPoints(v({}), today)).toBe(12);
    expect(weightedPoints(v({ oos: true }), today)).toBe(18);
  });

  it('does not count a violation removed through DataQs or dismissed in court', () => {
    const removed = v({ status: 'Closed', resolution: 'Removed through DataQs' });
    expect(isRemoved(removed)).toBe(true);
    expect(countsAgainst(removed)).toBe(false);
    expect(weightedPoints(removed, today)).toBe(0);
    expect(weightedPoints(v({ status: 'Closed', resolution: 'Dismissed in court' }), today)).toBe(0);
  });

  it('still counts a violation that was closed by paying the fine', () => {
    expect(countsAgainst(v({ status: 'Closed', resolution: 'Fine paid' }))).toBe(true);
  });
});

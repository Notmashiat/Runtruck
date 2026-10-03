// The rules of loads, contracts and safety records.
import { describe, expect, it } from 'vitest';
import { coDriverOf, drivingModeOf, type FleetDriver } from './fleet';
import { currentEnd, parseOffer } from './hrRecords';
import { billingByLoad, deliveryIso, isDelivered, lineHaulOf, loadTotal, pipelineSteps, stageOf, stageSlug, statusForStage, withStatus } from './loads';
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

describe('load pipeline', () => {
  const load = (id: string, status: string) => ({ id, status });
  const invoices = [
    { loads: ['L-5'], draft: false, paid: undefined },
    { loads: ['L-6'], draft: false, paid: { date: '2026-10-01' } },
    { loads: ['L-7'], draft: true, paid: undefined },
  ];
  const billing = billingByLoad(invoices);

  it('follows the status until the load is delivered', () => {
    expect(stageOf(load('L-1', 'Needs driver'), billing)).toBe('Booked');
    expect(stageOf(load('L-2', 'Dispatched'), billing)).toBe('Dispatched');
    expect(['At pickup', 'In transit', 'Delayed'].map((s) => stageOf(load('L-3', s), billing))).toEqual(['En route', 'En route', 'En route']);
    expect(stageOf(load('L-4', 'Needs POD'), billing)).toBe('Delivered');
  });

  it('follows the invoice after that; a draft does not count', () => {
    expect(stageOf(load('L-5', 'Delivered'), billing)).toBe('Invoiced');
    expect(stageOf(load('L-6', 'Delivered'), billing)).toBe('Complete');
    expect(stageOf(load('L-7', 'Delivered'), billing)).toBe('Delivered');
  });

  it('is not complete while any invoice for the load is unpaid', () => {
    const two = billingByLoad([{ loads: ['L-8'], draft: false, paid: { date: '2026-10-01' } }, { loads: ['L-8'], draft: false }]);
    expect(stageOf(load('L-8', 'Delivered'), two)).toBe('Invoiced');
  });

  it('keeps a booked load with its driver lined up at Booked', () => {
    expect(stageOf(load('L-9', 'Booked'), billing)).toBe('Booked');
  });

  it('moves a load to a stage by giving it that stage’s status', () => {
    expect(statusForStage('Booked', true)).toBe('Booked');
    expect(statusForStage('Booked', false)).toBe('Needs driver');
    expect(statusForStage('Dispatched', true)).toBe('Dispatched');
    expect(statusForStage('En route', true)).toBe('In transit');
    expect(statusForStage('Delivered', true)).toBe('Delivered');
    expect(statusForStage('Invoiced', true)).toBeNull();
  });

  it('knows the stages either side, and only steps back by hand through the first four', () => {
    expect(pipelineSteps('Booked')).toEqual({ back: null, next: 'Dispatched' });
    expect(pipelineSteps('En route')).toEqual({ back: 'Dispatched', next: 'Delivered' });
    expect(pipelineSteps('Delivered')).toEqual({ back: 'En route', next: 'Invoiced' });
    expect(pipelineSteps('Invoiced')).toEqual({ back: null, next: 'Complete' });
    expect(pipelineSteps('Complete')).toEqual({ back: null, next: null });
  });

  it('puts the stage in the page address', () => {
    expect(stageSlug('En route')).toBe('en-route');
  });
});

describe('driver card', () => {
  const d = (id: string, name: string, details: Record<string, unknown>) => ({ id, name, details }) as unknown as FleetDriver;

  it('reads how a driver runs, with older drivers counted from their driver type', () => {
    expect(drivingModeOf(d('D-1', 'A', { drivingMode: 'Strong solo' }))).toBe('Strong solo');
    expect(drivingModeOf(d('D-2', 'B', { driverType: 'Team driver' }))).toBe('Team');
    expect(drivingModeOf(d('D-3', 'C', { driverType: 'Company driver (W-2)' }))).toBe('Solo');
  });

  it('finds the co-driver from either side of the team', () => {
    const a = d('D-1', 'Ana Cortez', { drivingMode: 'Team', coDriver: 'Ben Hale' });
    const b = d('D-2', 'Ben Hale', { drivingMode: 'Team' });
    const c = d('D-3', 'Cy Diaz', { drivingMode: 'Team' });
    expect(coDriverOf(a, [a, b, c])?.name).toBe('Ben Hale');
    expect(coDriverOf(b, [a, b, c])?.name).toBe('Ana Cortez');
    expect(coDriverOf(c, [a, b, c])).toBeUndefined();
  });
});

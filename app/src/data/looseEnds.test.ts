// Free trials, the live driver roster, planner windows and release numbers.
import { describe, expect, it } from 'vitest';
import { dialable, loadMessage } from '../components/MessageDriverDialog';
import { versionIdTaken } from '../lib/releases';
import { removeKeysWithPrefix } from '../lib/storage';
import { trialDaysLeft, trialEnded } from './companies';
import { driverStats, driversOn } from './driverStats';
import type { Load } from './mock';
import type { Employee, PayRun } from './payroll';
import { windowOf } from './planner';
import { RELEASES } from './releases';

describe('free trials', () => {
  const trial = (trialEnds: string) => ({ status: 'Trial' as const, trialEnds });

  it('runs through its last day and is over the day after', () => {
    expect(trialEnded(trial('2026-10-09'), '2026-10-09')).toBe(false);
    expect(trialEnded(trial('2026-10-09'), '2026-10-10')).toBe(true);
  });

  it('never locks out a paying company, or one with no usable end date', () => {
    expect(trialEnded({ status: 'Active', trialEnds: '2020-01-01' }, '2026-10-10')).toBe(false);
    expect(trialEnded(trial(''), '2026-10-10')).toBe(false);
    expect(trialEnded(trial('20260-10-09'), '2026-10-10')).toBe(false);
  });

  it('counts the days left, today included', () => {
    expect(trialDaysLeft(trial('2026-10-09'), '2026-10-09')).toBe(1);
    expect(trialDaysLeft(trial('2026-10-09'), '2026-10-03')).toBe(7);
    expect(trialDaysLeft(trial('2026-10-09'), '2026-11-01')).toBe(0);
    expect(trialDaysLeft({ status: 'Active', trialEnds: '2026-10-09' }, '2026-10-03')).toBeNull();
  });
});

describe('driver roster figures', () => {
  // 2 Oct 2026 is a Friday; that week's Monday is 28 Sep.
  const today = '2026-10-02';
  const load = (more: Partial<Load>) => ({ id: 'L-1', driver: 'Marcus Hale', status: 'Delivered', route: 'Fresno, CA → Reno, NV', miles: '300', rate: '$1,000', pickup: '', delivery: '', ...more }) as unknown as Load;
  const loads = [
    load({ id: 'L-1', deliveredOn: '2026-09-29', miles: '300' }),
    load({ id: 'L-2', deliveredOn: '2026-09-25', miles: '900' }),
    load({ id: 'L-3', status: 'Dispatched', route: 'Reno, NV → Boise, ID' }),
    load({ id: 'L-4', status: 'In transit', route: 'Fresno, CA → Reno, NV' }),
    load({ id: 'L-5', driver: 'Marcus Hale / Dara Whitfield', deliveredOn: '2026-10-01', miles: '1,200' }),
    load({ id: 'L-6', driver: 'Unassigned', status: 'Needs driver' }),
  ];
  const employees = [{ id: 'E-1', driver: 'Marcus Hale', ytdBefore: 0, created: '2026-01-05T12:00:00.000Z' }] as unknown as Employee[];
  const payRuns = [{ id: 'PR-1', status: 'Paid', payDate: '2026-09-04', lines: [{ employeeId: 'E-1', gross: 1500, net: 1200, hold: false }] }] as unknown as PayRun[];
  const stats = driverStats(loads, employees, payRuns, today);

  it('reads the drivers on a load, team or solo', () => {
    expect(driversOn({ driver: 'Marcus Hale / Dara Whitfield' })).toEqual(['Marcus Hale', 'Dara Whitfield']);
    expect(driversOn({ driver: 'Unassigned' })).toEqual([]);
  });

  it('shows the load the driver is on now, the one on the road first', () => {
    expect(stats.get('Marcus Hale')?.load).toBe('L-4 · Fresno → Reno');
    expect(stats.get('Dara Whitfield')?.load).toBe('—');
  });

  it('adds up the miles delivered since Monday', () => {
    expect(stats.get('Marcus Hale')?.miles).toBe(1500);
    expect(stats.get('Dara Whitfield')?.miles).toBe(1200);
  });

  it('takes pay this year from the pay runs, and has none for a driver not on payroll', () => {
    expect(stats.get('Marcus Hale')?.pay).toBe(1500);
    expect(stats.get('Dara Whitfield')?.pay).toBeNull();
  });
});

describe('message driver', () => {
  it('writes the stops, reference and freight', () => {
    const l = {
      id: 'L-7', customer: 'Acme', ref: 'PO 12', commodity: 'Produce', weight: '40,000 lb', driver: 'Marcus Hale',
      stops: [
        { kind: 'Pickup', name: 'Acme DC', address: '1 Main St, Fresno, CA', when: 'Oct 3 · 08:00–10:00' },
        { kind: 'Delivery', name: 'Reno Grocers', address: '9 Lake Rd, Reno, NV', when: 'Oct 4 · 06:00–12:00' },
      ],
    } as unknown as Load;
    expect(loadMessage(l)).toBe([
      'Load L-7 (Acme)',
      'Pickup: Acme DC, 1 Main St, Fresno, CA — Oct 3 · 08:00–10:00',
      'Delivery: Reno Grocers, 9 Lake Rd, Reno, NV — Oct 4 · 06:00–12:00',
      'Ref: PO 12',
      'Freight: Produce, 40,000 lb',
    ].join('\n'));
  });

  it('turns a phone number into one a link can dial', () => {
    expect(dialable('(209) 555-0147')).toBe('+12095550147');
    expect(dialable('1-209-555-0147')).toBe('+12095550147');
    expect(dialable('+44 20 7946 0958')).toBe('+442079460958');
    expect(dialable('')).toBe('');
  });
});

describe('planner windows', () => {
  it('uses the window as written', () => {
    expect(windowOf('08:00–10:00')).toEqual(['08:00', '10:00']);
    expect(windowOf('8:00–9:30')).toEqual(['08:00', '09:30']);
  });

  it('gives a window with one time an hour from that time', () => {
    expect(windowOf('14:30')).toEqual(['14:30', '15:30']);
    expect(windowOf('14:30–')).toEqual(['14:30', '15:30']);
  });

  it('shows a window past midnight to the end of its day', () => {
    expect(windowOf('22:00–02:00')).toEqual(['22:00', '23:59']);
    expect(windowOf('23:30')).toEqual(['23:30', '23:59']);
  });

  it('falls back to the morning when there is no time', () => {
    expect(windowOf('')).toEqual(['08:00', '09:00']);
  });
});

describe('merged version numbers', () => {
  const blank = { assignments: {}, defaults: [], merges: [], log: [] } as unknown as Parameters<typeof versionIdTaken>[2];
  const [a, b, c] = RELEASES.slice(-3).map((r) => r.id);

  it('may reuse the number of a release being merged', () => {
    expect(versionIdTaken(b, [b, c], blank)).toBe(false);
    expect(versionIdTaken('9.9', [b, c], blank)).toBe(false);
  });

  it('may not take the number of a release outside the merge', () => {
    expect(versionIdTaken(a, [b, c], blank)).toBe(true);
  });

  it('may not take another merged version’s number', () => {
    const s = { ...blank, merges: [{ id: '5.0', title: '', releases: [a], at: '', byName: '' }] } as typeof blank;
    expect(versionIdTaken('5.0', [b, c], s)).toBe(true);
  });
});

describe('deleting a company’s records', () => {
  it('removes that company’s keys and nobody else’s', () => {
    localStorage.setItem('runtruck-12-loads', '[]');
    localStorage.setItem('runtruck-12-invoices', '[]');
    localStorage.setItem('runtruck-123-loads', '[]');
    localStorage.setItem('runtruck-1-loads', '[]');
    expect(removeKeysWithPrefix('runtruck-12-')).toBe(2);
    expect(localStorage.getItem('runtruck-12-loads')).toBeNull();
    expect(localStorage.getItem('runtruck-123-loads')).toBe('[]');
    expect(localStorage.getItem('runtruck-1-loads')).toBe('[]');
  });
});

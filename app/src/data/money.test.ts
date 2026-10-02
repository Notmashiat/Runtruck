// The money and date rules of invoicing, bills and payroll.
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdCounters } from '../lib/ids';
import { nextDate } from './bills';
import { batchStatus, batchTotal, invoiceSerial, nextInvoiceId, round2, type Batch, type InvoiceRecord } from './invoicing';
import { defaultPeriod, paidDay, paidSummary, ytdAsOf, type Employee, type PayLine, type PayRun } from './payroll';

beforeEach(() => resetIdCounters());

const invoice = (id: string, amount: number, paid = false) =>
  ({ id, paid, lines: [{ kind: 'Line haul', description: '', qty: '1', rate: String(amount) }] }) as unknown as InvoiceRecord;

describe('round2', () => {
  it('rounds half a cent up', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1234.565)).toBe(1234.57);
  });

  it('rounds negative amounts the same way', () => {
    expect(round2(-1.005)).toBe(-1.01);
  });
});

describe('invoice numbers', () => {
  it('reads the number after the prefix, even when the prefix has a digit', () => {
    expect(invoiceSerial('INV-1042', 'INV-')).toBe(1042);
    expect(invoiceSerial('2026-17', '2026-')).toBe(17);
  });

  it('gives the next number, and starts where Settings says', () => {
    expect(nextInvoiceId([invoice('INV-1042', 100)], 'INV-', '1')).toBe('INV-1043');
    expect(nextInvoiceId([], 'A', '500')).toBe('A500');
  });
});

describe('batches', () => {
  const invoices = [invoice('INV-1', 100, true), invoice('INV-2', 250.5, true), invoice('INV-3', 40)];
  const batch = (ids: string[], sentOn?: string) => ({ id: 'B-1', invoiceIds: ids, sentOn }) as unknown as Batch;

  it('adds up its invoices', () => {
    expect(batchTotal(batch(['INV-1', 'INV-2']), invoices)).toBe(350.5);
  });

  it('skips an invoice that no longer exists', () => {
    expect(batchTotal(batch(['INV-1', 'INV-gone']), invoices)).toBe(100);
  });

  it('is settled only when every invoice is paid', () => {
    expect(batchStatus(batch(['INV-1', 'INV-2'], '2026-09-01'), invoices)).toBe('Settled');
    expect(batchStatus(batch(['INV-1', 'INV-3'], '2026-09-01'), invoices)).toBe('Sent');
    expect(batchStatus(batch(['INV-3']), invoices)).toBe('Ready');
  });
});

describe('recurring bills', () => {
  it('keeps a monthly bill on its day after a short month', () => {
    const feb = nextDate('2026-01-31', 'Monthly', 31);
    expect(feb).toBe('2026-02-28');
    expect(nextDate(feb, 'Monthly', 31)).toBe('2026-03-31');
  });

  it('moves weekly bills by seven days', () => {
    expect(nextDate('2026-12-28', 'Weekly')).toBe('2027-01-04');
  });
});

describe('pay periods', () => {
  // 2 Oct 2026 is a Friday.
  const today = '2026-10-02';

  it('carries on from the day after the last run', () => {
    expect(defaultPeriod('Weekly', today, '2026-09-20')).toEqual({ start: '2026-09-21', end: '2026-09-27', payDate: '2026-10-02' });
  });

  it('splits a month in two', () => {
    expect(defaultPeriod('Twice a month', today, '2026-09-15')).toEqual({ start: '2026-09-16', end: '2026-09-30', payDate: '2026-10-05' });
  });

  it('never offers a pay date that has passed', () => {
    expect(defaultPeriod('Weekly', today, '2026-08-02').payDate >= today).toBe(true);
    expect(defaultPeriod('Monthly', today).payDate >= today).toBe(true);
  });
});

describe('what was paid', () => {
  const line = (employeeId: string, gross: number, net: number, more: Partial<PayLine> = {}) => ({ employeeId, gross, net, hold: false, ...more }) as unknown as PayLine;
  const run = (id: string, payDate: string, status: string, lines: PayLine[]) => ({ id, payDate, status, lines }) as unknown as PayRun;
  const ann = { id: 'E-1', ytdBefore: 5000, ytdBeforeYear: 2026, created: '2026-03-01T12:00:00.000Z' } as unknown as Employee;
  const runs = [
    run('PR-1', '2026-09-04', 'Paid', [line('E-1', 1000, 800)]),
    run('PR-2', '2026-09-18', 'Paid', [line('E-1', 1200, 950, { hold: true })]),
    run('PR-3', '2026-10-02', 'Approved', [line('E-1', 900, 700)]),
    run('PR-0', '2025-12-19', 'Paid', [line('E-1', 700, 600)]),
  ];

  it('counts paid runs of the year, plus pay from before RunTruck', () => {
    expect(paidSummary(runs, [ann], '2026').get('E-1')).toEqual({ gross: 6000, net: 800, lastPaid: '2026-09-04' });
  });

  it('does not add last year’s "before RunTruck" figure to this year', () => {
    const old = { ...ann, ytdBeforeYear: 2025 } as Employee;
    expect(paidSummary(runs, [old], '2026').get('E-1')?.gross).toBe(1000);
  });

  it('counts held pay on the day it was released', () => {
    const released = line('E-1', 1200, 950, { paidOn: '2026-10-01' });
    expect(paidDay(runs[1], released)).toBe('2026-10-01');
    expect(paidDay(runs[0], runs[0].lines[0])).toBe('2026-09-04');
  });

  it('prints year to date as of the statement’s own run', () => {
    expect(ytdAsOf(runs, ann, runs[0], runs[0].lines[0])).toEqual({ gross: 6000, net: 800 });
    // The October statement includes itself although the run is not paid yet.
    expect(ytdAsOf(runs, ann, runs[2], runs[2].lines[0])).toEqual({ gross: 6900, net: 1500 });
  });
});

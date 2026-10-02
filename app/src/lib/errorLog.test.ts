import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrorLog, describeError, getErrorLog, isLoadFailure, reportError } from './errorLog';

describe('error log', () => {
  beforeEach(() => {
    clearErrorLog();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('records what went wrong, where, and for whom', () => {
    const entry = reportError(new Error('rate is not a number'), { kind: 'screen', where: 'Page', componentStack: '\n    at PayrollTab' });
    expect(entry.id).toMatch(/^ERR-[A-Z0-9]+$/);
    expect(entry.message).toBe('rate is not a number');
    expect(entry.stack).toContain('at PayrollTab');
    expect(entry.companyId).toBe('1');
    expect(getErrorLog()[0]).toEqual(entry);
  });

  it('counts a repeat of the same problem instead of adding a second entry', () => {
    const first = reportError(new Error('boom'), { kind: 'script', where: 'Action' });
    const again = reportError(new Error('boom'), { kind: 'script', where: 'Action' });
    expect(getErrorLog()).toHaveLength(1);
    expect(again.id).toBe(first.id);
    expect(again.count).toBe(2);
  });

  it('keeps only the newest 50 entries', () => {
    for (let i = 0; i < 60; i += 1) reportError(new Error(`problem ${i}`), { kind: 'script', where: 'Action' });
    expect(getErrorLog()).toHaveLength(50);
    expect(getErrorLog()[0].message).toBe('problem 59');
  });

  it('never throws, whatever is thrown at it', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => reportError(circular, { kind: 'promise', where: 'Background task' })).not.toThrow();
    expect(() => reportError(undefined, { kind: 'promise', where: 'Background task' })).not.toThrow();
  });

  it('survives storage that refuses to save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => reportError(new Error('still recorded'), { kind: 'script', where: 'Action' })).not.toThrow();
    expect(getErrorLog()[0].message).toBe('still recorded');
  });

  it('describes an entry as text a person can send to support', () => {
    const text = describeError(reportError(new Error('boom'), { kind: 'screen', where: 'Top bar' }));
    expect(text).toContain('RunTruck error ERR-');
    expect(text).toContain('Where: Top bar');
    expect(text).toContain('Company ID: 1');
    expect(text).toContain('Message: boom');
  });

  it('tells a failed download from a fault in the page', () => {
    expect(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/LoadsPage-abc.js'))).toBe(true);
    expect(isLoadFailure(new TypeError('Cannot read properties of undefined (reading "name")'))).toBe(false);
  });
});

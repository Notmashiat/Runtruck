import { beforeEach, describe, expect, it } from 'vitest';
import { nextSerial, noteIds, resetIdCounters, serialOf } from './ids';

beforeEach(() => resetIdCounters());

describe('record numbers', () => {
  it('reads the number at the end of an id', () => {
    expect(serialOf('L-40218')).toBe(40218);
    expect(serialOf('WO-1001')).toBe(1001);
    expect(serialOf('none')).toBe(0);
  });

  it('gives the number after the highest one in use', () => {
    expect(nextSerial('L', ['L-7', 'L-12', 'L-9'])).toBe(13);
  });

  it('starts from the floor when nothing is higher', () => {
    expect(nextSerial('B', [], 2028)).toBe(2029);
  });

  it('never gives a deleted record’s number to a new record', () => {
    noteIds('L', ['L-7', 'L-12']);
    // L-12 has been deleted since.
    expect(nextSerial('L', ['L-7'])).toBe(13);
  });
});

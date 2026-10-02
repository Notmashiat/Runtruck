import { describe, expect, it } from 'vitest';
import { bornAt, freeId, mergeChanges } from './mergeLists';

const a = { id: 'CUS-1', name: 'A' };
const b = { id: 'CUS-2', name: 'B' };

describe('mergeChanges', () => {
  it('keeps what the other tab added and what this tab added', () => {
    const base = [a];
    const ours = [a, { id: 'CUS-2', name: 'Ours' }];
    const theirs = [a, { id: 'CUS-3', name: 'Theirs' }];
    expect(mergeChanges(base, ours, theirs).map((r) => r.name)).toEqual(['A', 'Theirs', 'Ours']);
  });

  it('keeps an edit made here and an edit made there, to different records', () => {
    const base = [a, b];
    const ours = [{ ...a, name: 'A edited here' }, b];
    const theirs = [a, { ...b, name: 'B edited there' }];
    expect(mergeChanges(base, ours, theirs).map((r) => r.name)).toEqual(['A edited here', 'B edited there']);
  });

  it('removes what this tab deleted, and what the other tab deleted', () => {
    const c = { id: 'CUS-3', name: 'C' };
    expect(mergeChanges([a, b, c], [a, c], [a, b]).map((r) => r.id)).toEqual(['CUS-1']);
  });

  it('gives a new number to a record both tabs added under the same id', () => {
    const base = [a];
    const ours = [a, { id: 'CUS-2', name: 'Ours' }];
    const theirs = [a, { id: 'CUS-2', name: 'Theirs' }];
    expect(mergeChanges(base, ours, theirs)).toEqual([a, { id: 'CUS-2', name: 'Theirs' }, { id: 'CUS-3', name: 'Ours' }]);
  });

  it('does not double a record both tabs saved identically', () => {
    const same = { id: 'CUS-2', name: 'Same' };
    expect(mergeChanges([a], [a, same], [a, { ...same }])).toHaveLength(2);
  });

  it('keeps this tab’s edit of a record the other tab deleted', () => {
    const edited = { ...b, name: 'B edited here' };
    expect(mergeChanges([a, b], [a, edited], [a])).toEqual([a, edited]);
  });

  it('keeps a record added at the top of the list at the top', () => {
    const base = [a];
    const ours = [{ id: 'L-3', name: 'New here' }, a];
    const theirs = [{ id: 'L-2', name: 'New there' }, a];
    expect(mergeChanges(base, ours, theirs).map((r) => r.id)).toEqual(['L-3', 'L-2', 'CUS-1']);
  });

  it('uses this tab’s value for anything that is not a list of records', () => {
    expect(mergeChanges({ x: 1 }, { x: 2 }, { x: 3 })).toEqual({ x: 2 });
    expect(mergeChanges(['a'], ['b'], ['c'])).toEqual(['b']);
  });
});

describe('freeId', () => {
  it('takes the next number above every id with the same prefix', () => {
    expect(freeId('CUS-1004', ['CUS-1004', 'CUS-1005', 'L-9000'])).toBe('CUS-1006');
    expect(freeId('INV-8846', ['INV-8846'])).toBe('INV-8847');
    expect(freeId('draft', [])).toBe('draft-2');
  });
});

describe('bornAt', () => {
  it('reads when a record was made, however its kind notes it', () => {
    expect(bornAt({ created: '2026-10-02T10:00:00.000Z' })).toBe('2026-10-02T10:00:00.000Z');
    expect(bornAt({ history: [{ at: '2026-10-01T09:00:00.000Z' }, { at: '2026-10-02T09:00:00.000Z' }] })).toBe('2026-10-01T09:00:00.000Z');
    expect(bornAt({ id: 'T-1' })).toBe('');
  });
});

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onStorageChange, readJson, removeKey, storageUsage, useStorageProblem, writeJson } from './storage';

describe('storage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('saves and reads back a value', () => {
    expect(writeJson('runtruck-1-test', { a: 1 })).toBe(true);
    expect(readJson('runtruck-1-test')).toEqual({ a: 1 });
  });

  it('reads damaged data as nothing instead of throwing', () => {
    localStorage.setItem('runtruck-1-test', '{not json');
    expect(readJson('runtruck-1-test')).toBeNull();
  });

  it('reports a full browser and clears the warning once the save works again', () => {
    const { result } = renderHook(() => useStorageProblem());
    expect(result.current).toBeNull();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    act(() => {
      expect(writeJson('runtruck-1-loads', [1, 2, 3])).toBe(false);
    });
    expect(result.current).toBe('full');

    setItem.mockRestore();
    act(() => {
      expect(writeJson('runtruck-1-loads', [1, 2, 3])).toBe(true);
    });
    expect(result.current).toBeNull();
  });

  it('reports blocked storage as blocked', () => {
    const { result } = renderHook(() => useStorageProblem());
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    act(() => {
      writeJson('runtruck-1-settings', {});
    });
    expect(result.current).toBe('blocked');
    setItem.mockRestore();
    act(() => removeKey('runtruck-1-settings'));
    expect(result.current).toBeNull();
  });

  it('measures how much is stored', () => {
    localStorage.setItem('abc', '12345');
    expect(storageUsage().used).toBe(8);
  });

  it('passes on a change made in another tab, for its own key only', () => {
    const seen: (string | null)[] = [];
    const stop = onStorageChange('runtruck-1-loads', (raw) => seen.push(raw));
    window.dispatchEvent(new StorageEvent('storage', { key: 'runtruck-1-loads', newValue: '[1]', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'runtruck-1-bills', newValue: '[2]', storageArea: localStorage }));
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: 'runtruck-1-loads', newValue: '[3]', storageArea: localStorage }));
    expect(seen).toEqual(['[1]']);
  });
});

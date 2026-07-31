/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { clearProgressMirror, getProgress, readProgressMap, saveProgress } from '@/lib/apis';
import { namespacedKey } from '@/lib/local-store';
import { shouldPersistQueryKey } from '@/lib/offline';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The on-device partitioning guarantees behind WNW-02/03: per-user state must never reach the persisted
 * query cache, and the localStorage mirror must isolate one account's reading history from another's. The
 * test runtime ships no `localStorage` (the app no-ops without it), so a fresh in-memory Storage is
 * installed per test to exercise the mirror.
 */
function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  } as unknown as Storage;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
}

beforeEach(installMemoryStorage);

describe('shouldPersistQueryKey', () => {
  it('should deny the session, library and progress query roots so PII never reaches disk', () => {
    expect(shouldPersistQueryKey(['auth', 'session'])).toBe(false);
    expect(shouldPersistQueryKey(['auth', 'session', 'required'])).toBe(false);
    expect(shouldPersistQueryKey(['library'])).toBe(false);
    expect(shouldPersistQueryKey(['progress'])).toBe(false);
  });

  it('should allow public catalog and chapter content to persist for offline reading', () => {
    expect(shouldPersistQueryKey(['novels', 'catalog', {}])).toBe(true);
    expect(shouldPersistQueryKey(['novels', 'chapter', 'starfall-requiem', 3])).toBe(true);
  });
});

describe('namespacedKey', () => {
  it('should suffix the base key with the user id', () => {
    expect(namespacedKey('webnovel:progress', 'usr_A')).toBe('webnovel:progress:usr_A');
  });

  it('should fall back to a guest namespace when signed out', () => {
    expect(namespacedKey('webnovel:progress')).toBe('webnovel:progress:guest');
  });
});

describe('progress mirror namespacing', () => {
  it('should keep one user’s reading history out of another user’s (and the guest) namespace', () => {
    saveProgress('starfall-requiem', 5, 40, 'usr_A');

    expect(getProgress('starfall-requiem', 'usr_A')?.ordinal).toBe(5);
    expect(getProgress('starfall-requiem', 'usr_B')).toBeUndefined();
    expect(getProgress('starfall-requiem')).toBeUndefined();
    expect(readProgressMap('usr_B')).toEqual({});
  });

  it('should clear only the target user’s mirror on sign-out', () => {
    saveProgress('starfall-requiem', 5, 40, 'usr_A');
    saveProgress('omniscient-sovereigns', 2, 10, 'usr_B');

    clearProgressMirror('usr_A');

    expect(readProgressMap('usr_A')).toEqual({});
    expect(getProgress('omniscient-sovereigns', 'usr_B')?.ordinal).toBe(2);
  });
});

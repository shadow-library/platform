/** Guest-first persistence in localStorage; every accessor no-ops without `window`, so it is SSR-safe. */

/** Partition a mirror key by the signed-in user so one account's on-device state never bleeds into another's. */
export function namespacedKey(base: string, userId?: string): string {
  return `${base}:${userId ?? 'guest'}`;
}

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked — losing a local mirror write is acceptable. */
  }
}

export function removeLocal(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

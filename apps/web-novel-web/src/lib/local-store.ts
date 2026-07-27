/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Guest-first persistence: the library and reading progress always live on this device (localStorage),
 * matching the design's "saved on this device — sign in to sync" model. SSR-safe: every accessor no-ops
 * without `window`.
 */
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

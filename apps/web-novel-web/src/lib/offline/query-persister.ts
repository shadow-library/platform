import { createIDBPersister } from '@shadow-library/web/offline';

/**
 * The whole-query-cache persister and the policy governing what is allowed to reach disk. On-device
 * per-user state (auth/session, library, reading progress) is deliberately kept OUT of the persisted cache —
 * only public catalog and chapter content is dehydrated, so offline reading still works without writing PII
 * to IndexedDB. `purgeOnLogout` clears this persister so a sign-out leaves no cached cache behind.
 */
export const queryPersister = createIDBPersister({ dbName: 'webnovel-query-cache' });

export const PERSIST_MAX_AGE = 7 * 24 * 3_600_000;
export const PERSIST_BUSTER = 'v1';

/** Query-key roots that carry per-user state and must never be written to the on-disk query cache. */
const PERSIST_DENYLIST_ROOTS: ReadonlySet<unknown> = new Set(['auth', 'library', 'progress']);

/** Public catalog/chapter content persists; anything under a denylisted root (session, library, progress) does not. */
export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  return !PERSIST_DENYLIST_ROOTS.has(queryKey[0]);
}

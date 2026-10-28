import { createIDBPersister } from '@shadow-library/web/offline';

/** Only public catalog and chapter content is persisted; per-user state is denylisted so no PII reaches IndexedDB. */
export const queryPersister = createIDBPersister({ dbName: 'webnovel-query-cache' });

export const PERSIST_MAX_AGE = 7 * 24 * 3_600_000;
/** Bump whenever a persisted query's data changes shape, so an old cache is dropped instead of restored into a newer reader. */
export const PERSIST_BUSTER = 'v2';

/** Query-key roots that carry per-user state and must never be written to the on-disk query cache. */
const PERSIST_DENYLIST_ROOTS: ReadonlySet<unknown> = new Set(['auth', 'library', 'progress']);

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  return !PERSIST_DENYLIST_ROOTS.has(queryKey[0]);
}

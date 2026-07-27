/**
 * Importing npm packages
 */
import { queryOptions } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { readLocal, writeLocal } from '@/lib/local-store';

import { type ApiError, APIRequest, useFixtures } from './transport';
import { type ReadingProgress } from './types';

/**
 * Defining types
 */
export type ProgressMap = Record<string, ReadingProgress>;

/**
 * Declaring the constants
 *
 * Reading progress is local-first (written on every reader scroll, works offline) and mirrored to
 * `GET/PUT /api/novels/:slug/progress` when signed in. Writes that fail (offline) are queued as dirty slugs
 * and re-pushed by `syncPendingProgress` when connectivity returns.
 */
const PROGRESS_STORAGE_KEY = 'webnovel:progress';
const PENDING_STORAGE_KEY = 'webnovel:progress-pending';

export const progressKeys = {
  all: ['progress'] as const,
};

export function readProgressMap(): ProgressMap {
  return readLocal<ProgressMap>(PROGRESS_STORAGE_KEY, {});
}

export function getProgress(slug: string): ReadingProgress | undefined {
  return readProgressMap()[slug];
}

export const progressQueryOptions = (authenticated = false) =>
  queryOptions<ProgressMap, ApiError>({
    queryKey: progressKeys.all,
    queryFn: async () => {
      const local = readProgressMap();
      if (useFixtures || !authenticated) return local;
      const remote = await APIRequest.get('/api/me/progress').timeout(10_000).execute<ReadingProgress[]>();
      const merged: ProgressMap = { ...local };
      for (const entry of remote) {
        const mine = merged[entry.novelSlug];
        if (!mine || Date.parse(entry.updatedAt) > Date.parse(mine.updatedAt)) merged[entry.novelSlug] = entry;
      }
      writeLocal(PROGRESS_STORAGE_KEY, merged);
      return merged;
    },
  });

export function saveProgress(slug: string, ordinal: number, position: number, authenticated = false): ReadingProgress {
  const entry: ReadingProgress = { novelSlug: slug, ordinal, position: Math.round(position), updatedAt: new Date().toISOString() };
  const map = readProgressMap();
  map[slug] = entry;
  writeLocal(PROGRESS_STORAGE_KEY, map);

  if (!useFixtures && authenticated) {
    APIRequest.put(`/api/novels/${encodeURIComponent(slug)}/progress`)
      .body({ ordinal: entry.ordinal, position: entry.position })
      .timeout(8_000)
      .execute()
      .catch(() => {
        const pending = readLocal<string[]>(PENDING_STORAGE_KEY, []);
        if (!pending.includes(slug)) writeLocal(PENDING_STORAGE_KEY, [...pending, slug]);
      });
  }
  return entry;
}

/** Re-push progress writes that failed while offline — called from the reconnect handler. */
export async function syncPendingProgress(authenticated = false): Promise<void> {
  if (useFixtures || !authenticated) return;
  const pending = readLocal<string[]>(PENDING_STORAGE_KEY, []);
  if (pending.length === 0) return;
  const map = readProgressMap();
  const results = await Promise.allSettled(
    pending.map(slug => {
      const entry = map[slug];
      if (!entry) return Promise.resolve();
      return APIRequest.put(`/api/novels/${encodeURIComponent(slug)}/progress`)
        .body({ ordinal: entry.ordinal, position: entry.position })
        .timeout(8_000)
        .execute();
    }),
  );
  const stillPending = pending.filter((_, index) => results[index]?.status === 'rejected');
  writeLocal(PENDING_STORAGE_KEY, stillPending);
}

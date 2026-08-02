/**
 * Importing npm packages
 */
import { queryOptions } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { namespacedKey, readLocal, removeLocal, writeLocal } from '@/lib/local-store';

import { type ApiError, APIRequest, useFixtures } from './transport';
import { type ReadingProgress } from './types';

/**
 * Defining types
 *
 * The live `GET /api/me/progress` wire shape (verified against the reader DTOs): a wrapped `{ items }` list
 * whose entries carry `novelSlug`/`ordinal`/`position`/`updatedAt`. `toReadingProgress` picks the fields
 * explicitly so future server additions never leak into the localStorage mirror.
 */
export type ProgressMap = Record<string, ReadingProgress>;

export interface ServerProgressItem {
  novelSlug: string;
  ordinal: number;
  position: number;
  updatedAt: string;
}

interface ServerProgressList {
  items: ServerProgressItem[];
}

/**
 * Declaring the constants
 *
 * Reading progress is local-first (written on every reader scroll, works offline) and mirrored to
 * `GET/PUT /api/novels/:slug/progress` when signed in. Writes that fail (offline) are queued as dirty slugs
 * and re-pushed by `syncPendingProgress` when connectivity returns. The mirror and its pending queue are
 * namespaced by user id (guests fall back to a `guest` namespace) so one account's reading history never
 * leaks into another's.
 */
const PROGRESS_STORAGE_KEY = 'webnovel:progress';
const PENDING_STORAGE_KEY = 'webnovel:progress-pending';

export const progressKeys = {
  all: ['progress'] as const,
};

export function readProgressMap(userId?: string): ProgressMap {
  return readLocal<ProgressMap>(namespacedKey(PROGRESS_STORAGE_KEY, userId), {});
}

function writeProgressMap(map: ProgressMap, userId?: string): void {
  writeLocal(namespacedKey(PROGRESS_STORAGE_KEY, userId), map);
}

export function getProgress(slug: string, userId?: string): ReadingProgress | undefined {
  return readProgressMap(userId)[slug];
}

/** Drop the current user's reading history and pending queue — called on sign-out. */
export function clearProgressMirror(userId?: string): void {
  removeLocal(namespacedKey(PROGRESS_STORAGE_KEY, userId));
  removeLocal(namespacedKey(PENDING_STORAGE_KEY, userId));
}

export function toReadingProgress(item: ServerProgressItem): ReadingProgress {
  return { novelSlug: item.novelSlug, ordinal: item.ordinal, position: item.position, updatedAt: item.updatedAt };
}

export const progressQueryOptions = (userId?: string) =>
  queryOptions<ProgressMap, ApiError>({
    queryKey: progressKeys.all,
    queryFn: async () => {
      const local = readProgressMap(userId);
      if (useFixtures || !userId) return local;
      const remote = await APIRequest.get('/me/progress').timeout(10_000).execute<ServerProgressList>();
      const merged: ProgressMap = { ...local };
      for (const item of remote.items) {
        const entry = toReadingProgress(item);
        const mine = merged[entry.novelSlug];
        if (!mine || Date.parse(entry.updatedAt) > Date.parse(mine.updatedAt)) merged[entry.novelSlug] = entry;
      }
      writeProgressMap(merged, userId);
      return merged;
    },
  });

export function saveProgress(slug: string, ordinal: number, position: number, userId?: string): ReadingProgress {
  const entry: ReadingProgress = { novelSlug: slug, ordinal, position: Math.round(position), updatedAt: new Date().toISOString() };
  const map = readProgressMap(userId);
  map[slug] = entry;
  writeProgressMap(map, userId);

  if (!useFixtures && userId) {
    const pendingStorageKey = namespacedKey(PENDING_STORAGE_KEY, userId);
    APIRequest.put(`/novels/${encodeURIComponent(slug)}/progress`)
      .body({ ordinal: entry.ordinal, position: entry.position })
      .timeout(8_000)
      .execute()
      .catch(() => {
        const pending = readLocal<string[]>(pendingStorageKey, []);
        if (!pending.includes(slug)) writeLocal(pendingStorageKey, [...pending, slug]);
      });
  }
  return entry;
}

/** Re-push the signed-in user's progress writes that failed while offline — called from the reconnect handler. */
export async function syncPendingProgress(userId?: string): Promise<void> {
  if (useFixtures || !userId) return;
  const pendingStorageKey = namespacedKey(PENDING_STORAGE_KEY, userId);
  const pending = readLocal<string[]>(pendingStorageKey, []);
  if (pending.length === 0) return;
  const map = readProgressMap(userId);
  const results = await Promise.allSettled(
    pending.map(slug => {
      const entry = map[slug];
      if (!entry) return Promise.resolve();
      return APIRequest.put(`/novels/${encodeURIComponent(slug)}/progress`)
        .body({ ordinal: entry.ordinal, position: entry.position })
        .timeout(8_000)
        .execute();
    }),
  );
  const stillPending = pending.filter((_, index) => results[index]?.status === 'rejected');
  writeLocal(pendingStorageKey, stillPending);
}

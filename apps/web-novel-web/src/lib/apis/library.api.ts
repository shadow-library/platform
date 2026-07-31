/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { namespacedKey, readLocal, removeLocal, writeLocal } from '@/lib/local-store';

import { coverFor, type ServerNovelStatus, STATUS_FROM_SERVER } from './novels.api';
import { type ApiError, APIRequest, useFixtures } from './transport';
import { type LibraryEntry, type NovelSummary } from './types';

/**
 * Defining types
 *
 * The live `GET /api/library` wire shape (verified against the reader DTOs): a wrapped `{ items }` list of
 * lean shelf items — no author/rating/chapter count, `live`/`retired` status — keyed by `slug`, not the
 * client's `novelSlug`. `toLibraryEntry` normalizes each item into the internal model at this boundary.
 */
export interface ServerLibraryItem {
  slug: string;
  title: string;
  coverPath?: string;
  genres: string[];
  status: ServerNovelStatus;
  addedAt: string;
}

interface ServerLibraryList {
  items: ServerLibraryItem[];
}

/**
 * Declaring the constants
 *
 * Library entries are local-first (guests get a device library, per the design), mirrored to the server's
 * `GET/POST/DELETE /api/library` when a session exists so a sign-in syncs the shelf. The local mirror keeps
 * a `NovelSummary` snapshot so the shelf renders offline without a catalog fetch. The mirror is namespaced
 * by user id (guests fall back to a `guest` namespace) so one account's device shelf never merges into
 * another's server library.
 */
const LIBRARY_STORAGE_KEY = 'webnovel:library';

export const libraryKeys = {
  all: ['library'] as const,
};

function readLibrary(userId?: string): LibraryEntry[] {
  return readLocal<LibraryEntry[]>(namespacedKey(LIBRARY_STORAGE_KEY, userId), []);
}

function writeLibrary(entries: LibraryEntry[], userId?: string): void {
  writeLocal(namespacedKey(LIBRARY_STORAGE_KEY, userId), entries);
}

/** Drop the current user's device shelf — called on sign-out so the next account starts clean. */
export function clearLibraryMirror(userId?: string): void {
  removeLocal(namespacedKey(LIBRARY_STORAGE_KEY, userId));
}

export function isInLibrary(entries: LibraryEntry[] | undefined, slug: string): boolean {
  return entries?.some(entry => entry.novelSlug === slug) ?? false;
}

/** The local mirror's richer catalog snapshot wins when present; a lean server item synthesizes catalog-style defaults. */
export function toLibraryEntry(item: ServerLibraryItem, local?: LibraryEntry): LibraryEntry {
  const novel: NovelSummary = local?.novel ?? {
    slug: item.slug,
    title: item.title,
    author: 'Unknown author',
    genres: item.genres,
    status: STATUS_FROM_SERVER[item.status],
    rating: 0,
    ratingCount: 0,
    chapterCount: 0,
    synopsis: '',
    updatedAt: item.addedAt,
    views: 0,
    cover: coverFor(item.slug),
  };
  return { novelSlug: item.slug, addedAt: item.addedAt, novel };
}

export const libraryQueryOptions = (userId?: string) =>
  queryOptions<LibraryEntry[], ApiError>({
    queryKey: libraryKeys.all,
    queryFn: async () => {
      const local = readLibrary(userId);
      if (useFixtures || !userId) return local;
      // Merge server truth over this user's mirror; only entries added under this same namespace (e.g. offline
      // additions) are promoted — guest entries live in a separate namespace and are never pushed to the account.
      const response = await APIRequest.get('/api/library').timeout(10_000).execute<ServerLibraryList>();
      const localBySlug = new Map(local.map(entry => [entry.novelSlug, entry]));
      const remote = response.items.map(item => toLibraryEntry(item, localBySlug.get(item.slug)));
      const remoteSlugs = new Set(remote.map(entry => entry.novelSlug));
      const localOnly = local.filter(entry => !remoteSlugs.has(entry.novelSlug));
      await Promise.allSettled(localOnly.map(entry => APIRequest.post('/api/library').body({ slug: entry.novelSlug }).execute()));
      const merged = [...remote, ...localOnly];
      writeLibrary(merged, userId);
      return merged;
    },
  });

export function useToggleLibraryMutation(userId?: string): UseMutationResult<LibraryEntry[], ApiError, NovelSummary> {
  const queryClient = useQueryClient();
  return useMutation<LibraryEntry[], ApiError, NovelSummary>({
    mutationFn: async novel => {
      const entries = readLibrary(userId);
      const existing = entries.find(entry => entry.novelSlug === novel.slug);
      const next = existing ? entries.filter(entry => entry.novelSlug !== novel.slug) : [{ novelSlug: novel.slug, addedAt: new Date().toISOString(), novel }, ...entries];
      writeLibrary(next, userId);
      if (!useFixtures && userId) {
        const request = existing ? APIRequest.delete(`/api/library/${encodeURIComponent(novel.slug)}`) : APIRequest.post('/api/library').body({ slug: novel.slug });
        await request
          .timeout(10_000)
          .execute()
          .catch(() => undefined); // Offline toggle still lands locally; the next library read re-syncs.
      }
      return next;
    },
    onSuccess: next => queryClient.setQueryData(libraryKeys.all, next),
  });
}

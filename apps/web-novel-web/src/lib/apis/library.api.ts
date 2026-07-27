/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { readLocal, writeLocal } from '@/lib/local-store';

import { type ApiError, APIRequest, useFixtures } from './transport';
import { type LibraryEntry, type NovelSummary } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Library entries are local-first (guests get a device library, per the design), mirrored to the server's
 * `GET/POST/DELETE /api/library` when a session exists so a sign-in syncs the shelf. The local mirror keeps
 * a `NovelSummary` snapshot so the shelf renders offline without a catalog fetch.
 */
const LIBRARY_STORAGE_KEY = 'webnovel:library';

export const libraryKeys = {
  all: ['library'] as const,
};

function readLibrary(): LibraryEntry[] {
  return readLocal<LibraryEntry[]>(LIBRARY_STORAGE_KEY, []);
}

function writeLibrary(entries: LibraryEntry[]): void {
  writeLocal(LIBRARY_STORAGE_KEY, entries);
}

export function isInLibrary(entries: LibraryEntry[] | undefined, slug: string): boolean {
  return entries?.some(entry => entry.novelSlug === slug) ?? false;
}

export const libraryQueryOptions = (authenticated = false) =>
  queryOptions<LibraryEntry[], ApiError>({
    queryKey: libraryKeys.all,
    queryFn: async () => {
      const local = readLibrary();
      if (useFixtures || !authenticated) return local;
      // Merge server truth over the local mirror; local-only entries are pushed up so guests keep their shelf.
      const remote = await APIRequest.get('/api/library').timeout(10_000).execute<LibraryEntry[]>();
      const remoteSlugs = new Set(remote.map(entry => entry.novelSlug));
      const localOnly = local.filter(entry => !remoteSlugs.has(entry.novelSlug));
      await Promise.allSettled(localOnly.map(entry => APIRequest.post('/api/library').body({ slug: entry.novelSlug }).execute()));
      const merged = [...remote, ...localOnly];
      writeLibrary(merged);
      return merged;
    },
  });

export function useToggleLibraryMutation(authenticated = false): UseMutationResult<LibraryEntry[], ApiError, NovelSummary> {
  const queryClient = useQueryClient();
  return useMutation<LibraryEntry[], ApiError, NovelSummary>({
    mutationFn: async novel => {
      const entries = readLibrary();
      const existing = entries.find(entry => entry.novelSlug === novel.slug);
      const next = existing ? entries.filter(entry => entry.novelSlug !== novel.slug) : [{ novelSlug: novel.slug, addedAt: new Date().toISOString(), novel }, ...entries];
      writeLibrary(next);
      if (!useFixtures && authenticated) {
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

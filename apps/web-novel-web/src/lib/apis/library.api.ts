import { queryOptions, useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { namespacedKey, readLocal, removeLocal, writeLocal } from '@/lib/local-store';

import { type LibraryItem, type LibraryListResponse } from './api-types.gen';
import { coverFor, STATUS_FROM_SERVER } from './novels.api';
import { type ApiError, APIRequest } from './transport';
import { type LibraryEntry, type NovelSummary } from './types';

/** Local-first: guests get a device shelf, mirrored to the server when a session exists. The mirror is namespaced by user id (`guest` otherwise) so accounts never merge. */
const LIBRARY_STORAGE_KEY = 'webnovel:library';

const libraryKeys = {
  // Keyed by user: the loader fires before `session.data` resolves, and a static key would cache the guest-empty result and never refetch once the session lands.
  all: (userId?: string) => ['library', userId ?? 'guest'] as const,
};

function readLibrary(userId?: string): LibraryEntry[] {
  return readLocal<LibraryEntry[]>(namespacedKey(LIBRARY_STORAGE_KEY, userId), []);
}

function writeLibrary(entries: LibraryEntry[], userId?: string): void {
  writeLocal(namespacedKey(LIBRARY_STORAGE_KEY, userId), entries);
}

export function clearLibraryMirror(userId?: string): void {
  removeLocal(namespacedKey(LIBRARY_STORAGE_KEY, userId));
}

export function isInLibrary(entries: LibraryEntry[] | undefined, slug: string): boolean {
  return entries?.some(entry => entry.novelSlug === slug) ?? false;
}

export function toLibraryEntry(item: LibraryItem, local?: LibraryEntry): LibraryEntry {
  const novel: NovelSummary = local?.novel ?? {
    slug: item.slug,
    title: item.title,
    author: item.author || 'Unknown author',
    genres: item.genres,
    tags: [],
    status: STATUS_FROM_SERVER[item.status],
    rating: 0,
    ratingCount: 0,
    chapterCount: 0,
    synopsis: '',
    updatedAt: item.addedAt,
    views: 0,
    cover: coverFor(item.slug, item.coverUrl),
  };
  return { novelSlug: item.slug, addedAt: item.addedAt, novel };
}

export const libraryQueryOptions = (userId?: string) =>
  queryOptions<LibraryEntry[], ApiError>({
    queryKey: libraryKeys.all(userId),
    queryFn: async () => {
      const local = readLibrary(userId);
      if (!userId) return local;
      // Merge server truth over this user's mirror; only entries added under this same namespace are promoted, so guest entries never reach the account.
      const response = await APIRequest.get('/library').timeout(10_000).execute<LibraryListResponse>();
      const localBySlug = new Map(local.map(entry => [entry.novelSlug, entry]));
      const remote = response.items.map(item => toLibraryEntry(item, localBySlug.get(item.slug)));
      const remoteSlugs = new Set(remote.map(entry => entry.novelSlug));
      const localOnly = local.filter(entry => !remoteSlugs.has(entry.novelSlug));
      await Promise.allSettled(localOnly.map(entry => APIRequest.post('/library').body({ slug: entry.novelSlug }).execute()));
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
      if (userId) {
        const request = existing ? APIRequest.delete(`/library/${encodeURIComponent(novel.slug)}`) : APIRequest.post('/library').body({ slug: novel.slug });
        await request
          .timeout(10_000)
          .execute()
          .catch(() => undefined); // Offline toggle still lands locally; the next library read re-syncs.
      }
      return next;
    },
    onSuccess: next => queryClient.setQueryData(libraryKeys.all(userId), next),
  });
}

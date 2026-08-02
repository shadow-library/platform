/**
 * Importing npm packages
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Importing user defined packages
 */
import { namespacedKey, readLocal, removeLocal, writeLocal } from '@/lib/local-store';
import { type DownloadedNovel, listDownloadedNovels } from '@/lib/offline/store';
import { DEFAULT_SETTINGS, loadSettings, type WebnovelSettings } from '@/lib/settings-store';

import { libraryQueryOptions } from './library.api';
import { progressQueryOptions } from './progress.api';
import { type LibraryEntry, type ReadingProgress } from './types';

/**
 * Defining types
 */

/** The kinds of update this client can actually observe. Replies and product news have no data source here. */
export type NotificationType = 'chapter' | 'download';

/** A single entry in the "Updates" feed. `createdAt` is an ISO instant; the relative label is derived at render. */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  novelSlug: string;
}

export interface NotificationsFeed {
  items: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

interface DeriveInput {
  library: LibraryEntry[];
  progress: Record<string, ReadingProgress>;
  downloads: DownloadedNovel[];
  settings: WebnovelSettings;
  readIds: Set<string>;
}

/**
 * Declaring the constants
 *
 * webnovel-server has no notifications endpoint, so rather than invent a feed, this derives one from the
 * signals the client genuinely holds: the reader's own shelf and reading progress (a novel that moved on
 * after they last opened it) and the offline store (chapters actually saved to this device). Nothing is
 * fabricated — when there is no such signal the feed is empty and the screen says so.
 *
 * The only thing persisted is which entry ids have been read, namespaced by user id like the library and
 * progress mirrors. Ids embed the fact that produced them (`chapter:<slug>:<chapterCount>`), so a novel
 * gaining further chapters surfaces as a new, unread entry rather than staying dismissed forever.
 *
 * Known gap: a library entry synced from another device carries no catalog snapshot (`chapterCount: 0`), so
 * it cannot produce a chapter update until this device sees the novel in the catalog. Closing that properly
 * needs the server to expose chapter counts on `GET /library`, not more client-side guessing.
 */
const READ_STORAGE_KEY = 'webnovel:notifications-read';

export const notificationsKeys = {
  read: (userId?: string) => ['notifications', 'read', userId ?? 'guest'] as const,
  downloads: ['notifications', 'downloads'] as const,
  settings: ['notifications', 'settings'] as const,
};

function readReadIds(userId?: string): string[] {
  return readLocal<string[]>(namespacedKey(READ_STORAGE_KEY, userId), []);
}

function writeReadIds(ids: string[], userId?: string): void {
  writeLocal(namespacedKey(READ_STORAGE_KEY, userId), ids);
}

/** Drop the current user's read markers — called on sign-out so the next account starts clean. */
export function clearNotificationsMirror(userId?: string): void {
  removeLocal(namespacedKey(READ_STORAGE_KEY, userId));
}

/**
 * Builds the feed from the raw signals. Pure and total, so the shell's unread dot and the Updates screen can
 * never disagree, and so it stays trivially testable.
 */
export function deriveNotifications(input: DeriveInput): Notification[] {
  const { library, progress, downloads, settings, readIds } = input;
  const items: Notification[] = [];

  if (settings.notifyNewChapters) {
    for (const entry of library) {
      const { novel } = entry;
      const read = progress[entry.novelSlug];
      // An update is a novel that both moved on and left chapters unread *since* this reader last opened it.
      // Without a read of their own there is no "since", and an untouched shelf entry is a to-read, not news.
      if (!read) continue;
      const unread = novel.chapterCount - read.ordinal;
      if (unread <= 0 || Date.parse(novel.updatedAt) <= Date.parse(read.updatedAt)) continue;
      const id = `chapter:${entry.novelSlug}:${novel.chapterCount}`;
      items.push({
        id,
        type: 'chapter',
        title: `New chapters · ${novel.title}`,
        body: `${unread} chapter${unread === 1 ? '' : 's'} you haven’t read — you left off at chapter ${read.ordinal.toLocaleString()} of ${novel.chapterCount.toLocaleString()}.`,
        createdAt: novel.updatedAt,
        read: readIds.has(id),
        novelSlug: entry.novelSlug,
      });
    }
  }

  if (settings.notifyDownloadComplete) {
    for (const record of downloads) {
      if (record.ordinals.length === 0) continue;
      const id = `download:${record.slug}:${record.downloadedAt}`;
      const count = record.ordinals.length;
      items.push({
        id,
        type: 'download',
        title: `Saved for offline · ${record.title}`,
        body: `${count} chapter${count === 1 ? '' : 's'} are on this device and readable without a connection.`,
        createdAt: record.downloadedAt,
        read: readIds.has(id),
        novelSlug: record.slug,
      });
    }
  }

  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * The single source for the Updates feed, shared by the screen and the shell's unread dot.
 *
 * The offline store lives in IndexedDB, which the server has no access to, so that read is a query of its own
 * and resolves to an empty list during SSR — the feed fills in on hydration like the rest of the device-local
 * surfaces.
 */
export function useNotifications(userId?: string): NotificationsFeed {
  const queryClient = useQueryClient();
  const library = useQuery(libraryQueryOptions(userId));
  const progress = useQuery(progressQueryOptions(userId));
  const downloads = useQuery({
    queryKey: notificationsKeys.downloads,
    queryFn: () => (typeof window === 'undefined' ? [] : listDownloadedNovels()),
  });
  const readIds = useQuery({
    queryKey: notificationsKeys.read(userId),
    queryFn: () => readReadIds(userId),
  });
  // The per-type toggles live in localStorage, which nothing can subscribe to; reading them through a query
  // at least re-reads them when the feed remounts, so a toggle takes effect on the next visit.
  const settings = useQuery({ queryKey: notificationsKeys.settings, queryFn: () => loadSettings() });

  const items = useMemo(
    () =>
      deriveNotifications({
        library: library.data ?? [],
        progress: progress.data ?? {},
        downloads: downloads.data ?? [],
        settings: settings.data ?? DEFAULT_SETTINGS,
        readIds: new Set(readIds.data ?? []),
      }),
    [library.data, progress.data, downloads.data, settings.data, readIds.data],
  );

  const mark = useMutation({
    mutationFn: async (ids: string[]) => {
      const next = [...new Set([...readReadIds(userId), ...ids])];
      writeReadIds(next, userId);
      return next;
    },
    onSuccess: next => queryClient.setQueryData(notificationsKeys.read(userId), next),
  });

  return {
    items,
    unreadCount: items.reduce((count, item) => count + (item.read ? 0 : 1), 0),
    isLoading: library.isLoading || progress.isLoading || downloads.isLoading,
    markRead: id => mark.mutate([id]),
    markAllRead: () => mark.mutate(items.filter(item => !item.read).map(item => item.id)),
  };
}

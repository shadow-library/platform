import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { namespacedKey, readLocal, removeLocal, writeLocal } from '@/lib/local-store';
import { type DownloadedNovel, listDownloadedNovels } from '@/lib/offline/store';
import { DEFAULT_SETTINGS, loadSettings, type WebnovelSettings } from '@/lib/settings-store';

import { libraryQueryOptions } from './library.api';
import { progressQueryOptions } from './progress.api';
import { type LibraryEntry, type ReadingProgress } from './types';

/** The kinds of update this client can actually observe. Replies and product news have no data source here. */
export type NotificationType = 'chapter' | 'download';

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
 * The server has no notifications endpoint, so the feed is derived from the shelf, reading progress and the offline store. Only read ids persist, namespaced by user;
 * ids embed `chapterCount` so further chapters surface as a new unread entry.
 * A library entry synced from another device has `chapterCount: 0` and yields no chapter update until this device sees the novel in the catalog.
 */
const READ_STORAGE_KEY = 'webnovel:notifications-read';

const notificationsKeys = {
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

export function clearNotificationsMirror(userId?: string): void {
  removeLocal(namespacedKey(READ_STORAGE_KEY, userId));
}

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

/** Shared by the screen and the shell's unread dot. The offline store is IndexedDB, so it resolves empty during SSR and fills in on hydration. */
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

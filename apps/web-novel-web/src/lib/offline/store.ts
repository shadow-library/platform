import { OfflineContentManager, OfflineStore } from '@shadow-library/web/offline';

import { type NovelCover } from '@/lib/apis/types';

export interface DownloadedNovel {
  slug: string;
  title: string;
  author: string;
  cover: NovelCover;
  chapterCount: number;
  /** Ordinals stored under `chapter:<slug>:<ordinal>` keys. */
  ordinals: number[];
  downloadedAt: string;
}

/** IndexedDB database holding explicitly-downloaded content — the account-scoped store purged on sign-out and account change. */
export const OFFLINE_DB_NAME = 'webnovel-offline';

/**
 * Caches holding per-account content, dropped on sign-out or account change: the runtime cache (chapters are cache-first, so a gated chapter must not
 * reach the next reader) and the SW offline cache.
 * The app-shell precache is excluded: clearing it would break offline navigation until the worker reinstalls.
 */
export const PURGE_CACHE_PREFIXES = ['webnovel-runtime', 'webnovel-offline'] as const;

/** Independent of the service worker, so downloads work where workers don't; one key per chapter keeps partial downloads cheap and the `novel:` record indexes them. */
export const offlineStore = new OfflineStore({ dbName: OFFLINE_DB_NAME });
export const offlineManager = new OfflineContentManager(offlineStore);

const NOVEL_KEY_PREFIX = 'novel:';

export function novelKey(slug: string): string {
  return `${NOVEL_KEY_PREFIX}${slug}`;
}

export function chapterKey(slug: string, ordinal: number): string {
  return `chapter:${slug}:${ordinal}`;
}

export async function listDownloadedNovels(): Promise<DownloadedNovel[]> {
  const entries = await offlineStore.list();
  const records = await Promise.all(entries.filter(entry => entry.key.startsWith(NOVEL_KEY_PREFIX)).map(entry => offlineStore.get<DownloadedNovel>(entry.key)));
  return records.filter((record): record is DownloadedNovel => record !== undefined);
}

export async function getDownloadedNovel(slug: string): Promise<DownloadedNovel | undefined> {
  return offlineStore.get<DownloadedNovel>(novelKey(slug));
}

export async function removeDownloadedNovel(slug: string): Promise<void> {
  const record = await getDownloadedNovel(slug);
  if (record) await Promise.all(record.ordinals.map(ordinal => offlineStore.delete(chapterKey(slug, ordinal))));
  await offlineStore.delete(novelKey(slug));
}

export async function downloadedSize(slug: string): Promise<number> {
  const entries = await offlineStore.list();
  const prefix = `chapter:${slug}:`;
  return entries.filter(entry => entry.key === novelKey(slug) || entry.key.startsWith(prefix)).reduce((sum, entry) => sum + entry.size, 0);
}

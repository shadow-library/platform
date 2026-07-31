/**
 * Importing npm packages
 */
import { OfflineContentManager, OfflineStore } from '@shadow-library/web/offline';

/**
 * Importing user defined packages
 */
import { type NovelCover } from '@/lib/apis/types';

/**
 * Defining types
 */

/** The per-novel download record stored under `novel:<slug>` — the source of truth for the offline library. */
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

/**
 * Declaring the constants
 *
 * One IndexedDB database for all explicitly-downloaded content (SW-independent, so downloads work even
 * where service workers don't). Chapters are stored one key per chapter so partial downloads and per-range
 * updates stay cheap; the `novel:` record indexes them for the offline-library screen.
 */
export const offlineStore = new OfflineStore({ dbName: 'webnovel-offline' });
export const offlineManager = new OfflineContentManager(offlineStore);

export const NOVEL_KEY_PREFIX = 'novel:';

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

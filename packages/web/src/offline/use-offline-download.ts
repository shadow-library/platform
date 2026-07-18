/**
 * Importing npm packages
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined packages
 */
import { type DownloadOptions, type DownloadProgress, OfflineContentManager, type RemoveOptions } from './download-manager';
import { type OfflineEntryMeta } from './offline-store';

/**
 * Defining types
 */
export interface UseOfflineDownload {
  /** Metadata for everything currently downloaded, refreshed after each download/remove. */
  entries: OfflineEntryMeta[];
  /** True while a download is in flight. */
  isDownloading: boolean;
  /** Progress of the in-flight download, or null when idle. */
  progress: DownloadProgress | null;
  download: <T>(options: DownloadOptions<T>) => Promise<void>;
  remove: (key: string, options?: RemoveOptions) => Promise<void>;
  /** Re-read the downloaded entries (e.g. after an external change). */
  refresh: () => Promise<void>;
}

/**
 * Declaring the constants
 */

/**
 * React binding over {@link OfflineContentManager}: exposes the list of downloaded content plus `download`/
 * `remove` actions with `isDownloading`/`progress` state for wiring a "Download for offline" button and a
 * downloads list. Pass a shared manager to reuse one IndexedDB database across the app; otherwise one is
 * created per hook instance.
 */
export function useOfflineDownload(manager?: OfflineContentManager): UseOfflineDownload {
  const contentManager = useMemo(() => manager ?? new OfflineContentManager(), [manager]);
  const [entries, setEntries] = useState<OfflineEntryMeta[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setEntries(await contentManager.list());
  }, [contentManager]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback(
    async <T>(options: DownloadOptions<T>): Promise<void> => {
      setIsDownloading(true);
      setProgress({ phase: 'data', completed: 0, total: 1 });
      try {
        await contentManager.download({ ...options, onProgress: value => setProgress(value) });
        await refresh();
      } finally {
        setIsDownloading(false);
        setProgress(null);
      }
    },
    [contentManager, refresh],
  );

  const remove = useCallback(
    async (key: string, options?: RemoveOptions): Promise<void> => {
      await contentManager.remove(key, options);
      await refresh();
    },
    [contentManager, refresh],
  );

  return { entries, isDownloading, progress, download, remove, refresh };
}

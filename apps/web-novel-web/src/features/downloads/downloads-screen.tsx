/**
 * Importing npm packages
 */
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Progress, toast } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { DownloadIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { getProgress } from '@/lib/apis';
import { type DownloadedNovel, downloadedSize, listDownloadedNovels, offlineStore, removeDownloadedNovel } from '@/lib/offline';

import styles from './downloads-screen.module.css';

/**
 * Defining types
 */
interface DownloadRow {
  record: DownloadedNovel;
  bytes: number;
}

/**
 * Declaring the constants
 *
 * The offline library from the mockups: a device-storage summary and per-novel entries with read-offline
 * and remove actions. Everything on this screen reads from IndexedDB — it works with no network at all.
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

export function DownloadsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const navigate = useNavigate();

  const refresh = useCallback(async (): Promise<void> => {
    const records = await listDownloadedNovels();
    const sizes = await Promise.all(records.map(record => downloadedSize(record.slug)));
    setRows(records.map((record, index) => ({ record, bytes: sizes[index] ?? 0 })).sort((a, b) => Date.parse(b.record.downloadedAt) - Date.parse(a.record.downloadedAt)));
    const estimate = await offlineStore.estimate();
    const used = await offlineStore.totalSize();
    setUsage({ used, quota: estimate?.quota ?? 0 });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRemove = async (record: DownloadedNovel): Promise<void> => {
    await removeDownloadedNovel(record.slug);
    toast.success(`Removed ${record.title} from this device`);
    await refresh();
  };

  const onRead = (record: DownloadedNovel): void => {
    const progress = getProgress(record.slug);
    const ordinal = progress && record.ordinals.includes(progress.ordinal) ? progress.ordinal : record.ordinals[0];
    if (ordinal === undefined) return;
    void navigate({ to: '/read/$slug/$ordinal', params: { slug: record.slug, ordinal: String(ordinal) } });
  };

  return (
    <div className={`${styles.page} wn-fade`}>
      <h1 className={styles.title}>Offline library</h1>
      <p className={styles.subtitle}>Downloaded chapters, available without a connection</p>

      <div className={styles.storageCard}>
        <div className={styles.storageHead}>
          <span className={styles.storageLabel}>Device storage</span>
          <span className={styles.storageValue}>
            <strong>{formatBytes(usage?.used ?? 0)}</strong>
            {usage && usage.quota > 0 ? ` of ${formatBytes(usage.quota)} available` : ' used'}
          </span>
        </div>
        <Progress value={usage && usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0} size="md" />
        <div className={styles.storageHint}>Downloads are stored in this browser. Clearing site data removes them.</div>
      </div>

      {rows.length === 0 && (
        <EmptyState
          illustration={<DownloadIcon size={26} />}
          title="No downloads yet"
          description="Download chapters from any novel to read them offline — no account needed."
          action={{ label: 'Find something to read', onClick: () => void navigate({ to: '/browse' }) }}
        />
      )}

      <div className={styles.entries}>
        {rows.map(({ record, bytes }) => (
          <div key={record.slug} className={styles.entry}>
            <Link to="/novels/$slug" params={{ slug: record.slug }} className={styles.entryCover}>
              <Cover cover={record.cover} title={record.title} showTitle={false} />
            </Link>
            <div className={styles.entryBody}>
              <div className={styles.entryTitle}>{record.title}</div>
              <div className={styles.entryMeta}>
                {record.ordinals.length.toLocaleString()} of {record.chapterCount.toLocaleString()} chapters · {formatBytes(bytes)} ·{' '}
                {new Date(record.downloadedAt).toLocaleDateString()}
              </div>
              <div className={styles.entryActions}>
                <Button variant="primary" size="sm" onClick={() => onRead(record)}>
                  Read offline
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void onRemove(record)}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

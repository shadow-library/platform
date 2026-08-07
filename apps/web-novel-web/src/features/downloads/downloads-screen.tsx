import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Badge, Button, EmptyState, Progress, toast } from '@shadow-library/ui';

import { DownloadIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { fetchChapter, getProgress, sessionQueryOptions } from '@/lib/apis';
import {
  chapterKey,
  type DownloadedNovel,
  downloadedSize,
  downloadQueue,
  type DownloadTask,
  getDownloadedNovel,
  listDownloadedNovels,
  novelKey,
  offlineStore,
  removeDownloadedNovel,
} from '@/lib/offline';

import styles from './downloads-screen.module.css';

interface DownloadRow {
  record: DownloadedNovel;
  bytes: number;
}

type EntryStatus = 'downloading' | 'paused' | 'failed' | 'complete' | 'update';

const STATUS: Record<EntryStatus, { label: string; intent: 'neutral' | 'info' | 'success' | 'danger' }> = {
  downloading: { label: 'Downloading', intent: 'info' },
  paused: { label: 'Paused', intent: 'neutral' },
  failed: { label: 'Failed', intent: 'danger' },
  complete: { label: 'Downloaded', intent: 'success' },
  update: { label: 'Update available', intent: 'info' },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

function percent(task: DownloadTask): number {
  return task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
}

export function DownloadsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const navigate = useNavigate();
  const session = useQuery(sessionQueryOptions());
  const tasks = useSyncExternalStore(downloadQueue.subscribe, downloadQueue.getSnapshot, downloadQueue.getServerSnapshot);

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
    const progress = getProgress(record.slug, session.data?.userId);
    const ordinal = progress && record.ordinals.includes(progress.ordinal) ? progress.ordinal : record.ordinals[0];
    if (ordinal === undefined) return;
    void navigate({ to: '/read/$slug/$ordinal', params: { slug: record.slug, ordinal: String(ordinal) } });
  };

  const onUpdate = (record: DownloadedNovel): void => {
    const owned = new Set(record.ordinals);
    const missing: number[] = [];
    for (let ordinal = 1; ordinal <= record.chapterCount; ordinal++) if (!owned.has(ordinal)) missing.push(ordinal);
    downloadQueue.start({
      slug: record.slug,
      title: record.title,
      ordinals: missing,
      step: async ordinal => {
        const chapter = await fetchChapter(record.slug, ordinal);
        await offlineStore.put(chapterKey(record.slug, ordinal), chapter);
      },
      onComplete: async () => {
        const current = (await getDownloadedNovel(record.slug)) ?? record;
        const ordinals = [...new Set([...current.ordinals, ...missing])].sort((a, b) => a - b);
        await offlineStore.put(novelKey(record.slug), { ...current, ordinals, downloadedAt: new Date().toISOString() });
        toast.success(`Updated ${record.title} — ${missing.length.toLocaleString()} new chapters`);
        await refresh();
      },
    });
  };

  const tasksBySlug = new Map(tasks.map(task => [task.slug, task]));

  return (
    <div className={`${styles.page} wn-fade`}>
      <h1 className={styles.title}>Offline library</h1>
      <p className={styles.subtitle}>Downloaded chapters, available without a connection</p>

      <div className={styles.storageCard}>
        <div className={styles.storageHead}>
          <span className={styles.storageLabel}>Device storage</span>
          <span className={styles.storageValue}>
            <strong>{formatBytes(usage?.used ?? 0)}</strong>
            {usage && usage.quota > 0 ? ` of ${formatBytes(usage.quota)} used` : ' used'}
          </span>
        </div>
        <Progress value={usage && usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0} size="md" />
        <div className={styles.storageHint}>Downloads pause automatically when storage is low. Manage per-novel below.</div>
      </div>

      {rows.length === 0 && tasks.length === 0 && (
        <EmptyState
          illustration={<DownloadIcon size={26} />}
          title="No downloads yet"
          description="Download chapters from any novel to read them offline — no account needed."
          action={{ label: 'Find something to read', onClick: () => void navigate({ to: '/browse' }) }}
        />
      )}

      <div className={styles.entries}>
        {rows.map(({ record, bytes }) => {
          const task = tasksBySlug.get(record.slug);
          const newCount = record.chapterCount - record.ordinals.length;
          const hasUpdate = !task && newCount > 0;
          const status = STATUS[task ? task.state : hasUpdate ? 'update' : 'complete'];
          return (
            <div key={record.slug} className={styles.entry}>
              <Link to="/novels/$slug" params={{ slug: record.slug }} className={styles.entryCover}>
                <Cover cover={record.cover} title={record.title} showTitle={false} />
              </Link>
              <div className={styles.entryBody}>
                <div className={styles.entryHead}>
                  <div className={styles.entryHeadText}>
                    <div className={styles.entryTitle}>{record.title}</div>
                    <div className={styles.entryMeta}>
                      {record.ordinals.length.toLocaleString()} chapters · {formatBytes(bytes)} · {new Date(record.downloadedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge className={styles.pill} intent={status.intent} variant="soft" size="sm">
                    {status.label}
                  </Badge>
                </div>

                {task?.state === 'downloading' && (
                  <div className={styles.progressBlock}>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${percent(task)}%` }} />
                    </div>
                    <div className={styles.progressRow}>
                      <Button variant="secondary" size="sm" onClick={() => downloadQueue.pause(record.slug)}>
                        Pause
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => downloadQueue.cancel(record.slug)}>
                        Cancel
                      </Button>
                      <span className={styles.progressText}>
                        {percent(task)}% · {(task.total - task.completed).toLocaleString()} queued
                      </span>
                    </div>
                  </div>
                )}

                {task?.state === 'paused' && (
                  <div className={styles.entryActions}>
                    <Button variant="primary" size="sm" onClick={() => downloadQueue.resume(record.slug)}>
                      Resume
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => downloadQueue.cancel(record.slug)}>
                      Cancel
                    </Button>
                  </div>
                )}

                {task?.state === 'failed' && (
                  <div className={styles.errorRow}>
                    <span className={styles.errorText}>{task.error ?? 'Download failed'}</span>
                    <Button variant="danger" size="sm" onClick={() => downloadQueue.retry(record.slug)}>
                      Retry
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => downloadQueue.cancel(record.slug)}>
                      Cancel
                    </Button>
                  </div>
                )}

                {!task && (
                  <div className={styles.entryActions}>
                    <Button variant="primary" size="sm" onClick={() => onRead(record)}>
                      Read offline
                    </Button>
                    {hasUpdate && (
                      <Button variant="secondary" size="sm" className={styles.updateAction} onClick={() => onUpdate(record)}>
                        Update · {newCount.toLocaleString()} new
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => void onRemove(record)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dialog, Input, Progress, toast } from '@shadow-library/ui';
import { useOfflineDownload } from '@shadow-library/web/offline';

/**
 * Importing user defined packages
 */
import { fetchChapter, getProgress, sessionQueryOptions } from '@/lib/apis';
import { type ChapterContent, type NovelDetail } from '@/lib/apis/types';
import { chapterKey, type DownloadedNovel, getDownloadedNovel, novelKey, offlineManager, offlineStore } from '@/lib/offline';

/**
 * Defining types
 */
export interface DownloadDialogProps {
  novel: NovelDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Declaring the constants
 *
 * The "Download for offline" dialog. Chapters are fetched through the canonical API layer and persisted
 * one key per chapter in the `OfflineStore` (via `useOfflineDownload`'s manager), so the reader can fall
 * back per-chapter with no service worker involved. Ranges are capped per batch to keep downloads honest.
 */
const MAX_BATCH = 200;
const EST_BYTES_PER_CHAPTER = 8_000;

export function DownloadDialog({ novel, open, onOpenChange }: DownloadDialogProps): React.JSX.Element {
  const session = useQuery(sessionQueryOptions());
  const progress = getProgress(novel.slug, session.data?.userId);
  const [from, setFrom] = useState(String(progress?.ordinal ?? 1));
  const [to, setTo] = useState(String(Math.min((progress?.ordinal ?? 1) + 49, novel.chapterCount)));
  const [completed, setCompleted] = useState(0);
  const download = useOfflineDownload(offlineManager);

  const fromOrdinal = Number.parseInt(from, 10) || 1;
  const toOrdinal = Number.parseInt(to, 10) || fromOrdinal;
  const count = Math.max(0, Math.min(toOrdinal, novel.chapterCount) - Math.max(fromOrdinal, 1) + 1);
  const estSize = ((count * EST_BYTES_PER_CHAPTER) / 1_000_000).toFixed(1);

  const onDownload = async (): Promise<void> => {
    if (count < 1 || count > MAX_BATCH) {
      toast.warning(count < 1 ? 'The range is empty — check the chapter numbers.' : `Download at most ${MAX_BATCH} chapters at a time.`);
      return;
    }
    setCompleted(0);
    await download.download<DownloadedNovel>({
      key: novelKey(novel.slug),
      label: novel.title,
      loader: async () => {
        const existing = await getDownloadedNovel(novel.slug);
        const ordinals = new Set(existing?.ordinals ?? []);
        for (let ordinal = fromOrdinal; ordinal <= Math.min(toOrdinal, novel.chapterCount); ordinal++) {
          const chapter: ChapterContent = await fetchChapter(novel.slug, ordinal);
          await offlineStore.put(chapterKey(novel.slug, ordinal), chapter);
          ordinals.add(ordinal);
          setCompleted(current => current + 1);
        }
        return {
          slug: novel.slug,
          title: novel.title,
          author: novel.author,
          cover: novel.cover,
          chapterCount: novel.chapterCount,
          ordinals: [...ordinals].sort((a, b) => a - b),
          downloadedAt: new Date().toISOString(),
        };
      },
    });
    toast.success(`Downloaded ${count} chapters of ${novel.title}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content aria-label="Download for offline">
        <Dialog.Header title="Download for offline" description={`${novel.title} · ${novel.chapterCount.toLocaleString()} chapters`} />
        <Dialog.Body>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--sh-text-tertiary)', marginBottom: 4 }}>From chapter</div>
              <Input value={from} onValueChange={setFrom} inputMode="numeric" aria-label="From chapter" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--sh-text-tertiary)', marginBottom: 4 }}>To chapter</div>
              <Input value={to} onValueChange={setTo} inputMode="numeric" aria-label="To chapter" />
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--sh-surface-well)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: 'var(--sh-text-secondary)' }}>Chapters to download</span>
              <strong>{count.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--sh-text-secondary)' }}>Estimated size</span>
              <strong>{estSize} MB</strong>
            </div>
            {download.isDownloading && (
              <div style={{ marginTop: 12 }}>
                <Progress value={count > 0 ? Math.round((completed / count) * 100) : 0} label={`Downloading ${completed} of ${count}`} />
              </div>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={download.isDownloading} onClick={() => void onDownload()}>
            Download {count.toLocaleString()}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

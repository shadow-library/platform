import { Button, cn, Input, Pagination, toast, useHydrated } from '@shadow-library/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { CheckIcon, CheckSquareIcon, ChevronRightIcon, DownloadIcon, PlayIcon, SortIcon } from '@/components/icons';
import { chapterListQueryOptions } from '@/lib/apis';
import { type ChapterMeta, type NovelDetail } from '@/lib/apis/types';
import { getDownloadedNovel } from '@/lib/offline';

import styles from './novel-screen.module.css';

const CHAPTER_PAGE_SIZE = 100;
const NEW_CHAPTER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function ChaptersPanel({ novel, currentOrdinal }: { novel: NovelDetail; currentOrdinal?: number }): React.JSX.Element {
  const [page, setPage] = useState(currentOrdinal ? Math.ceil(currentOrdinal / CHAPTER_PAGE_SIZE) : 1);
  const [filter, setFilter] = useState('');
  const [jump, setJump] = useState('');
  const [sortDir, setSortDir] = useState<'oldest' | 'newest'>('oldest');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloadedOrdinals, setDownloadedOrdinals] = useState<Set<number>>(new Set());
  const [mountedAt] = useState(() => Date.now());
  const chapters = useQuery(chapterListQueryOptions(novel.slug, page, CHAPTER_PAGE_SIZE));
  const router = useRouter();
  const hydrated = useHydrated();
  const now = hydrated ? mountedAt : null;

  useEffect(() => {
    void getDownloadedNovel(novel.slug).then(record => setDownloadedOrdinals(new Set(record?.ordinals ?? [])));
  }, [novel.slug]);

  const term = filter.trim().toLowerCase();
  const filtered = (chapters.data?.items ?? []).filter(chapter => !term || chapter.title.toLowerCase().includes(term) || String(chapter.ordinal).includes(term));
  const rows = sortDir === 'newest' ? [...filtered].reverse() : filtered;

  const onJump = (): void => {
    const ordinal = Number.parseInt(jump, 10);
    if (!Number.isFinite(ordinal) || ordinal < 1 || ordinal > novel.chapterCount) {
      toast.warning(`Enter a chapter between 1 and ${novel.chapterCount.toLocaleString()}`);
      return;
    }
    void router.navigate({ to: '/read/$slug/$ordinal', params: { slug: novel.slug, ordinal: String(ordinal) } });
  };

  const toggleSelect = (ordinal: number): void => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(ordinal)) next.delete(ordinal);
      else next.add(ordinal);
      return next;
    });
  };

  const leaveSelectMode = (): void => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const onDownloadSelected = (): void => {
    if (selected.size === 0) {
      toast.warning('Select at least one chapter to download');
      return;
    }
    toast.success(`Downloading ${selected.size.toLocaleString()} ${selected.size === 1 ? 'chapter' : 'chapters'}…`);
    leaveSelectMode();
  };

  return (
    <div>
      <div className={styles.chaptersHead}>
        <div>
          <h2 className={styles.sectionTitle}>{novel.chapterCount.toLocaleString()} chapters</h2>
          {term && (
            <p className={styles.matchCount}>
              {rows.length.toLocaleString()} {rows.length === 1 ? 'match' : 'matches'} “{filter.trim()}”
            </p>
          )}
        </div>
        <div className={styles.chaptersActions}>
          <button type="button" className={styles.toolBtn} onClick={() => setSortDir(value => (value === 'oldest' ? 'newest' : 'oldest'))}>
            <SortIcon size={15} />
            {sortDir === 'oldest' ? 'Oldest first' : 'Newest first'}
          </button>
          <button type="button" className={cn(styles.toolBtn, selectMode && styles.toolBtnActive)} onClick={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}>
            <CheckSquareIcon size={15} />
            {selectMode ? 'Done' : 'Select'}
          </button>
        </div>
      </div>

      <div className={styles.chaptersTools}>
        <div className={styles.chaptersSearch}>
          <Input value={filter} onValueChange={setFilter} placeholder="Search by chapter number or title…" clearable aria-label="Search chapters" />
        </div>
        <div className={styles.jumpBox}>
          <div className={styles.jumpInput}>
            <Input value={jump} onValueChange={setJump} placeholder="Go to #" aria-label="Jump to chapter" onKeyDown={event => event.key === 'Enter' && onJump()} />
          </div>
          <Button variant="primary" onClick={onJump}>
            Jump
          </Button>
        </div>
      </div>

      {currentOrdinal && !selectMode && (
        <Link to="/read/$slug/$ordinal" params={{ slug: novel.slug, ordinal: String(currentOrdinal) }} className={styles.continueBanner}>
          <PlayIcon size={18} />
          <span style={{ flex: 1 }}>Continue from Chapter {currentOrdinal.toLocaleString()}</span>
          <ChevronRightIcon size={16} />
        </Link>
      )}

      {term && rows.length === 0 ? (
        <div className={styles.noMatch}>
          <div className={styles.noMatchTitle}>No chapters match “{filter.trim()}”</div>
          <div>Try a chapter number, or clear the search.</div>
        </div>
      ) : (
        <div className={styles.chapterList}>
          {rows.map(chapter => (
            <ChapterRow
              key={chapter.ordinal}
              slug={novel.slug}
              chapter={chapter}
              current={chapter.ordinal === currentOrdinal}
              read={currentOrdinal !== undefined && chapter.ordinal < currentOrdinal}
              downloaded={downloadedOrdinals.has(chapter.ordinal)}
              isNew={now !== null && Date.parse(chapter.releasedAt) > now - NEW_CHAPTER_WINDOW_MS}
              selectMode={selectMode}
              selected={selected.has(chapter.ordinal)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {selectMode && (
        <div className={styles.selectBar}>
          <span style={{ flex: 1 }}>{selected.size.toLocaleString()} selected for download</span>
          <button type="button" className={styles.selectCancel} onClick={leaveSelectMode}>
            Cancel
          </button>
          <button type="button" className={styles.selectDownload} onClick={onDownloadSelected}>
            <DownloadIcon size={14} /> Download
          </button>
        </div>
      )}

      <div className={styles.listFoot}>
        <span className={styles.chapterWhen}>
          Page {page} of {Math.ceil(novel.chapterCount / CHAPTER_PAGE_SIZE).toLocaleString()}
        </span>
        <Pagination page={page} pageSize={CHAPTER_PAGE_SIZE} total={novel.chapterCount} onPageChange={setPage} />
      </div>
    </div>
  );
}

interface ChapterRowProps {
  slug: string;
  chapter: ChapterMeta;
  current: boolean;
  read: boolean;
  downloaded: boolean;
  isNew: boolean;
  selectMode: boolean;
  selected: boolean;
  onSelect: (ordinal: number) => void;
}

function ChapterRow(props: ChapterRowProps): React.JSX.Element {
  const released = props.chapter.releasedAt ? new Date(props.chapter.releasedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const inner = (
    <>
      {props.selectMode && <span className={cn(styles.checkBox, props.selected && styles.checkBoxOn)}>{props.selected && <CheckIcon size={12} />}</span>}
      <span className={styles.chapterNum}>{props.chapter.ordinal.toLocaleString()}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className={styles.chapterTitle}>{props.chapter.title}</span>
        {released && <div className={styles.chapterWhen}>{released}</div>}
      </span>
      <span className={styles.chapterMarks}>
        {props.isNew && !props.current && <span className={styles.newBadge}>NEW</span>}
        {props.current && <span className={styles.readingBadge}>Reading</span>}
        {props.downloaded && (
          <span title="Downloaded" className={styles.downloadedTick}>
            <DownloadIcon size={15} />
          </span>
        )}
        {props.read && (
          <span title="Read" className={styles.readTick}>
            <CheckIcon size={15} />
          </span>
        )}
      </span>
    </>
  );

  if (props.selectMode) {
    return (
      <button type="button" className={cn(styles.chapterRow, styles.chapterRowButton)} onClick={() => props.onSelect(props.chapter.ordinal)}>
        {inner}
      </button>
    );
  }

  return (
    <Link
      to="/read/$slug/$ordinal"
      params={{ slug: props.slug, ordinal: String(props.chapter.ordinal) }}
      className={cn(styles.chapterRow, props.current && styles.chapterRowCurrent)}
    >
      {inner}
    </Link>
  );
}

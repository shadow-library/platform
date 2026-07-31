/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { cn, EmptyState, Input, SegmentedControl } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { BookmarkIcon, CloseIcon, PlayIcon, ShieldIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { libraryQueryOptions, progressQueryOptions, sessionQueryOptions, useToggleLibraryMutation } from '@/lib/apis';
import { type LibraryEntry, type ReadingProgress } from '@/lib/apis/types';

import styles from './library-screen.module.css';

/**
 * Defining types
 */
export interface LibrarySearch {
  view?: 'grid' | 'list';
}

type LibraryFilter = 'all' | 'reading' | 'unread' | 'completed' | 'updated';

/** A shelf entry decorated with the reading state the tabs, badges and progress bars all key off. */
interface ShelfItem {
  entry: LibraryEntry;
  progress?: ReadingProgress;
  /** Chapters beyond the reader's last-read ordinal — the "+N new" badge, only meaningful once started. */
  newCount: number;
  finished: boolean;
}

/**
 * Declaring the constants
 *
 * The library shelf from the mockups: saved novels with reading-progress overlays, a grid/list toggle,
 * pill filter tabs with counts, search, and a guest sync note. Local-first — guests keep a device shelf; a
 * session syncs it to the server. The `view` toggle rides a search param (mirroring browse) so it survives
 * reloads and is shareable; the active tab and query stay local UI state.
 */
const route = getRouteApi('/_shell/library');

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'unread', label: 'Unread' },
  { value: 'completed', label: 'Completed' },
  { value: 'updated', label: 'Updated' },
];

function matches(filter: LibraryFilter, item: ShelfItem): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'reading':
      return Boolean(item.progress) && !item.finished;
    case 'unread':
      return !item.progress;
    case 'completed':
      return item.entry.novel.status === 'completed' || item.finished;
    case 'updated':
      return item.newCount > 0;
  }
}

/** Compact "last opened" label from progress timestamps. Client-only — the shelf is empty during SSR. */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-US');
}

export function LibraryScreen(): React.JSX.Element {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');

  const session = useQuery(sessionQueryOptions());
  const library = useQuery(libraryQueryOptions(session.data?.userId));
  const progress = useQuery(progressQueryOptions(session.data?.userId));
  const toggleLibrary = useToggleLibraryMutation(session.data?.userId);

  const view = search.view ?? 'grid';
  const signedOut = session.data === null;
  const entries = library.data ?? [];

  const items: ShelfItem[] = entries.map(entry => {
    const entryProgress = progress.data?.[entry.novelSlug];
    const chapterCount = entry.novel.chapterCount;
    const finished = Boolean(entryProgress) && chapterCount > 0 && (entryProgress?.ordinal ?? 0) >= chapterCount;
    const newCount = entryProgress ? Math.max(0, chapterCount - entryProgress.ordinal) : 0;
    return { entry, progress: entryProgress, newCount, finished };
  });

  const counts = FILTERS.reduce<Record<LibraryFilter, number>>((acc, tab) => ({ ...acc, [tab.value]: items.filter(item => matches(tab.value, item)).length }), {
    all: 0,
    reading: 0,
    unread: 0,
    completed: 0,
    updated: 0,
  });

  const term = query.trim().toLowerCase();
  const visible = items.filter(
    item => matches(filter, item) && (!term || item.entry.novel.title.toLowerCase().includes(term) || item.entry.novel.author.toLowerCase().includes(term)),
  );

  const setView = (value: string): void => void navigate({ search: prev => ({ ...prev, view: value === 'list' ? 'list' : undefined }) });

  return (
    <div className={`${styles.page} wn-fade`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.subtitle}>{entries.length.toLocaleString()} saved novels · recently opened first</p>
        </div>
        {entries.length > 0 && (
          <SegmentedControl value={view} onValueChange={setView} aria-label="View">
            <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
            <SegmentedControl.Item value="list">List</SegmentedControl.Item>
          </SegmentedControl>
        )}
      </div>

      {signedOut && (
        <div className={styles.guestNote}>
          <ShieldIcon size={16} />
          <span>
            Saved on this device. <Link to="/login">Sign in</Link> to sync across devices.
          </span>
        </div>
      )}

      {entries.length > 0 && (
        <div className={styles.tabs}>
          {FILTERS.map(tab => (
            <button key={tab.value} type="button" className={cn(styles.tab, tab.value === filter && styles.tabOn)} onClick={() => setFilter(tab.value)}>
              {tab.label}
              <span className={styles.tabCount}>{counts[tab.value]}</span>
            </button>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className={styles.search}>
          <Input value={query} onValueChange={setQuery} placeholder="Search your library…" clearable aria-label="Search library" />
        </div>
      )}

      {entries.length === 0 && (
        <EmptyState
          illustration={<BookmarkIcon size={26} />}
          title="Nothing here yet"
          description="Tap the bookmark on any novel to add it to your library and pick up where you left off."
          action={{ label: 'Browse novels', onClick: () => void navigate({ to: '/browse' }) }}
        />
      )}

      {entries.length > 0 && visible.length === 0 && (
        <EmptyState
          size="inline"
          title={term ? `No novels in your library match “${query}”` : 'No novels in this filter'}
          description={term ? 'Try a different title or author.' : 'Pick another tab to see more of your shelf.'}
        />
      )}

      {visible.length > 0 && view === 'grid' && (
        <div className={styles.grid}>
          {visible.map(item => (
            <ShelfCard key={item.entry.novelSlug} item={item} onRemove={() => toggleLibrary.mutate(item.entry.novel)} />
          ))}
        </div>
      )}

      {visible.length > 0 && view === 'list' && (
        <div className={styles.list}>
          {visible.map(item => (
            <ShelfRow key={item.entry.novelSlug} item={item} onRemove={() => toggleLibrary.mutate(item.entry.novel)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfCard({ item, onRemove }: { item: ShelfItem; onRemove: () => void }): React.JSX.Element {
  const { novel } = item.entry;
  const ordinal = item.progress?.ordinal;
  const pct = item.progress?.position ?? 0;
  const remove = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    onRemove();
  };

  return (
    <Link to="/read/$slug/$ordinal" params={{ slug: novel.slug, ordinal: String(ordinal ?? 1) }} className={styles.gridCard}>
      <Cover cover={novel.cover} title={novel.title}>
        <button type="button" aria-label="Remove from library" className={styles.removeBtn} onClick={remove}>
          <CloseIcon size={14} />
        </button>
        {item.newCount > 0 && <span className={styles.newBadge}>+{item.newCount}</span>}
        <span className={styles.gridProgress}>
          <span className={styles.gridTrack}>
            <span className={styles.gridFill} style={{ width: `${pct}%`, display: 'block' }} />
          </span>
        </span>
      </Cover>
      <span className={styles.gridMeta}>{ordinal ? `Ch. ${ordinal.toLocaleString()} · ${pct}%` : 'Not started'}</span>
    </Link>
  );
}

function ShelfRow({ item, onRemove }: { item: ShelfItem; onRemove: () => void }): React.JSX.Element {
  const { novel } = item.entry;
  const pct = item.progress?.position ?? 0;
  const remove = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    onRemove();
  };

  const meta = item.progress
    ? `Ch. ${item.progress.ordinal.toLocaleString()} of ${novel.chapterCount.toLocaleString()} · ${pct}% · ${timeAgo(item.progress.updatedAt)}`
    : `${novel.chapterCount.toLocaleString()} chapters · Not started`;

  return (
    <Link to="/read/$slug/$ordinal" params={{ slug: novel.slug, ordinal: String(item.progress?.ordinal ?? 1) }} className={styles.listRow}>
      <Cover cover={novel.cover} title={novel.title} showTitle={false} className={styles.listThumb} />
      <div className={styles.listBody}>
        <div className={styles.listTitleRow}>
          <span className={styles.listTitle}>{novel.title}</span>
          {item.newCount > 0 && <span className={styles.listNew}>+{item.newCount} new</span>}
        </div>
        <div className={styles.listMeta}>{meta}</div>
        <span className={styles.listTrack}>
          <span className={styles.listFill} style={{ width: `${pct}%`, display: 'block' }} />
        </span>
      </div>
      <div className={styles.listActions}>
        <span className={styles.playBtn} aria-hidden="true">
          <PlayIcon size={16} />
        </span>
        <button type="button" aria-label="Remove from library" className={styles.rowRemoveBtn} onClick={remove}>
          <CloseIcon size={15} />
        </button>
      </div>
    </Link>
  );
}

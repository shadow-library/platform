/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, cn, Input, Pagination, Tabs, toast, Tooltip } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AlertIcon, BackIcon, BookmarkFilledIcon, BookmarkIcon, CheckIcon, ChevronRightIcon, DownloadIcon, PlayIcon, StarIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { DownloadDialog } from '@/features/downloads/download-dialog';
import { chapterListQueryOptions, getProgress, isInLibrary, libraryQueryOptions, novelQueryOptions, sessionQueryOptions, useToggleLibraryMutation } from '@/lib/apis';
import { type ChapterMeta, type NovelDetail } from '@/lib/apis/types';
import { getDownloadedNovel } from '@/lib/offline';

import styles from './novel-screen.module.css';

/**
 * Defining types
 */
const CHAPTER_PAGE_SIZE = 100;

const route = getRouteApi('/_shell/novels/$slug');

/**
 * Declaring the constants
 *
 * The novel detail screen: cover hero with actions, stats strip, sticky Overview/Chapters tabs; the
 * chapters panel has search, jump-to, a continue banner, and per-row downloaded/read markers.
 */
export function NovelScreen(): React.JSX.Element {
  const { slug } = route.useParams();
  const router = useRouter();
  const novel = useQuery(novelQueryOptions(slug));
  const session = useQuery(sessionQueryOptions());
  const library = useQuery(libraryQueryOptions(Boolean(session.data)));
  const toggleLibrary = useToggleLibraryMutation(Boolean(session.data));
  const [downloadOpen, setDownloadOpen] = useState(false);

  if (!novel.data) return <div className={styles.content} />;
  const data = novel.data;
  const inLibrary = isInLibrary(library.data, slug);
  const progress = getProgress(slug);

  const onShare = async (): Promise<void> => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: data.title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  return (
    <div className="wn-fade">
      <div className={styles.hero} style={{ background: `linear-gradient(158deg, ${data.cover.from} 0%, ${data.cover.to} 100%)` }}>
        <div className={styles.heroScrim} />
        <div className={styles.heroInner}>
          <button type="button" className={styles.backBtn} onClick={() => router.history.back()}>
            <BackIcon size={16} /> Back
          </button>
          <div className={styles.heroGrid}>
            <div className={styles.heroCover}>
              <Cover cover={data.cover} title={data.title} showTitle={false} />
            </div>
            <div className={styles.heroBody}>
              <h1 className={styles.heroTitle}>{data.title}</h1>
              {data.alternativeTitles.length > 0 && <div className={styles.heroAlt}>{data.alternativeTitles.join(' · ')}</div>}
              <div className={styles.heroBy}>
                by <strong>{data.author}</strong>
                {data.translator && <span> · tr. {data.translator}</span>}
              </div>
              <div className={styles.ratingBlock}>
                <span className={styles.ratingBig}>{data.rating.toFixed(1)}</span>
                <span className={styles.ratingDetail}>
                  <span className={styles.stars}>
                    {Array.from({ length: 5 }, (_, index) => (
                      <StarIcon key={index} size={15} className={index < Math.round(data.rating) ? undefined : styles.starDim} />
                    ))}
                  </span>
                  <span>{data.ratingCount.toLocaleString()} reviews</span>
                </span>
                <span className={styles.statusRow}>{data.status === 'ongoing' ? 'Ongoing' : data.status === 'completed' ? 'Completed' : 'Hiatus'}</span>
              </div>
              <div className={styles.genreRow}>
                {data.genres.map(genre => (
                  <Link key={genre} to="/browse" search={{ genre }} className={styles.genrePill}>
                    {genre}
                  </Link>
                ))}
              </div>
              <div className={styles.actionRow}>
                <Button variant="primary" size="lg" asChild>
                  <Link to="/read/$slug/$ordinal" params={{ slug, ordinal: String(progress?.ordinal ?? 1) }}>
                    <PlayIcon size={16} /> {progress ? `Continue · Ch. ${progress.ordinal.toLocaleString()}` : 'Start reading'}
                  </Link>
                </Button>
                <button type="button" className={styles.ghostAction} onClick={() => toggleLibrary.mutate(data)}>
                  {inLibrary ? <BookmarkFilledIcon size={16} /> : <BookmarkIcon size={16} />}
                  {inLibrary ? 'In Library' : 'Add to Library'}
                </button>
                <Tooltip content="Download chapters">
                  <button type="button" aria-label="Download chapters" className={`${styles.ghostAction} ${styles.iconAction}`} onClick={() => setDownloadOpen(true)}>
                    <DownloadIcon size={18} />
                  </button>
                </Tooltip>
                <Tooltip content="Share">
                  <button type="button" aria-label="Share" className={`${styles.ghostAction} ${styles.iconAction}`} onClick={() => void onShare()}>
                    <ChevronRightIcon size={17} />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.statsStrip}>
        <div className={styles.statsInner}>
          <Stat label="Chapters" value={data.chapterCount.toLocaleString()} />
          <Stat label="Status" value={data.status === 'ongoing' ? 'Ongoing' : data.status === 'completed' ? 'Completed' : 'Hiatus'} />
          <Stat label="Language" value={data.language} />
          <Stat label="Rating" value={data.rating.toFixed(1)} />
          <Stat label="Reads" value={data.views.toLocaleString()} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <div className={styles.tabsWrap}>
          <div className={styles.tabsInner}>
            <Tabs.List aria-label="Novel sections">
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              <Tabs.Tab value="chapters">Chapters</Tabs.Tab>
            </Tabs.List>
          </div>
        </div>
        <div className={styles.content}>
          <Tabs.Panel value="overview">
            <OverviewPanel novel={data} />
          </Tabs.Panel>
          <Tabs.Panel value="chapters">
            <ChaptersPanel novel={data} currentOrdinal={progress?.ordinal} />
          </Tabs.Panel>
        </div>
      </Tabs>

      <DownloadDialog novel={data} open={downloadOpen} onOpenChange={setDownloadOpen} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

function OverviewPanel({ novel }: { novel: NovelDetail }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      {novel.mature && (
        <div className={styles.matureWarn}>
          <AlertIcon size={17} />
          <span>
            <strong>Mature content.</strong> This novel contains themes intended for adult readers.
          </span>
        </div>
      )}
      <section>
        <h2 className={styles.sectionTitle}>Synopsis</h2>
        <p className={cn(styles.synopsis, !expanded && 'wn-clamp3')}>{novel.synopsis}</p>
        <button type="button" className={styles.readMore} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
        <div className={styles.tagRow}>
          {novel.tags.map(tag => (
            <span key={tag} className={styles.tagChip}>
              #{tag}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChaptersPanel({ novel, currentOrdinal }: { novel: NovelDetail; currentOrdinal?: number }): React.JSX.Element {
  const [page, setPage] = useState(currentOrdinal ? Math.ceil(currentOrdinal / CHAPTER_PAGE_SIZE) : 1);
  const [filter, setFilter] = useState('');
  const [jump, setJump] = useState('');
  const [downloadedOrdinals, setDownloadedOrdinals] = useState<Set<number>>(new Set());
  const chapters = useQuery(chapterListQueryOptions(novel.slug, page, CHAPTER_PAGE_SIZE));
  const router = useRouter();

  useEffect(() => {
    void getDownloadedNovel(novel.slug).then(record => setDownloadedOrdinals(new Set(record?.ordinals ?? [])));
  }, [novel.slug]);

  const term = filter.trim().toLowerCase();
  const rows = (chapters.data?.items ?? []).filter(chapter => !term || chapter.title.toLowerCase().includes(term) || String(chapter.ordinal).includes(term));

  const onJump = (): void => {
    const ordinal = Number.parseInt(jump, 10);
    if (!Number.isFinite(ordinal) || ordinal < 1 || ordinal > novel.chapterCount) {
      toast.warning(`Enter a chapter between 1 and ${novel.chapterCount.toLocaleString()}`);
      return;
    }
    void router.navigate({ to: '/read/$slug/$ordinal', params: { slug: novel.slug, ordinal: String(ordinal) } });
  };

  return (
    <div>
      <div className={styles.chaptersHead}>
        <h2 className={styles.sectionTitle}>{novel.chapterCount.toLocaleString()} chapters</h2>
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

      {currentOrdinal && (
        <Link to="/read/$slug/$ordinal" params={{ slug: novel.slug, ordinal: String(currentOrdinal) }} className={styles.continueBanner}>
          <PlayIcon size={18} />
          <span style={{ flex: 1 }}>Continue from Chapter {currentOrdinal.toLocaleString()}</span>
          <ChevronRightIcon size={16} />
        </Link>
      )}

      <div className={styles.chapterList}>
        {rows.map(chapter => (
          <ChapterRow
            key={chapter.ordinal}
            slug={novel.slug}
            chapter={chapter}
            current={chapter.ordinal === currentOrdinal}
            read={currentOrdinal !== undefined && chapter.ordinal < currentOrdinal}
            downloaded={downloadedOrdinals.has(chapter.ordinal)}
          />
        ))}
      </div>

      <div className={styles.listFoot}>
        <span className={styles.chapterWhen}>
          Page {page} of {Math.ceil(novel.chapterCount / CHAPTER_PAGE_SIZE).toLocaleString()}
        </span>
        <Pagination page={page} pageSize={CHAPTER_PAGE_SIZE} total={novel.chapterCount} onPageChange={setPage} />
      </div>
    </div>
  );
}

function ChapterRow(props: { slug: string; chapter: ChapterMeta; current: boolean; read: boolean; downloaded: boolean }): React.JSX.Element {
  const released = new Date(props.chapter.releasedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <Link
      to="/read/$slug/$ordinal"
      params={{ slug: props.slug, ordinal: String(props.chapter.ordinal) }}
      className={cn(styles.chapterRow, props.current && styles.chapterRowCurrent)}
    >
      <span className={styles.chapterNum}>{props.chapter.ordinal.toLocaleString()}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className={styles.chapterTitle}>{props.chapter.title}</span>
        <div className={styles.chapterWhen}>{released}</div>
      </span>
      <span className={styles.chapterMarks}>
        {props.current && <PlayIcon size={14} />}
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
    </Link>
  );
}

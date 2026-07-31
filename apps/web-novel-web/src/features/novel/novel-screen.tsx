/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, cn, Input, Pagination, Tabs, Textarea, toast, Tooltip } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import {
  AlertIcon,
  BackIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  LockIcon,
  PlayIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
} from '@/components/icons';
import { Cover, NovelCard } from '@/components/novel';
import { DownloadDialog } from '@/features/downloads/download-dialog';
import { chapterListQueryOptions, getProgress, isInLibrary, libraryQueryOptions, novelQueryOptions, sessionQueryOptions, useToggleLibraryMutation } from '@/lib/apis';
import {
  type ChapterMeta,
  type NovelCharacter,
  type NovelComment,
  type NovelCommentReply,
  type NovelDetail,
  type NovelIllustration,
  type NovelReview,
  type NovelStatus,
} from '@/lib/apis/types';
import { getDownloadedNovel } from '@/lib/offline';

import { MatureGate, useMatureGate } from './mature-gate';
import styles from './novel-screen.module.css';

/**
 * Defining types
 */
type ReviewSort = 'helpful' | 'rating' | 'recent';
type CommentSort = 'recent' | 'top';

/**
 * Declaring the constants
 *
 * The novel detail screen: cover hero with actions, a stats strip, and sticky Overview / Chapters /
 * Reviews / Comments tabs. Overview carries synopsis + characters + illustrations + related; chapters
 * adds sort, select-to-download, and per-row markers; reviews and comments render the community layer.
 */
const CHAPTER_PAGE_SIZE = 100;
const NEW_CHAPTER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const route = getRouteApi('/_shell/novels/$slug');

const STATUS_LABEL: Record<NovelStatus, string> = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus' };
const STATUS_DOT: Record<NovelStatus, string> = { ongoing: 'var(--sh-green-500)', completed: 'var(--sh-indigo-400)', hiatus: 'var(--sh-amber-500)' };

const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'helpful', label: 'Most helpful' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'recent', label: 'Newest' },
];

const COMMENT_SORTS: { value: CommentSort; label: string }[] = [
  { value: 'recent', label: 'Newest' },
  { value: 'top', label: 'Top' },
];

/** Local glyphs the shared icon set does not carry, drawn in the same Lucide stroke style. */
function glyph(paths: React.ReactNode): (props: { size?: number; className?: string }) => React.JSX.Element {
  return function Glyph({ size = 18, className }): React.JSX.Element {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

const ShareIcon = glyph(
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
  </>,
);
const FlagIcon = glyph(
  <>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </>,
);
const ThumbsUpIcon = glyph(
  <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" />,
);
const EyeOffIcon = glyph(
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />,
);
const ImageIcon = glyph(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>,
);
const CheckSquareIcon = glyph(<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />);
const SortIcon = glyph(<path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" />);

export function NovelScreen(): React.JSX.Element {
  const { slug } = route.useParams();
  const router = useRouter();
  const novel = useQuery(novelQueryOptions(slug));
  const session = useQuery(sessionQueryOptions());
  const library = useQuery(libraryQueryOptions(session.data?.userId));
  const toggleLibrary = useToggleLibraryMutation(session.data?.userId);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const { gateVisible, reveal } = useMatureGate(novel.data?.mature ?? false);

  if (!novel.data) return <div className={styles.content} />;
  const data = novel.data;
  const inLibrary = isInLibrary(library.data, slug);
  const progress = getProgress(slug, session.data?.userId);

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
              <div className={styles.ratingWrap}>
                <button type="button" className={styles.ratingBlock} onClick={() => setTab('reviews')}>
                  <span className={styles.ratingBig}>{data.rating.toFixed(1)}</span>
                  <span className={styles.ratingDetail}>
                    <span className={styles.stars}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <StarIcon key={index} size={15} className={index < Math.round(data.rating) ? undefined : styles.starDim} />
                      ))}
                    </span>
                    <span className={styles.reviewLink}>{data.ratingCount.toLocaleString()} reviews</span>
                  </span>
                </button>
                <span className={styles.statusRow}>
                  <span className={styles.statusDot} style={{ background: STATUS_DOT[data.status] }} />
                  {STATUS_LABEL[data.status]}
                </span>
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
                    <ShareIcon size={17} />
                  </button>
                </Tooltip>
                <Tooltip content="Report">
                  <button type="button" aria-label="Report" className={`${styles.ghostAction} ${styles.iconAction}`} onClick={() => reportToast('this novel')}>
                    <FlagIcon size={17} />
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
          <Stat label="Status" value={STATUS_LABEL[data.status]} />
          <Stat label="Updated" value={formatUpdated(data.updatedAt)} />
          <Stat label="Language" value={data.language} />
          <Stat label="Rating" value={data.rating.toFixed(1)} />
        </div>
      </div>

      {gateVisible ? (
        <MatureGate novelTitle={data.title} onContinue={reveal} onBack={() => router.history.back()} />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className={styles.tabsWrap}>
            <div className={styles.tabsInner}>
              <Tabs.List aria-label="Novel sections">
                <Tabs.Tab value="overview">Overview</Tabs.Tab>
                <Tabs.Tab value="chapters">Chapters</Tabs.Tab>
                <Tabs.Tab value="reviews">Reviews</Tabs.Tab>
                <Tabs.Tab value="comments">Comments</Tabs.Tab>
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
            <Tabs.Panel value="reviews">
              <ReviewsPanel novel={data} />
            </Tabs.Panel>
            <Tabs.Panel value="comments">
              <CommentsPanel novel={data} signedIn={!!session.data?.userId} accountName={session.data?.name ?? 'You'} />
            </Tabs.Panel>
          </div>
        </Tabs>
      )}

      <DownloadDialog novel={data} open={downloadOpen} onOpenChange={setDownloadOpen} />
    </div>
  );
}

function reportToast(target: string): void {
  toast.info(`Reported ${target}. Thanks — our team will take a look.`);
}

/** Locale and timezone are pinned so this SSR-rendered stat cell formats identically on server and client. */
function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

function Stars({ value, size = 15 }: { value: number; size?: number }): React.JSX.Element {
  const filled = Math.round(value);
  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, index) => (
        <StarIcon key={index} size={size} className={index < filled ? undefined : styles.starEmpty} />
      ))}
    </span>
  );
}

function OverviewPanel({ novel }: { novel: NovelDetail }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const characters = novel.characters ?? [];
  const illustrations = novel.illustrations ?? [];
  const related = novel.related ?? [];
  const visibleIllustrations = illustrations.slice(0, 6);
  const extraIllustrations = illustrations.length - visibleIllustrations.length;

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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Synopsis</h2>
        <p className={cn(styles.synopsis, !expanded && 'wn-clamp3')}>{novel.synopsis}</p>
        <button type="button" className={styles.readMore} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Show less' : 'Read more'}
          <ChevronDownIcon size={15} className={expanded ? styles.chevronUp : undefined} />
        </button>
        <div className={styles.tagRow}>
          {novel.tags.map(tag => (
            <Link key={tag} to="/browse" search={{ q: tag }} className={styles.tagChip}>
              #{tag}
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Characters</h2>
        {characters.length === 0 ? (
          <div className={styles.emptyBox}>No character profiles have been added for this novel yet.</div>
        ) : (
          <div className={cn(styles.hscroll, 'wn-hscroll')}>
            {characters.map(character => (
              <CharacterCard key={character.name} character={character} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Illustrations</h2>
          {extraIllustrations > 0 && <span className={styles.sectionMeta}>+{extraIllustrations} more</span>}
        </div>
        {illustrations.length === 0 ? (
          <div className={cn(styles.emptyBox, styles.emptyBoxIcon)}>
            <ImageIcon size={26} />
            <span>No illustrations for this novel yet.</span>
          </div>
        ) : (
          <div className={styles.illGrid}>
            {visibleIllustrations.map(illustration => (
              <IllustrationTile key={illustration.id} illustration={illustration} />
            ))}
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Readers also enjoyed</h2>
          <div className={cn(styles.hscroll, 'wn-hscroll')}>
            {related.map(item => (
              <div key={item.slug} className={styles.relatedCard}>
                <NovelCard novel={item} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CharacterCard({ character }: { character: NovelCharacter }): React.JSX.Element {
  const [from, to] = character.color ?? ['#6366f1', '#312e81'];
  return (
    <div className={styles.charCard}>
      <div className={styles.charTile} style={{ background: `linear-gradient(158deg, ${from} 0%, ${to} 100%)` }}>
        <span className={styles.charGlyph}>{character.name.charAt(0)}</span>
      </div>
      <div className={styles.charName}>{character.name}</div>
      <div className={styles.charRole}>{character.role}</div>
    </div>
  );
}

function IllustrationTile({ illustration }: { illustration: NovelIllustration }): React.JSX.Element {
  const [from, to] = illustration.color ?? ['#6366f1', '#312e81'];
  return (
    <div className={styles.illTile} style={{ background: `linear-gradient(158deg, ${from} 0%, ${to} 100%)` }} title={illustration.caption}>
      <ImageIcon size={26} className={styles.illGlyph} />
      {illustration.caption && <span className={styles.illCaption}>{illustration.caption}</span>}
    </div>
  );
}

function ChaptersPanel({ novel, currentOrdinal }: { novel: NovelDetail; currentOrdinal?: number }): React.JSX.Element {
  const [page, setPage] = useState(currentOrdinal ? Math.ceil(currentOrdinal / CHAPTER_PAGE_SIZE) : 1);
  const [filter, setFilter] = useState('');
  const [jump, setJump] = useState('');
  const [sortDir, setSortDir] = useState<'oldest' | 'newest'>('oldest');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloadedOrdinals, setDownloadedOrdinals] = useState<Set<number>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  const chapters = useQuery(chapterListQueryOptions(novel.slug, page, CHAPTER_PAGE_SIZE));
  const router = useRouter();

  useEffect(() => {
    void getDownloadedNovel(novel.slug).then(record => setDownloadedOrdinals(new Set(record?.ordinals ?? [])));
  }, [novel.slug]);

  useEffect(() => setNow(Date.now()), []);

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

function ReviewsPanel({ novel }: { novel: NovelDetail }): React.JSX.Element {
  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const reviews = novel.reviews ?? [];

  const sorted = useMemo(() => {
    const list = [...reviews];
    if (sort === 'helpful') return list.sort((a, b) => b.helpful - a.helpful);
    if (sort === 'rating') return list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [reviews, sort]);

  const distribution = novel.ratingDistribution ?? [0, 0, 0, 0, 0];
  const distTotal = distribution.reduce((accumulator, value) => accumulator + value, 0) || 1;

  const reveal = (id: string): void => setRevealed(prev => new Set(prev).add(id));
  const vote = (id: string): void => setVoted(prev => new Set(prev).add(id));

  return (
    <div>
      <div className={styles.reviewSummary}>
        <div className={styles.reviewScore}>
          <div className={styles.reviewBig}>{novel.rating.toFixed(1)}</div>
          <Stars value={novel.rating} size={17} />
          <div className={styles.reviewCount}>{novel.ratingCount.toLocaleString()} reviews</div>
        </div>
        <div className={styles.distList}>
          {distribution.map((count, index) => {
            const pct = Math.round((count / distTotal) * 100);
            return (
              <div key={index} className={styles.distRow}>
                <span className={styles.distStar}>{5 - index}</span>
                <StarIcon size={11} className={styles.distStarIcon} />
                <span className={styles.distTrack}>
                  <span className={styles.distFill} style={{ width: `${pct}%` }} />
                </span>
                <span className={styles.distPct}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.reviewToolbar}>
        <div className={styles.chipRow}>
          {REVIEW_SORTS.map(option => (
            <button key={option.value} type="button" className={cn(styles.chip, sort === option.value && styles.chipActive)} onClick={() => setSort(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={() => toast.info('Thanks! Review posting is coming soon.')}>
          Write a review
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No reviews yet</div>
          <div>Be the first to share your thoughts on this novel.</div>
        </div>
      ) : (
        sorted.map(review => <ReviewCard key={review.id} review={review} revealed={revealed.has(review.id)} voted={voted.has(review.id)} onReveal={reveal} onVote={vote} />)
      )}
    </div>
  );
}

interface ReviewCardProps {
  review: NovelReview;
  revealed: boolean;
  voted: boolean;
  onReveal: (id: string) => void;
  onVote: (id: string) => void;
}

function ReviewCard({ review, revealed, voted, onReveal, onVote }: ReviewCardProps): React.JSX.Element {
  const showBody = !review.spoiler || revealed;
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <Avatar name={review.user} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.cardUser}>{review.user}</div>
          <div className={styles.cardWhen}>{review.when}</div>
        </div>
        <Stars value={review.rating} size={14} />
      </div>
      {showBody ? (
        <p className={styles.cardBody}>{review.body}</p>
      ) : (
        <button type="button" className={styles.spoilerButton} onClick={() => onReveal(review.id)}>
          <EyeOffIcon size={15} /> Spoiler — tap to reveal
        </button>
      )}
      <div className={styles.cardActions}>
        <button type="button" className={cn(styles.cardAction, voted && styles.cardActionOn)} onClick={() => onVote(review.id)}>
          <ThumbsUpIcon size={15} /> Helpful · {(review.helpful + (voted ? 1 : 0)).toLocaleString()}
        </button>
        <button type="button" className={styles.cardAction} onClick={() => reportToast('this review')}>
          Report
        </button>
      </div>
    </div>
  );
}

function CommentsPanel({ novel, signedIn, accountName }: { novel: NovelDetail; signedIn: boolean; accountName: string }): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [sort, setSort] = useState<CommentSort>('recent');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const comments = novel.comments ?? [];

  const sorted = useMemo(() => {
    if (sort === 'top') return [...comments].sort((a, b) => b.likes - a.likes);
    return comments;
  }, [comments, sort]);

  const reveal = (id: string): void => setRevealed(prev => new Set(prev).add(id));
  const like = (id: string): void => setLiked(prev => new Set(prev).add(id));

  const onPost = (): void => {
    if (!signedIn) {
      toast.warning('Sign in to join the conversation');
      return;
    }
    if (!draft.trim()) {
      toast.warning('Write something first');
      return;
    }
    toast.success('Comment posted');
    setDraft('');
  };

  return (
    <div>
      <div className={styles.composer}>
        <Avatar name={accountName} size="sm" />
        <div style={{ flex: 1 }}>
          <Textarea value={draft} onValueChange={setDraft} placeholder="Share your thoughts on this novel…" minRows={2} aria-label="Write a comment" />
        </div>
      </div>
      <div className={styles.composerFoot}>
        {!signedIn && (
          <span className={styles.signInHint}>
            <LockIcon size={13} /> Sign in to post — reading comments is always open
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Button variant="primary" size="sm" onClick={onPost}>
          Post comment
        </Button>
      </div>

      <div className={styles.commentsHead}>
        <span className={styles.commentsTitle}>Comments</span>
        <span style={{ flex: 1 }} />
        <div className={styles.chipRow}>
          {COMMENT_SORTS.map(option => (
            <button key={option.value} type="button" className={cn(styles.chip, sort === option.value && styles.chipActive)} onClick={() => setSort(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No comments yet</div>
          <div>Start the discussion — be the first to comment.</div>
        </div>
      ) : (
        sorted.map(comment => <CommentCard key={comment.id} comment={comment} revealed={revealed} liked={liked} onReveal={reveal} onLike={like} />)
      )}
    </div>
  );
}

interface CommentCardProps {
  comment: NovelComment;
  revealed: Set<string>;
  liked: Set<string>;
  onReveal: (id: string) => void;
  onLike: (id: string) => void;
}

function CommentCard({ comment, revealed, liked, onReveal, onLike }: CommentCardProps): React.JSX.Element {
  if (comment.state === 'deleted') {
    return (
      <div className={styles.commentRow}>
        <div className={styles.commentRemoved}>
          <TrashIcon size={15} /> This comment was deleted by its author.
        </div>
      </div>
    );
  }
  if (comment.state === 'moderated') {
    return (
      <div className={styles.commentRow}>
        <div className={styles.commentRemoved}>
          <ShieldIcon size={15} /> Removed by a moderator for violating community guidelines.
        </div>
      </div>
    );
  }

  const showBody = !comment.spoiler || revealed.has(comment.id);
  const isLiked = liked.has(comment.id);
  return (
    <div className={styles.commentRow}>
      <div className={styles.commentMain}>
        <Avatar name={comment.user} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.commentMeta}>
            <span className={styles.cardUser}>{comment.user}</span>
            <span className={styles.cardWhen}>{comment.when}</span>
          </div>
          {showBody ? (
            <p className={styles.commentBody}>{comment.body}</p>
          ) : (
            <button type="button" className={cn(styles.spoilerButton, styles.spoilerInline)} onClick={() => onReveal(comment.id)}>
              <EyeOffIcon size={14} /> Spoiler — tap to reveal
            </button>
          )}
          <div className={styles.cardActions}>
            <button type="button" className={cn(styles.cardAction, isLiked && styles.cardActionOn)} onClick={() => onLike(comment.id)}>
              <ThumbsUpIcon size={14} /> {(comment.likes + (isLiked ? 1 : 0)).toLocaleString()}
            </button>
            <button type="button" className={styles.cardAction} onClick={() => toast.info('Replies open in the full thread.')}>
              Reply
            </button>
            <button type="button" className={styles.cardAction} onClick={() => reportToast('this comment')}>
              Report
            </button>
          </div>
          {comment.replies && comment.replies.length > 0 && (
            <div className={styles.replyList}>
              {comment.replies.map(reply => (
                <ReplyCard key={reply.id} reply={reply} revealed={revealed.has(reply.id)} onReveal={onReveal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplyCard({ reply, revealed, onReveal }: { reply: NovelCommentReply; revealed: boolean; onReveal: (id: string) => void }): React.JSX.Element {
  const showBody = !reply.spoiler || revealed;
  return (
    <div className={styles.replyRow}>
      <Avatar name={reply.user} size="xs" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.commentMeta}>
          <span className={styles.replyUser}>{reply.user}</span>
          <span className={styles.cardWhen}>{reply.when}</span>
        </div>
        {showBody ? (
          <p className={styles.replyBody}>{reply.body}</p>
        ) : (
          <button type="button" className={cn(styles.spoilerButton, styles.spoilerInline)} onClick={() => onReveal(reply.id)}>
            <EyeOffIcon size={13} /> Spoiler — reveal
          </button>
        )}
      </div>
    </div>
  );
}

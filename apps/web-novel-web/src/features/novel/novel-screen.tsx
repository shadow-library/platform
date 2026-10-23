import { Button, Tabs, toast, Tooltip } from '@shadow-library/ui';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { BackIcon, BookmarkFilledIcon, BookmarkIcon, DownloadIcon, FlagIcon, PlayIcon, ShareIcon, StarIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { DownloadDialog } from '@/features/downloads/download-dialog';
import { WikiPreview } from '@/features/wiki';
import { getProgress, isInLibrary, libraryQueryOptions, novelQueryOptions, sessionQueryOptions, useToggleLibraryMutation } from '@/lib/apis';
import { type NovelStatus } from '@/lib/apis/types';

import { ChaptersPanel } from './chapters-panel';
import { CommentsPanel } from './comments-panel';
import { MatureGate, useMatureGate } from './mature-gate';
import styles from './novel-screen.module.css';
import { OverviewPanel } from './overview-panel';
import { reportToast } from './report-toast';
import { ReviewsPanel } from './reviews-panel';

const route = getRouteApi('/_shell/novels/$slug');

const STATUS_LABEL: Record<NovelStatus, string> = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus' };
const STATUS_DOT: Record<NovelStatus, string> = { ongoing: 'var(--sh-green-500)', completed: 'var(--sh-indigo-400)', hiatus: 'var(--sh-amber-500)' };

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
                <Tabs.Tab value="wiki">Wiki</Tabs.Tab>
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
            <Tabs.Panel value="wiki">
              <WikiPreview slug={slug} />
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

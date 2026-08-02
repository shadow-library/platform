/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, toast } from '@shadow-library/ui';
import { usePwaInstall } from '@shadow-library/web/pwa';

/**
 * Importing user defined packages
 */
import { ChevronRightIcon, DownloadIcon, ExternalIcon, PlayIcon, StarIcon } from '@/components/icons';
import { Cover, formatCount, NovelCard } from '@/components/novel';
import styles from '@/features/home/home-screen.module.css';
import { catalogQueryOptions, progressQueryOptions, sessionQueryOptions } from '@/lib/apis';
import { type NovelSummary, type ReadingProgress } from '@/lib/apis/types';
import { NOVEL_FORGE_URL } from '@/lib/constants';

/**
 * Defining types
 */
interface ContinueItem {
  novel: NovelSummary;
  progress: ReadingProgress;
}

/**
 * Declaring the constants
 *
 * The dashboard from the mockups: continue-reading hero, resume cards, trending poster row, recently
 * updated list, genre chips, and the Novel Forge / install-app promo pair.
 */
function timeAgo(iso: string): string {
  const hours = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function HomeScreen(): React.JSX.Element {
  const session = useQuery(sessionQueryOptions());
  const trending = useQuery(catalogQueryOptions({ sort: 'trending', limit: 12 }));
  const updated = useQuery(catalogQueryOptions({ sort: 'updated', limit: 6 }));
  const ranked = useQuery(catalogQueryOptions({ sort: 'popular', limit: 8 }));
  const progress = useQuery(progressQueryOptions(session.data?.userId));
  const navigate = useNavigate();

  const novels = trending.data?.items ?? [];
  const progressMap = progress.data ?? {};
  const continueItems: ContinueItem[] = Object.values(progressMap)
    .map(entry => {
      const novel = novels.find(item => item.slug === entry.novelSlug) ?? updated.data?.items.find(item => item.slug === entry.novelSlug);
      return novel ? { novel, progress: entry } : undefined;
    })
    .filter((item): item is ContinueItem => item !== undefined)
    .sort((a, b) => Date.parse(b.progress.updatedAt) - Date.parse(a.progress.updatedAt));

  const featured = continueItems[0]?.novel ?? novels[0];
  const featuredProgress = featured ? progressMap[featured.slug] : undefined;

  return (
    <div className={`${styles.page} wn-fade`}>
      {featured && (
        <section className={styles.heroWrap}>
          <div className={styles.hero} style={{ background: `linear-gradient(158deg, ${featured.cover.from} 0%, ${featured.cover.to} 100%)` }}>
            <span className={styles.heroGlyph} aria-hidden="true">
              {featured.title.charAt(0)}
            </span>
            <div className={styles.heroScrim} />
            <div className={styles.heroBody}>
              <div className={styles.heroKicker}>{featuredProgress ? 'Continue reading' : 'Featured'}</div>
              <h1 className={styles.heroTitle}>{featured.title}</h1>
              <div className={styles.heroMeta}>
                <span className={styles.heroMetaStrong}>
                  <StarIcon size={14} />
                  {featured.rating.toFixed(1)}
                </span>
                <span>{featured.chapterCount.toLocaleString()} chapters</span>
                <span className={styles.heroStatus}>
                  <span className={styles.statusDot} data-status={featured.status} />
                  {featured.status === 'ongoing' ? 'Ongoing' : featured.status === 'completed' ? 'Completed' : 'Hiatus'}
                </span>
              </div>
              <p className={`${styles.heroSynopsis} wn-clamp2`}>{featured.synopsis}</p>
              <div className={styles.heroActions}>
                <Button variant="primary" size="lg" asChild>
                  <Link to="/read/$slug/$ordinal" params={{ slug: featured.slug, ordinal: String(featuredProgress?.ordinal ?? 1) }}>
                    <PlayIcon size={16} /> {featuredProgress ? `Continue · Ch. ${featuredProgress.ordinal.toLocaleString()}` : 'Start reading'}
                  </Link>
                </Button>
                <Link to="/novels/$slug" params={{ slug: featured.slug }} className={styles.heroGhostBtn}>
                  View details
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {continueItems.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Continue reading</h2>
              <p className={styles.sectionSub}>Pick up where you left off</p>
            </div>
            <Link to="/library" className={styles.seeAll}>
              See all <ChevronRightIcon size={15} />
            </Link>
          </div>
          <div className={`${styles.hRow} wn-hscroll`}>
            {continueItems.slice(0, 6).map(item => (
              <ContinueCard key={item.novel.slug} item={item} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Trending now</h2>
            <p className={styles.sectionSub}>What everyone is reading this week</p>
          </div>
          <Link to="/browse" className={styles.seeAll}>
            See all <ChevronRightIcon size={15} />
          </Link>
        </div>
        <div className={`${styles.hRow} wn-hscroll`}>
          {novels.slice(0, 10).map(novel => (
            <div key={novel.slug} className={styles.posterCard}>
              <NovelCard novel={novel} />
            </div>
          ))}
        </div>
      </section>

      {(ranked.data?.items?.length ?? 0) > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Top ranked</h2>
              <p className={styles.sectionSub}>Most read on Shadow this month</p>
            </div>
            <Link to="/browse" search={{ sort: 'popular' }} className={styles.seeAll}>
              See all <ChevronRightIcon size={15} />
            </Link>
          </div>
          <div className={`${styles.hRow} ${styles.hRowTight} wn-hscroll`}>
            {(ranked.data?.items ?? []).slice(0, 8).map((novel, index) => (
              <RankedCard key={novel.slug} novel={novel} rank={index + 1} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Recently updated</h2>
          </div>
          <Link to="/browse" search={{ sort: 'updated' }} className={styles.seeAll}>
            See all <ChevronRightIcon size={15} />
          </Link>
        </div>
        <div className={styles.updatedList}>
          {(updated.data?.items ?? []).map(novel => (
            <Link key={novel.slug} to="/novels/$slug" params={{ slug: novel.slug }} className={styles.updatedRow}>
              <div className={styles.updatedCover}>
                <Cover cover={novel.cover} title={novel.title} showTitle={false} />
              </div>
              <div className={styles.updatedBody}>
                <div className={styles.updatedTitle}>{novel.title}</div>
                <div className={styles.updatedSub}>
                  {novel.author} · <strong>Ch. {novel.chapterCount.toLocaleString()}</strong>
                </div>
              </div>
              <div className={styles.updatedRight}>
                <span className={styles.updatedWhen}>{timeAgo(novel.updatedAt)}</span>
                <button
                  type="button"
                  className={styles.readLatestBtn}
                  aria-label={`Read the latest chapter of ${novel.title}`}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    void navigate({ to: '/read/$slug/$ordinal', params: { slug: novel.slug, ordinal: String(novel.chapterCount) } });
                  }}
                >
                  <PlayIcon size={15} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Browse by genre</h2>
        </div>
        <div className={styles.genreChips}>
          {(trending.data?.genres ?? []).slice(0, 12).map(genre => (
            <Link key={genre} to="/browse" search={{ genre }} className={styles.genreChip}>
              {genre}
            </Link>
          ))}
        </div>
      </section>

      <PromoSection />
    </div>
  );
}

function ContinueCard({ item }: { item: ContinueItem }): React.JSX.Element {
  const pct = item.progress.position;
  return (
    <Link to="/read/$slug/$ordinal" params={{ slug: item.novel.slug, ordinal: String(item.progress.ordinal) }} className={styles.continueCard}>
      <div className={styles.continueCover}>
        <Cover cover={item.novel.cover} title={item.novel.title} showTitle={false} />
      </div>
      <div className={styles.continueBody}>
        <div>
          <div className={styles.continueTitle}>{item.novel.title}</div>
          <div className={styles.continueSub}>
            Ch. {item.progress.ordinal.toLocaleString()} · {timeAgo(item.progress.updatedAt)}
          </div>
        </div>
        <div>
          <div style={{ height: 5, borderRadius: 9999, background: 'var(--sh-surface-well)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--sh-accent)', borderRadius: 9999 }} />
          </div>
          <div className={styles.continueFoot}>
            <span className={styles.continuePct}>{pct}%</span>
            <span className={styles.resume}>
              Resume <PlayIcon size={13} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RankedCard({ novel, rank }: { novel: NovelSummary; rank: number }): React.JSX.Element {
  return (
    <Link to="/novels/$slug" params={{ slug: novel.slug }} className={styles.rankedCard}>
      <span className={styles.rankNum} aria-hidden="true">
        {rank}
      </span>
      <div className={styles.rankedBody}>
        <Cover cover={novel.cover} title={novel.title} showTitle={false} />
        <div className={styles.rankedMeta}>
          <span className={styles.rankedRating}>
            <StarIcon size={11} />
            {novel.rating.toFixed(1)}
          </span>
          <span>· {formatCount(novel.views)} reads</span>
        </div>
      </div>
    </Link>
  );
}

function PromoSection(): React.JSX.Element {
  const install = usePwaInstall();

  const onInstall = async (): Promise<void> => {
    const outcome = await install.promptInstall();
    if (outcome === 'unavailable') toast.info('On iOS Safari, tap Share → Add to Home Screen to install.');
  };

  return (
    <section className={styles.promos}>
      <div className={styles.promoForge}>
        <div className={styles.promoKicker}>
          <ExternalIcon size={13} /> Separate service
        </div>
        <h3 className={styles.promoTitle}>Have a story to tell?</h3>
        <p className={styles.promoText}>
          Publish and manage your own webnovels in <strong>Novel Forge</strong>, our dedicated writing studio.
        </p>
        <Button variant="secondary" asChild>
          <a href={NOVEL_FORGE_URL} target="_blank" rel="noreferrer">
            Open Novel Forge
          </a>
        </Button>
      </div>
      {!install.isInstalled && (
        <div className={styles.promoInstall}>
          <div className={styles.promoKicker}>
            <DownloadIcon size={14} /> Read anywhere
          </div>
          <h3 className={styles.promoTitle}>Install the app</h3>
          <p className={styles.promoText}>Add Shadow to your home screen and download chapters to read offline — no account needed.</p>
          <Button variant="secondary" onClick={() => void onInstall()}>
            Install Shadow Webnovel
          </Button>
        </div>
      )}
    </section>
  );
}

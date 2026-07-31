/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, cn, Drawer, EmptyState, Pagination, SegmentedControl, Select, Skeleton, Slider, Switch, Tag } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { SearchIcon, SettingsSlidersIcon } from '@/components/icons';
import { Cover, NovelCard, RatingRow, StatusBadge } from '@/components/novel';
import { catalogQueryOptions } from '@/lib/apis';
import { type CatalogSort, type NovelDetail, type NovelStatus, type NovelSummary } from '@/lib/apis/types';

import styles from './browse-screen.module.css';

/**
 * Defining types
 */
export type UpdatedWindow = 'day' | 'week' | 'month' | 'year';

export interface BrowseSearch {
  q?: string;
  genre?: string;
  status?: NovelStatus;
  sort?: CatalogSort;
  view?: 'grid' | 'list';
  page?: number;
  /** Minimum star rating, applied client-side over the fetched page. */
  minRating?: number;
  /** Inclusive chapter-count range encoded as `lo-hi`; `hi` at the ceiling means "and up". */
  chapters?: string;
  /** Recency window for `updatedAt`. */
  updatedWithin?: UpdatedWindow;
  /** Original language — presentational until the catalog DTO carries it (see filterCatalog). */
  language?: string;
  translatedOnly?: boolean;
  hideMature?: boolean;
}

/** The catalog DTO the grid consumes carries only summary fields; the enrichment fields live on the
 *  detail DTO. This view lets the client filters self-activate if a summary ever carries them, and stay
 *  a harmless no-op while it does not. */
type EnrichedSummary = NovelSummary & Partial<Pick<NovelDetail, 'language' | 'mature' | 'translator'>>;

/**
 * Declaring the constants
 *
 * The catalog screen from the browse mockups: toolbar (filters, count, sort, grid/list), removable filter
 * chips, poster grid or detail list, pagination, and the filter drawer with genre/status/rating/chapter/
 * recency/language/translation sections.
 */
/** Shared with the route loader so the SSR prefetch lands on the exact query key the screen reads */
export const BROWSE_PAGE_SIZE = 24;
const SORT_LABELS: Record<CatalogSort, string> = {
  trending: 'Trending',
  popular: 'Most popular',
  rating: 'Highest rated',
  updated: 'Recently updated',
  chapters: 'Most chapters',
  title: 'Title A–Z',
};
const STATUS_OPTIONS: NovelStatus[] = ['ongoing', 'completed', 'hiatus'];

const RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 4.5, label: '4.5+' },
  { value: 4, label: '4.0+' },
  { value: 3.5, label: '3.5+' },
  { value: 3, label: '3.0+' },
];

const UPDATED_OPTIONS: { value: UpdatedWindow; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];
const UPDATED_LABELS: Record<UpdatedWindow, string> = { day: 'Today', week: 'This week', month: 'This month', year: 'This year' };
const DAY_MS = 86_400_000;
const UPDATED_WINDOW_MS: Record<UpdatedWindow, number> = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS, year: 365 * DAY_MS };

/** Fixed list — the summary DTO carries no language, so the chips are presentational until it does. */
const LANGUAGE_OPTIONS = ['English', 'Chinese', 'Korean', 'Japanese'];

const CHAPTER_MIN = 0;
const CHAPTER_MAX = 13_000;
const CHAPTER_STEP = 100;

/** Every filter the drawer owns, cleared in one patch — reused by Reset and Clear all. */
const CLEARED_FILTERS: Partial<BrowseSearch> = {
  genre: undefined,
  status: undefined,
  minRating: undefined,
  chapters: undefined,
  updatedWithin: undefined,
  language: undefined,
  translatedOnly: undefined,
  hideMature: undefined,
};

const route = getRouteApi('/_shell/browse');

function parseChapterRange(raw: string | undefined): [number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split('-');
  const lo = Number(parts[0]);
  const hi = Number(parts[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  return [lo, hi];
}

function formatChapterHi(hi: number): string {
  return hi >= CHAPTER_MAX ? `${CHAPTER_MAX.toLocaleString()}+` : hi.toLocaleString();
}

/** Applies the drawer's post-fetch filters over the current page. Rating, chapter count and recency read
 *  real summary fields; language/mature/translator only fire when a summary actually carries them. */
function filterCatalog(items: NovelSummary[], search: BrowseSearch): NovelSummary[] {
  const range = parseChapterRange(search.chapters);
  const windowMs = search.updatedWithin ? UPDATED_WINDOW_MS[search.updatedWithin] : undefined;
  const now = Date.now();
  return items.filter(novel => {
    if (search.minRating != null && novel.rating < search.minRating) return false;
    if (range) {
      if (novel.chapterCount < range[0]) return false;
      if (range[1] < CHAPTER_MAX && novel.chapterCount > range[1]) return false;
    }
    if (windowMs != null && now - Date.parse(novel.updatedAt) > windowMs) return false;
    const enriched = novel as EnrichedSummary;
    if (search.language && 'language' in novel && enriched.language !== search.language) return false;
    if (search.hideMature && 'mature' in novel && enriched.mature === true) return false;
    if (search.translatedOnly && 'translator' in novel && enriched.translator == null) return false;
    return true;
  });
}

export function BrowseScreen(): React.JSX.Element {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = { q: search.q, genre: search.genre, status: search.status, sort: search.sort ?? 'trending', page: search.page ?? 1, limit: BROWSE_PAGE_SIZE };
  const catalog = useQuery(catalogQueryOptions(query));
  const view = search.view ?? 'grid';

  const patch = (updates: Partial<BrowseSearch>): void => {
    void navigate({ search: prev => ({ ...prev, page: undefined, ...updates }) });
  };

  const resetFilters = (): void => patch(CLEARED_FILTERS);
  const clearAll = (): void => patch({ q: undefined, ...CLEARED_FILTERS });

  // genre/status refetch server-side; the rest narrow the fetched page client-side.
  const clientFilterCount = [search.minRating != null, search.chapters, search.updatedWithin, search.language, search.translatedOnly, search.hideMature].filter(Boolean).length;
  const activeFilterCount = (search.genre ? 1 : 0) + (search.status ? 1 : 0) + clientFilterCount;

  const serverItems = catalog.data?.items ?? [];
  const items = clientFilterCount > 0 ? filterCatalog(serverItems, search) : serverItems;
  const total = catalog.data?.total ?? 0;
  const shownCount = clientFilterCount > 0 ? items.length : total;
  const chapterRange = parseChapterRange(search.chapters);

  return (
    <div className={`${styles.page} wn-fade`}>
      <h1 className={styles.title}>{search.genre ? `${search.genre} novels` : 'Browse novels'}</h1>
      <p className={styles.subtitle}>{search.q ? `Results for “${search.q}”` : 'The full catalog — filter by genre, status and more'}</p>

      <div className={styles.toolbar}>
        <Button variant="secondary" prefix={<SettingsSlidersIcon size={16} />} onClick={() => setFiltersOpen(true)}>
          Filters
          {activeFilterCount > 0 && <span className={styles.filterCount}>{activeFilterCount}</span>}
        </Button>
        <div className={styles.spacer} />
        <span className={styles.count}>
          <strong>{shownCount.toLocaleString()}</strong> novels
        </span>
        <div className={styles.sort}>
          <Select value={search.sort ?? 'trending'} onValueChange={value => patch({ sort: value as CatalogSort })} aria-label="Sort novels">
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <Select.Item key={value} value={value}>
                {label}
              </Select.Item>
            ))}
          </Select>
        </div>
        <SegmentedControl value={view} onValueChange={value => patch({ view: value as 'grid' | 'list' })} aria-label="Display">
          <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
          <SegmentedControl.Item value="list">List</SegmentedControl.Item>
        </SegmentedControl>
      </div>

      {(search.q || activeFilterCount > 0) && (
        <div className={styles.chips}>
          {search.q && <Tag onRemove={() => patch({ q: undefined })}>“{search.q}”</Tag>}
          {search.genre && <Tag onRemove={() => patch({ genre: undefined })}>{search.genre}</Tag>}
          {search.status && <Tag onRemove={() => patch({ status: undefined })}>{search.status}</Tag>}
          {search.minRating != null && <Tag onRemove={() => patch({ minRating: undefined })}>★ {search.minRating.toFixed(1)}+</Tag>}
          {chapterRange && (
            <Tag onRemove={() => patch({ chapters: undefined })}>
              {chapterRange[0].toLocaleString()}–{formatChapterHi(chapterRange[1])} ch
            </Tag>
          )}
          {search.updatedWithin && <Tag onRemove={() => patch({ updatedWithin: undefined })}>{UPDATED_LABELS[search.updatedWithin as UpdatedWindow]}</Tag>}
          {search.language && <Tag onRemove={() => patch({ language: undefined })}>{search.language}</Tag>}
          {search.translatedOnly && <Tag onRemove={() => patch({ translatedOnly: undefined })}>Translated</Tag>}
          {search.hideMature && <Tag onRemove={() => patch({ hideMature: undefined })}>Hide mature</Tag>}
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}

      {catalog.isLoading && (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} shape="rect" height={260} radius={12} />
          ))}
        </div>
      )}

      {catalog.data && items.length === 0 && (
        <EmptyState
          illustration={<SearchIcon size={26} />}
          title="No novels match your filters"
          description="Try removing a filter or broadening your search to see more results."
          action={{ label: 'Clear all filters', onClick: clearAll }}
        />
      )}

      {catalog.data && items.length > 0 && view === 'grid' && (
        <div className={styles.grid}>
          {items.map(novel => (
            <NovelCard key={novel.slug} novel={novel} />
          ))}
        </div>
      )}

      {catalog.data && items.length > 0 && view === 'list' && (
        <div className={styles.list}>
          {items.map(novel => (
            <ListRow key={novel.slug} novel={novel} />
          ))}
        </div>
      )}

      {clientFilterCount === 0 && total > BROWSE_PAGE_SIZE && (
        <div className={styles.pager}>
          <span className={styles.count}>
            Showing {(query.page - 1) * BROWSE_PAGE_SIZE + 1}–{Math.min(query.page * BROWSE_PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <Pagination page={query.page} pageSize={BROWSE_PAGE_SIZE} total={total} onPageChange={page => void navigate({ search: prev => ({ ...prev, page }) })} />
        </div>
      )}

      <FilterDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        genres={catalog.data?.genres ?? []}
        search={search}
        patch={patch}
        onReset={resetFilters}
        resultCount={shownCount}
        activeCount={activeFilterCount}
      />
    </div>
  );
}

function ListRow({ novel }: { novel: NovelSummary }): React.JSX.Element {
  return (
    <Link to="/novels/$slug" params={{ slug: novel.slug }} className={styles.listRow}>
      <div className={styles.listCover}>
        <Cover cover={novel.cover} title={novel.title} showTitle={false} />
      </div>
      <div className={styles.listBody}>
        <div>
          <div className={styles.listTitle}>{novel.title}</div>
          <div className={styles.listAuthor}>{novel.author}</div>
        </div>
        <p className={`${styles.listSynopsis} wn-clamp2`}>{novel.synopsis}</p>
        <div className={styles.listMeta}>
          <RatingRow rating={novel.rating} suffix={`${novel.ratingCount.toLocaleString()} reviews`} />
          <span className={styles.metaDot} aria-hidden="true" />
          <span>{novel.chapterCount.toLocaleString()} ch</span>
          <StatusBadge status={novel.status} />
          {novel.genres[0] && <span className={styles.genrePill}>{novel.genres[0]}</span>}
        </div>
      </div>
    </Link>
  );
}

interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genres: string[];
  search: BrowseSearch;
  patch: (updates: Partial<BrowseSearch>) => void;
  onReset: () => void;
  resultCount: number;
  activeCount: number;
}

function FilterDrawer(props: FilterDrawerProps): React.JSX.Element {
  const { search, patch } = props;
  const chapterValue = parseChapterRange(search.chapters) ?? [CHAPTER_MIN, CHAPTER_MAX];
  const [chapterDraft, setChapterDraft] = useState<[number, number]>(chapterValue);

  // Keep the slider in step with the URL so an external Reset snaps the handles back to full range.
  useEffect(() => setChapterDraft(parseChapterRange(search.chapters) ?? [CHAPTER_MIN, CHAPTER_MAX]), [search.chapters]);

  const commitChapters = (value: number | number[]): void => {
    const values = value as number[];
    const lo = values[0] ?? CHAPTER_MIN;
    const hi = values[1] ?? CHAPTER_MAX;
    const isFullRange = lo <= CHAPTER_MIN && hi >= CHAPTER_MAX;
    patch({ chapters: isFullRange ? undefined : `${lo}-${hi}` });
  };

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} placement="right" aria-label="Filters">
      <Drawer.Header
        title={
          <span className={styles.filterTitle}>
            <SettingsSlidersIcon size={18} />
            Filters
            {props.activeCount > 0 && <span className={styles.filterCount}>{props.activeCount}</span>}
          </span>
        }
      />
      <Drawer.Body>
        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Genre</div>
          <div className={styles.filterChips}>
            {props.genres.map(genre => (
              <button
                key={genre}
                type="button"
                className={cn(styles.filterChip, genre === search.genre && styles.filterChipOn)}
                onClick={() => patch({ genre: genre === search.genre ? undefined : genre })}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Story status</div>
          <div className={styles.filterChips}>
            {STATUS_OPTIONS.map(status => (
              <button
                key={status}
                type="button"
                className={cn(styles.filterChip, status === search.status && styles.filterChipOn)}
                onClick={() => patch({ status: status === search.status ? undefined : status })}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Minimum rating</div>
          <div className={styles.filterChips}>
            <button type="button" className={cn(styles.filterChip, search.minRating == null && styles.filterChipOn)} onClick={() => patch({ minRating: undefined })}>
              Any
            </button>
            {RATING_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={cn(styles.filterChip, search.minRating === option.value && styles.filterChipOn)}
                onClick={() => patch({ minRating: search.minRating === option.value ? undefined : option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterHeaderRow}>
            <span className={styles.filterLabel}>Chapter count</span>
            <span className={styles.filterRangeValue}>
              {chapterDraft[0].toLocaleString()} – {formatChapterHi(chapterDraft[1])}
            </span>
          </div>
          <Slider
            value={chapterDraft}
            min={CHAPTER_MIN}
            max={CHAPTER_MAX}
            step={CHAPTER_STEP}
            showValue={false}
            aria-label="Chapter count range"
            onValueChange={value => setChapterDraft(value as [number, number])}
            onValueCommit={commitChapters}
          />
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Recently updated</div>
          <div className={styles.filterChips}>
            <button type="button" className={cn(styles.filterChip, !search.updatedWithin && styles.filterChipOn)} onClick={() => patch({ updatedWithin: undefined })}>
              Any
            </button>
            {UPDATED_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={cn(styles.filterChip, search.updatedWithin === option.value && styles.filterChipOn)}
                onClick={() => patch({ updatedWithin: search.updatedWithin === option.value ? undefined : option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Original language</div>
          <div className={styles.filterChips}>
            {LANGUAGE_OPTIONS.map(language => (
              <button
                key={language}
                type="button"
                className={cn(styles.filterChip, language === search.language && styles.filterChipOn)}
                onClick={() => patch({ language: language === search.language ? undefined : language })}
              >
                {language}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Translation &amp; content</div>
          <div className={styles.switchList}>
            <Switch label="Translated only" checked={!!search.translatedOnly} onCheckedChange={checked => patch({ translatedOnly: checked || undefined })} />
            <Switch label="Hide mature" checked={!!search.hideMature} onCheckedChange={checked => patch({ hideMature: checked || undefined })} />
          </div>
        </div>
      </Drawer.Body>
      <Drawer.Footer>
        <Button variant="ghost" onClick={props.onReset}>
          Reset
        </Button>
        <Button variant="primary" fullWidth onClick={() => props.onOpenChange(false)}>
          Show {props.resultCount.toLocaleString()} novels
        </Button>
      </Drawer.Footer>
    </Drawer>
  );
}

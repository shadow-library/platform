/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, cn, Drawer, EmptyState, Pagination, SegmentedControl, Select, Skeleton, Tag } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { SearchIcon, SettingsSlidersIcon } from '@/components/icons';
import { Cover, NovelCard, RatingRow, StatusBadge } from '@/components/novel';
import { catalogQueryOptions } from '@/lib/apis';
import { type CatalogSort, type NovelStatus, type NovelSummary } from '@/lib/apis/types';

import styles from './browse-screen.module.css';

/**
 * Defining types
 */
export interface BrowseSearch {
  q?: string;
  genre?: string;
  status?: NovelStatus;
  sort?: CatalogSort;
  view?: 'grid' | 'list';
  page?: number;
}

/**
 * Declaring the constants
 *
 * The catalog screen from the browse mockups: toolbar (filters, count, sort, grid/list), removable filter
 * chips, poster grid or detail list, pagination, and the filter drawer with genre/status chips.
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

const route = getRouteApi('/_shell/browse');

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

  const activeFilterCount = (search.genre ? 1 : 0) + (search.status ? 1 : 0);
  const total = catalog.data?.total ?? 0;

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
          <strong>{total.toLocaleString()}</strong> novels
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
          <Button variant="ghost" size="sm" onClick={() => patch({ q: undefined, genre: undefined, status: undefined })}>
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

      {catalog.data && catalog.data.items.length === 0 && (
        <EmptyState
          illustration={<SearchIcon size={26} />}
          title="No novels match your filters"
          description="Try removing a filter or broadening your search to see more results."
          action={{ label: 'Clear all filters', onClick: () => patch({ q: undefined, genre: undefined, status: undefined }) }}
        />
      )}

      {catalog.data && catalog.data.items.length > 0 && view === 'grid' && (
        <div className={styles.grid}>
          {catalog.data.items.map(novel => (
            <NovelCard key={novel.slug} novel={novel} />
          ))}
        </div>
      )}

      {catalog.data && catalog.data.items.length > 0 && view === 'list' && (
        <div className={styles.list}>
          {catalog.data.items.map(novel => (
            <ListRow key={novel.slug} novel={novel} />
          ))}
        </div>
      )}

      {total > BROWSE_PAGE_SIZE && (
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
        selectedGenre={search.genre}
        selectedStatus={search.status}
        onGenre={genre => patch({ genre })}
        onStatus={status => patch({ status })}
        resultCount={total}
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
  selectedGenre?: string;
  selectedStatus?: NovelStatus;
  onGenre: (genre: string | undefined) => void;
  onStatus: (status: NovelStatus | undefined) => void;
  resultCount: number;
}

function FilterDrawer(props: FilterDrawerProps): React.JSX.Element {
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} placement="right" aria-label="Filters">
      <Drawer.Header title="Filters" />
      <Drawer.Body>
        <div className={styles.filterGroup}>
          <div className={styles.filterLabel}>Genre</div>
          <div className={styles.filterChips}>
            {props.genres.map(genre => (
              <button
                key={genre}
                type="button"
                className={cn(styles.filterChip, genre === props.selectedGenre && styles.filterChipOn)}
                onClick={() => props.onGenre(genre === props.selectedGenre ? undefined : genre)}
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
                className={cn(styles.filterChip, status === props.selectedStatus && styles.filterChipOn)}
                onClick={() => props.onStatus(status === props.selectedStatus ? undefined : status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Drawer.Body>
      <Drawer.Footer>
        <Button
          variant="ghost"
          onClick={() => {
            props.onGenre(undefined);
            props.onStatus(undefined);
          }}
        >
          Reset
        </Button>
        <Button variant="primary" fullWidth onClick={() => props.onOpenChange(false)}>
          Show {props.resultCount.toLocaleString()} novels
        </Button>
      </Drawer.Footer>
    </Drawer>
  );
}

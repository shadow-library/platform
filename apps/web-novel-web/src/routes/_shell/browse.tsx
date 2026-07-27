/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { BROWSE_PAGE_SIZE, BrowseScreen, type BrowseSearch } from '@/features/browse';
import { catalogQueryOptions } from '@/lib/apis';
import { type CatalogSort, type NovelStatus } from '@/lib/apis/types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const SORTS: CatalogSort[] = ['trending', 'popular', 'rating', 'updated', 'chapters', 'title'];
const STATUSES: NovelStatus[] = ['ongoing', 'completed', 'hiatus'];

function validateSearch(search: Record<string, unknown>): BrowseSearch {
  return {
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    genre: typeof search.genre === 'string' && search.genre ? search.genre : undefined,
    status: STATUSES.includes(search.status as NovelStatus) ? (search.status as NovelStatus) : undefined,
    sort: SORTS.includes(search.sort as CatalogSort) ? (search.sort as CatalogSort) : undefined,
    view: search.view === 'list' ? 'list' : undefined,
    page: typeof search.page === 'number' && search.page > 1 ? Math.floor(search.page) : undefined,
  };
}

export const Route = createFileRoute('/_shell/browse')({
  validateSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    // Seed the catalog grid server-side on the exact key the screen reads; failures fall through to client fetch.
    void context.queryClient.prefetchQuery(
      catalogQueryOptions({ q: deps.q, genre: deps.genre, status: deps.status, sort: deps.sort ?? 'trending', page: deps.page ?? 1, limit: BROWSE_PAGE_SIZE }),
    );
  },
  component: BrowseScreen,
});

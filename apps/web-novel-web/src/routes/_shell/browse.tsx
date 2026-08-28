import { isRatingLevel, isTag } from '@shadow-library/sdk';
import { createFileRoute } from '@tanstack/react-router';

import { BROWSE_PAGE_SIZE, BrowseScreen, type BrowseSearch, type UpdatedWindow } from '@/features/browse';
import { catalogQueryOptions } from '@/lib/apis';
import { type CatalogSort, type NovelStatus } from '@/lib/apis/types';

const SORTS: CatalogSort[] = ['trending', 'popular', 'rating', 'updated', 'chapters', 'title'];
const STATUSES: NovelStatus[] = ['ongoing', 'completed', 'hiatus'];
const MIN_RATINGS = [3, 3.5, 4, 4.5];
const UPDATED_WINDOWS: UpdatedWindow[] = ['day', 'week', 'month', 'year'];

function validateSearch(search: Record<string, unknown>): BrowseSearch {
  return {
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    genre: typeof search.genre === 'string' && search.genre ? search.genre : undefined,
    tag: isTag(search.tag) ? search.tag : undefined,
    status: STATUSES.includes(search.status as NovelStatus) ? (search.status as NovelStatus) : undefined,
    maxSexualContent: isRatingLevel('sexualContent', search.maxSexualContent) ? search.maxSexualContent : undefined,
    maxViolence: isRatingLevel('violence', search.maxViolence) ? search.maxViolence : undefined,
    maxDarkContent: isRatingLevel('darkContent', search.maxDarkContent) ? search.maxDarkContent : undefined,
    sort: SORTS.includes(search.sort as CatalogSort) ? (search.sort as CatalogSort) : undefined,
    view: search.view === 'list' ? 'list' : undefined,
    page: typeof search.page === 'number' && search.page > 1 ? Math.floor(search.page) : undefined,
    minRating: typeof search.minRating === 'number' && MIN_RATINGS.includes(search.minRating) ? search.minRating : undefined,
    chapters: typeof search.chapters === 'string' && /^\d+-\d+$/.test(search.chapters) ? search.chapters : undefined,
    updatedWithin: UPDATED_WINDOWS.includes(search.updatedWithin as UpdatedWindow) ? (search.updatedWithin as UpdatedWindow) : undefined,
    language: typeof search.language === 'string' && search.language ? search.language : undefined,
    translatedOnly: search.translatedOnly === true ? true : undefined,
    hideMature: search.hideMature === true ? true : undefined,
  };
}

export const Route = createFileRoute('/_shell/browse')({
  validateSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    // Seed the catalog grid server-side on the exact key the screen reads; failures fall through to client fetch.
    void context.queryClient.prefetchQuery(
      catalogQueryOptions({
        q: deps.q,
        genre: deps.genre,
        tag: deps.tag,
        status: deps.status,
        maxSexualContent: deps.maxSexualContent,
        maxViolence: deps.maxViolence,
        maxDarkContent: deps.maxDarkContent,
        sort: deps.sort ?? 'trending',
        page: deps.page ?? 1,
        limit: BROWSE_PAGE_SIZE,
      }),
    );
  },
  component: BrowseScreen,
});

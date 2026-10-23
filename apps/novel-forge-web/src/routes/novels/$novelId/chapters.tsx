import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';

import { ChapterEditor, ChapterList, type ChapterListView, SUMMARY_ROWS } from '@/features/chapters';
import { chapterRowsQueryOptions, listVolumesQueryOptions } from '@/lib/apis';
import { isChapterShow, parseGroupPages } from '@/lib/chapter-list';

interface ChaptersSearch extends ChapterListView {
  chapter?: number;
  /** A hand-off from elsewhere (e.g. Overview's Next step card) — opens straight into the Checks drawer instead of the read view. */
  review?: boolean;
}

// The open chapter, list pages and filters live in the URL, so a refresh or Back returns to the same place.
export const Route = createFileRoute('/novels/$novelId/chapters')({
  validateSearch: (search: Record<string, unknown>): ChaptersSearch => {
    const chapter = Number(search.chapter);
    const page = Number(search.page);
    const q = typeof search.q === 'string' ? search.q.trim() : '';
    return {
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : undefined,
      show: isChapterShow(search.show) && search.show !== 'all' ? search.show : undefined,
      pov: typeof search.pov === 'string' && search.pov ? search.pov : undefined,
      thread: typeof search.thread === 'string' && search.thread ? search.thread : undefined,
      q: q || undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
      pages: parseGroupPages(search.pages),
      review: search.review === true || search.review === 'true' ? true : undefined,
    };
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(chapterRowsQueryOptions(params.novelId, SUMMARY_ROWS)),
      context.queryClient.prefetchQuery(listVolumesQueryOptions(params.novelId)),
    ]);
  },
  component: ChaptersScreen,
});

function ChaptersScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const openChapter = (n?: number): Promise<void> => navigate({ search: previous => ({ ...previous, chapter: n, review: undefined }) });
  const changeView = useCallback((next: ChapterListView, replace?: boolean): Promise<void> => navigate({ search: previous => ({ ...previous, ...next }), replace }), [navigate]);

  return search.chapter != null ? (
    <ChapterEditor novelId={novelId} chapter={search.chapter} openReviewOnLoad={search.review === true} onBack={() => openChapter(undefined)} onPick={openChapter} />
  ) : (
    <ChapterList novelId={novelId} view={search} onOpen={openChapter} onView={changeView} />
  );
}

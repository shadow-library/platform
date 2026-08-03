/**
 * Importing npm packages
 */
import { createFileRoute, notFound } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { NovelScreen } from '@/features/novel';
import { isApiError, novelQueryOptions } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A WBN_001 (unknown or restricted novel) must resolve to a real 404, not the generic catch boundary — a
 * 500 there would betray the state to an enumerating caller. Only the 404 is mapped; a genuine 5xx still
 * propagates and surfaces through `DefaultCatchBoundary` as an error.
 */
export const Route = createFileRoute('/_shell/novels/$slug')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(novelQueryOptions(params.slug));
    } catch (err) {
      if (isApiError(err) && err.status === 404) throw notFound();
      throw err;
    }
  },
  component: NovelScreen,
});

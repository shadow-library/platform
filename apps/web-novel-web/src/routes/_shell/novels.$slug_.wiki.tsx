/**
 * Importing npm packages
 */
import { createFileRoute, notFound } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { WikiIndexScreen } from '@/features/wiki';
import { isApiError, novelQueryOptions, wikiIndexQueryOptions } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A restricted or unknown novel slug 404s the same way `novels.$slug` does — mapped to `notFound()` here too
 * so the wiki index doesn't surface it as a 500 through `DefaultCatchBoundary`.
 */
export const Route = createFileRoute('/_shell/novels/$slug_/wiki')({
  loader: async ({ context, params }) => {
    void context.queryClient.prefetchQuery(novelQueryOptions(params.slug));
    try {
      return await context.queryClient.ensureQueryData(wikiIndexQueryOptions(params.slug));
    } catch (err) {
      if (isApiError(err) && err.status === 404) throw notFound();
      throw err;
    }
  },
  component: WikiIndexScreen,
});

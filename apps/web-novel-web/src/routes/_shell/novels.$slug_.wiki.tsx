import { createFileRoute, notFound } from '@tanstack/react-router';

import { WikiIndexScreen } from '@/features/wiki';
import { isApiError, novelQueryOptions, wikiIndexQueryOptions } from '@/lib/apis';

/** Same 404 mapping as `novels.$slug`, so a restricted or unknown slug does not surface as a 500 through `DefaultCatchBoundary`. */
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

import { createFileRoute, notFound } from '@tanstack/react-router';

import { WikiEntryScreen } from '@/features/wiki';
import { isApiError, wikiEntryQueryOptions } from '@/lib/apis';

/**
 * `ensureQueryData` awaits the fetch in the loader, so a WBN_009 (unknown or still spoiler-locked entry)
 * throws here — mapped to `notFound()` the same way `novels.$slug` maps an unknown novel slug, so the router
 * renders the real 404 boundary instead of the generic `DefaultCatchBoundary` (which would read as a 500).
 */
export const Route = createFileRoute('/_shell/novels/$slug_/wiki_/$entryKey')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(wikiEntryQueryOptions(params.slug, params.entryKey));
    } catch (err) {
      if (isApiError(err) && err.status === 404) throw notFound();
      throw err;
    }
  },
  component: WikiEntryScreen,
});

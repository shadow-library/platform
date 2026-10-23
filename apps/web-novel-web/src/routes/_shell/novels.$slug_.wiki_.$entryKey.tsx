import { createFileRoute, notFound } from '@tanstack/react-router';

import { WikiEntryScreen } from '@/features/wiki';
import { isApiError, wikiEntryQueryOptions } from '@/lib/apis';

/** WBN_009 (unknown or spoiler-locked entry) is mapped to `notFound()` like `novels.$slug`, so the router renders the 404 boundary rather than `DefaultCatchBoundary`. */
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

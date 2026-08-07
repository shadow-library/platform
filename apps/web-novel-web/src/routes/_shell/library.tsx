import { createFileRoute } from '@tanstack/react-router';

import { LibraryScreen, type LibrarySearch } from '@/features/library';
import { requireSession } from '@/lib/apis';

/**
 * The library is the one authed screen — `requireSession` (the generic `requireAuth` under the hood)
 * 302-redirects guests to `/login?returnTo=/library` before any shelf markup renders. The grid/list `view`
 * rides a search param so the layout choice survives reloads; only the non-default `list` is serialized.
 */
function validateSearch(search: Record<string, unknown>): LibrarySearch {
  return { view: search.view === 'list' ? 'list' : undefined };
}

export const Route = createFileRoute('/_shell/library')({
  validateSearch,
  beforeLoad: ({ context }) => requireSession(context.queryClient, '/library'),
  component: LibraryScreen,
});

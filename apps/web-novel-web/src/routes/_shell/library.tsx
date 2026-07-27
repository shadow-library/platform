/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { LibraryScreen } from '@/features/library';
import { requireSession } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The library is the one authed screen — `requireSession` (the generic `requireAuth` under the hood)
 * 302-redirects guests to `/login?returnTo=/library` before any shelf markup renders.
 */
export const Route = createFileRoute('/_shell/library')({
  beforeLoad: ({ context }) => requireSession(context.queryClient, '/library'),
  component: LibraryScreen,
});

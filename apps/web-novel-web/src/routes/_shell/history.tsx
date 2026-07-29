/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { HistoryScreen } from '@/features/history';
import { requireSession } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Reading history mirrors the library route's device-local auth gate: `requireSession` 302-redirects guests
 * to `/login?returnTo=/history` server-side before any markup renders, so history matches library exactly.
 */
export const Route = createFileRoute('/_shell/history')({
  beforeLoad: ({ context }) => requireSession(context.queryClient, '/history'),
  component: HistoryScreen,
});

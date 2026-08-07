import { createFileRoute } from '@tanstack/react-router';

import { HistoryScreen } from '@/features/history';
import { requireSession } from '@/lib/apis';

/**
 * Reading history mirrors the library route's device-local auth gate: `requireSession` 302-redirects guests
 * to `/login?returnTo=/history` server-side before any markup renders, so history matches library exactly.
 */
export const Route = createFileRoute('/_shell/history')({
  beforeLoad: ({ context }) => requireSession(context.queryClient, '/history'),
  component: HistoryScreen,
});

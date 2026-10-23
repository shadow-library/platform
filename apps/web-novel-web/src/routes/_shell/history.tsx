import { createFileRoute } from '@tanstack/react-router';

import { HistoryScreen } from '@/features/history';
import { requireSession } from '@/lib/apis';

/** `requireSession` 302-redirects guests to `/login?returnTo=/history` server-side before any markup renders. */
export const Route = createFileRoute('/_shell/history')({
  beforeLoad: ({ context }) => requireSession(context.queryClient, '/history'),
  component: HistoryScreen,
});

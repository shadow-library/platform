import { createFileRoute } from '@tanstack/react-router';

import { SessionGuard } from '@/features/auth';
import { ReaderScreen } from '@/features/reader';
import { chapterQueryOptions, novelQueryOptions, requireReaderAccess } from '@/lib/apis';

/**
 * The reader owns the full viewport, so it sits outside the shell and carries its own access gate and session
 * guard. Chapter data is seeded server-side with non-blocking prefetches so SSR streams the live chapter, while
 * the in-component query keeps the offline fallback (OfflineStore → downloaded copy) and the offline-blocked
 * state rendering instead of an error boundary when there is no network.
 */
export const Route = createFileRoute('/read/$slug/$ordinal')({
  beforeLoad: async ({ context, location }) => ({ accessMode: await requireReaderAccess(context.queryClient, location.href) }),
  loader: ({ context, params }) => {
    const ordinal = Number.parseInt(params.ordinal, 10) || 1;
    void context.queryClient.prefetchQuery(chapterQueryOptions(params.slug, ordinal));
    void context.queryClient.prefetchQuery(novelQueryOptions(params.slug));
  },
  component: GatedReader,
});

function GatedReader(): React.JSX.Element {
  const accessMode = Route.useRouteContext({ select: context => context.accessMode });
  return (
    <SessionGuard accessMode={accessMode}>
      <ReaderScreen />
    </SessionGuard>
  );
}

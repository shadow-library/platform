import { createFileRoute } from '@tanstack/react-router';

import { SessionGuard } from '@/features/auth';
import { ReaderScreen } from '@/features/reader';
import { chapterQueryOptions, novelQueryOptions, requireReaderAccess } from '@/lib/apis';

/**
 * The reader owns the viewport, so it sits outside the shell with its own access gate and session guard. Chapter data is prefetched non-blockingly for SSR;
 * the in-component query keeps the offline fallback (downloaded copy) and offline-blocked state rendering instead of an error boundary.
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

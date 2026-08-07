import { createFileRoute } from '@tanstack/react-router';

import { ReaderScreen } from '@/features/reader';
import { chapterQueryOptions, novelQueryOptions } from '@/lib/apis';

/**
 * The reader owns the full viewport (no app shell). Chapter data is seeded server-side with non-blocking
 * prefetches so SSR streams the live chapter, while the in-component query keeps the offline fallback
 * (OfflineStore → downloaded copy) and the offline-blocked state rendering instead of an error boundary
 * when there is no network.
 */
export const Route = createFileRoute('/read/$slug/$ordinal')({
  loader: ({ context, params }) => {
    const ordinal = Number.parseInt(params.ordinal, 10) || 1;
    void context.queryClient.prefetchQuery(chapterQueryOptions(params.slug, ordinal));
    void context.queryClient.prefetchQuery(novelQueryOptions(params.slug));
  },
  component: ReaderScreen,
});

import { createFileRoute } from '@tanstack/react-router';

import { HomeScreen } from '@/features/home';
import { catalogQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_shell/')({
  loader: async ({ context }) => {
    // Block on all three home rows the screen renders (trending, updated, popular) so the catalog is
    // server-rendered and a warm client hydrates without refetching. `allSettled` keeps a catalog outage
    // from failing the page — a row that rejects simply falls through to a client fetch.
    await Promise.allSettled([
      context.queryClient.ensureQueryData(catalogQueryOptions({ sort: 'trending', limit: 12 })),
      context.queryClient.ensureQueryData(catalogQueryOptions({ sort: 'updated', limit: 6 })),
      context.queryClient.ensureQueryData(catalogQueryOptions({ sort: 'popular', limit: 8 })),
    ]);
  },
  component: HomeScreen,
});

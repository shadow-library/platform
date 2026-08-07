import { createFileRoute } from '@tanstack/react-router';

import { LayoutList } from '@/features/design';
import { listLayoutsQueryOptions } from '@/lib/apis';

// The layout list is this route's only query and gates the table's loading state, so the loader
// prefetches it — the table renders on the server instead of a spinner.
export const Route = createFileRoute('/_app/design/layouts/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(listLayoutsQueryOptions()),
  component: LayoutList,
});

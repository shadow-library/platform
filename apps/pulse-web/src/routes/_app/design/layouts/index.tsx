import { createFileRoute } from '@tanstack/react-router';

import { LayoutList } from '@/features/design';
import { listLayoutsQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/design/layouts/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(listLayoutsQueryOptions()),
  component: LayoutList,
});

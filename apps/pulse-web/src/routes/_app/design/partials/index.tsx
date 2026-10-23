import { createFileRoute } from '@tanstack/react-router';

import { PartialList } from '@/features/design';
import { listPartialsQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/design/partials/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(listPartialsQueryOptions()),
  component: PartialList,
});

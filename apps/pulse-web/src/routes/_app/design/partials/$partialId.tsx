import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { PartialDetail } from '@/features/design';
import { partialQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/design/partials/$partialId')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(partialQueryOptions(params.partialId)),
  component: PartialDetailRoute,
});

function PartialDetailRoute(): ReactElement {
  const { partialId } = Route.useParams();
  return <PartialDetail partialId={partialId} />;
}

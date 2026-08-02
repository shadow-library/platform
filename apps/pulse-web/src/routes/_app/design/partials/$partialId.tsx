/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 *  Importing user defined modules
 */
import { PartialDetail } from '@/features/design';
import { partialQueryOptions } from '@/lib/apis';

// The partial itself is this route's only query and gates the detail screen's loading state, so the
// loader prefetches it — the editor renders on the server instead of a spinner.
export const Route = createFileRoute('/_app/design/partials/$partialId')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(partialQueryOptions(params.partialId)),
  component: PartialDetailRoute,
});

function PartialDetailRoute(): ReactElement {
  const { partialId } = Route.useParams();
  return <PartialDetail partialId={partialId} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { LayoutDetail } from '@/features/design';
import { layoutQueryOptions } from '@/lib/apis';

// The layout itself is this route's only query and gates the detail screen's loading state, so the
// loader prefetches it — the editor renders on the server instead of a spinner.
export const Route = createFileRoute('/_app/design/layouts/$layoutId')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(layoutQueryOptions(params.layoutId)),
  component: LayoutDetailRoute,
});

function LayoutDetailRoute(): ReactElement {
  const { layoutId } = Route.useParams();
  return <LayoutDetail layoutId={layoutId} />;
}

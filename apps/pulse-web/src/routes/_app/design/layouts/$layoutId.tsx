import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { LayoutDetail } from '@/features/design';
import { layoutQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/design/layouts/$layoutId')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(layoutQueryOptions(params.layoutId)),
  component: LayoutDetailRoute,
});

function LayoutDetailRoute(): ReactElement {
  const { layoutId } = Route.useParams();
  return <LayoutDetail layoutId={layoutId} />;
}

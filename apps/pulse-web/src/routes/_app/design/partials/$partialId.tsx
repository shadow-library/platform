/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 *  Importing user defined modules
 */
import { PartialDetail } from '@/features/design';

export const Route = createFileRoute('/_app/design/partials/$partialId')({
  component: PartialDetailRoute,
});

function PartialDetailRoute(): ReactElement {
  const { partialId } = Route.useParams();
  return <PartialDetail partialId={partialId} />;
}

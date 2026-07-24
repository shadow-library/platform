/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 *  Importing user defined modules
 */
import { LayoutDetail } from '@/features/design';

export const Route = createFileRoute('/_app/design/layouts/$layoutId')({
  component: LayoutDetailRoute,
});

function LayoutDetailRoute(): ReactElement {
  const { layoutId } = Route.useParams();
  return <LayoutDetail layoutId={layoutId} />;
}

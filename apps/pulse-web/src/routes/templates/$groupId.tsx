/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 *  Importing user defined modules
 */
import { GroupDetail } from '@/features/templates';

export const Route = createFileRoute('/templates/$groupId')({
  component: GroupDetailRoute,
});

function GroupDetailRoute(): ReactElement {
  const { groupId } = Route.useParams();
  return <GroupDetail groupId={groupId} />;
}

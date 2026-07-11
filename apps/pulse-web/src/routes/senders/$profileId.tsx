/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 *  Importing user defined modules
 */
import { ProfileDetail } from '@/features/senders';

export const Route = createFileRoute('/senders/$profileId')({
  component: ProfileDetailRoute,
});

function ProfileDetailRoute(): ReactElement {
  const { profileId } = Route.useParams();
  return <ProfileDetail profileId={profileId} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { ProfileDetail } from '@/features/senders';
import { senderProfileQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/senders/$profileId')({
  // Only the profile is prefetched; the endpoint table's query stays a client fetch (secondary, filtered client-side).
  loader: ({ context, params }) => context.queryClient.prefetchQuery(senderProfileQueryOptions(params.profileId)),
  component: ProfileDetailRoute,
});

function ProfileDetailRoute(): ReactElement {
  const { profileId } = Route.useParams();
  return <ProfileDetail profileId={profileId} />;
}

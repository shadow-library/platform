import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { ProfileDetail } from '@/features/senders';
import { senderProfileQueryOptions } from '@/lib/apis';

// The profile is the query that gates this screen's loading state, so the loader prefetches it — the
// endpoint table's own query stays a client fetch, same as the endpoints list on this page (secondary,
// filtered client-side).
export const Route = createFileRoute('/_app/senders/$profileId')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(senderProfileQueryOptions(params.profileId)),
  component: ProfileDetailRoute,
});

function ProfileDetailRoute(): ReactElement {
  const { profileId } = Route.useParams();
  return <ProfileDetail profileId={profileId} />;
}

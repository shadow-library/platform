import { createFileRoute } from '@tanstack/react-router';

import { ProfileList } from '@/features/senders';

export const Route = createFileRoute('/_app/senders/')({
  component: ProfileList,
});

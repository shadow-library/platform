import { createFileRoute, redirect } from '@tanstack/react-router';

import { projectHomeRoute } from '@/components/Layout';

export const Route = createFileRoute('/novels/$novelId/')({
  loader: ({ params }) => {
    throw redirect({ to: projectHomeRoute(), params });
  },
});

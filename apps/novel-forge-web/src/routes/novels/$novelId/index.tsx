import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/novels/$novelId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/novels/$novelId/overview', params });
  },
});

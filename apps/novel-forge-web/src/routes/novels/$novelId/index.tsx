/**
 * Importing npm packages
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

/** The novel root has no page of its own — send readers to the Overview. */
export const Route = createFileRoute('/novels/$novelId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/novels/$novelId/overview', params });
  },
});

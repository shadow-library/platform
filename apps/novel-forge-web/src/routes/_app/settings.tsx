import { createFileRoute, redirect } from '@tanstack/react-router';

/** The account Settings screen is retired; an old link to it opens the projects home. */
export const Route = createFileRoute('/_app/settings')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});

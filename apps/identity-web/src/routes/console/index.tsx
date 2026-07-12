/**
 * Importing npm packages
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

/** The console opens on the user directory. */
export const Route = createFileRoute('/console/')({
  beforeLoad: () => {
    throw redirect({ to: '/console/users' });
  },
});

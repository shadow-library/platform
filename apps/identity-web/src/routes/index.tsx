/**
 * Importing npm packages
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The bare root has no page of its own — send visitors to their account portal. The portal layout
 * bounces anyone without a session on to the hosted sign-in.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/account' });
  },
});

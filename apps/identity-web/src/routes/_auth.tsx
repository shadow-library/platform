/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * The hosted-auth layout group. Each page renders the full split-screen chrome itself (via
 * `AuthScreen`), so this layout is a pass-through that just scopes the `/login`, `/register`,
 * `/recover`, `/consent`, and `/error` routes.
 */
export const Route = createFileRoute('/_auth')({
  component: () => <Outlet />,
});

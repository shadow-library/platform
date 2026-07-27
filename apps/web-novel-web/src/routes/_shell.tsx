/**
 * Importing npm packages
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { AppShell } from '@/features/shell';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The pathless layout that mounts the app chrome (sidebar, top bar, bottom navigation). The reader and
 * sign-in routes live outside it — they own the full viewport.
 */
export const Route = createFileRoute('/_shell')({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

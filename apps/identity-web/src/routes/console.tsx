/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { ConsoleShell } from '@/features/console';

/** The privileged operator console (`/console/*`). */
export const Route = createFileRoute('/console')({
  component: () => (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  ),
});

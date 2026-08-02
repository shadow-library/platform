/**
 * Importing npm packages
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { AppShell } from '@/components/Layout';
import { meQuery } from '@/lib/apis';
import { requireSession } from '@/lib/session';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  /**
   * Warms the author's name so the shell renders it server-side rather than flashing the fallback and
   * swapping it on hydration. The rejection is swallowed on purpose: this is chrome, and a name that
   * could not be fetched must never take down a screen the session gate already cleared — the
   * components fall back on their own.
   */
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery).catch(() => undefined),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

import { createFileRoute, Outlet } from '@tanstack/react-router';

import { SessionGuard } from '@/features/auth';
import { AppShell } from '@/features/shell';
import { requireReaderAccess } from '@/lib/apis';

export const Route = createFileRoute('/_shell')({
  beforeLoad: async ({ context, location }) => ({ accessMode: await requireReaderAccess(context.queryClient, location.href) }),
  component: GatedShell,
});

function GatedShell(): React.JSX.Element {
  const accessMode = Route.useRouteContext({ select: context => context.accessMode });
  return (
    <SessionGuard accessMode={accessMode}>
      <AppShell>
        <Outlet />
      </AppShell>
    </SessionGuard>
  );
}

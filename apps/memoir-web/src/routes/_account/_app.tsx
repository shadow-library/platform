import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { StatusRegion } from '@/components/StatusPage';
import { AppShell } from '@/features/shell';

export const Route = createFileRoute('/_account/_app')({ component: AppLayout });

function AppLayout(): ReactElement {
  return (
    <AppShell>
      <StatusRegion>
        <Outlet />
      </StatusRegion>
    </AppShell>
  );
}

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { SetupLayout } from '@/features/onboarding';

export const Route = createFileRoute('/_account/_setup')({ component: SetupRoute });

function SetupRoute(): ReactElement {
  return (
    <SetupLayout>
      <Outlet />
    </SetupLayout>
  );
}

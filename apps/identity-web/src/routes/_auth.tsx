import { createFileRoute, Outlet } from '@tanstack/react-router';

import { authMethodsQueryOptions } from '@/lib/apis';

/** Shared by every sign-in screen so login and register both know which methods an operator has enabled. */
export const Route = createFileRoute('/_auth')({
  loader: ({ context }) => context.queryClient.ensureQueryData(authMethodsQueryOptions()),
  component: () => <Outlet />,
});

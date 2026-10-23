import { createFileRoute, Outlet } from '@tanstack/react-router';

import { authMethodsQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_auth')({
  loader: ({ context }) => context.queryClient.ensureQueryData(authMethodsQueryOptions()),
  component: () => <Outlet />,
});

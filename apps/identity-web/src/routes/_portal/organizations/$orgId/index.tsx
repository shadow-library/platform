import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_portal/organizations/$orgId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/organizations/$orgId/members', params: { orgId: params.orgId } });
  },
});

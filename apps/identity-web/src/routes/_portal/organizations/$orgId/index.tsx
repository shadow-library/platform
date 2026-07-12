/**
 * Importing npm packages
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

/** The org workspace opens on its members tab. */
export const Route = createFileRoute('/_portal/organizations/$orgId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/organizations/$orgId/members', params: { orgId: params.orgId } });
  },
});

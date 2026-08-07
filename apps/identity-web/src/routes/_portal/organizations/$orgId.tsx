import { createFileRoute, Outlet } from '@tanstack/react-router';

import { OrgWorkspace } from '@/features/portal';
import { myOrganisationsQueryOptions, organisationQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_portal/organizations/$orgId')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(myOrganisationsQueryOptions()), context.queryClient.ensureQueryData(organisationQueryOptions(params.orgId))]),
  component: OrgLayout,
});

function OrgLayout(): React.JSX.Element {
  const { orgId } = Route.useParams();
  return (
    <OrgWorkspace orgId={orgId}>
      <Outlet />
    </OrgWorkspace>
  );
}

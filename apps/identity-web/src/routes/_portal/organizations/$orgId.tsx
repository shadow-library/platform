/**
 * Importing npm packages
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { OrgWorkspace } from '@/features/portal';
import { organisationQueryOptions } from '@/lib/apis';

/** The single-organisation workspace layout (settings / members / domains / identity providers). */
export const Route = createFileRoute('/_portal/organizations/$orgId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(organisationQueryOptions(params.orgId)),
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

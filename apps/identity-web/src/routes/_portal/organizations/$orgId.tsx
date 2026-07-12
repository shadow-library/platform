/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { OrgWorkspace } from '@/features/portal';

/** The single-organisation workspace layout (settings / members / domains / identity providers). */
export const Route = createFileRoute('/_portal/organizations/$orgId')({
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

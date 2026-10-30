import { createFileRoute } from '@tanstack/react-router';

import { myOrganisationsQueryOptions, organisationQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_portal/organizations/$orgId')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(myOrganisationsQueryOptions()), context.queryClient.ensureQueryData(organisationQueryOptions(params.orgId))]),
});

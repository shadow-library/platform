/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type OrganisationApplicationItem, type OrganisationApplicationsResponse, type UpdateOrganisationBody } from './api-types.gen';
import { orgKeys } from './organisation.api';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

export type { OrganisationApplicationItem, OrganisationApplicationsResponse };

/** How an organisation grants apps to its members: every visible app, or a managed allowlist (D-A1). */
export type AppAccessMode = OrganisationApplicationsResponse['appAccessMode'];

/**
 * Declaring the constants
 *
 * The applications an organisation's members may reach. Reading the list is an org-ADMIN surface;
 * assigning/unassigning apps needs ADMIN + step-up, and flipping the access mode is OWNER + step-up —
 * so callers gate the affordances the same way and the server remains the authority.
 */
export const orgApplicationKeys = {
  list: (orgId: string) => [...orgKeys.detail(orgId), 'applications'] as const,
};

/** ---------- server functions ---------- */

const fetchOrgApplications = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<OrganisationApplicationsResponse>({ method: 'GET', path: `/organisations/${data}/applications` }));
const assignOrgApplication = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; applicationId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: `/organisations/${data.orgId}/applications`, body: { applicationId: data.applicationId } }));
const unassignOrgApplication = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; applicationId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/organisations/${data.orgId}/applications/${data.applicationId}` }));
const setAppAccessMode = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; appAccessMode: AppAccessMode }) => input)
  .handler(({ data }) =>
    serverFetch<undefined>({ method: 'PATCH', path: `/organisations/${data.orgId}`, body: { appAccessMode: data.appAccessMode } satisfies UpdateOrganisationBody }),
  );

/** ---------- queries + mutations ---------- */

export const orgApplicationsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<OrganisationApplicationsResponse, ApiError>({
    queryKey: orgApplicationKeys.list(orgId),
    queryFn: () => call(fetchOrgApplications({ data: orgId })),
    enabled: enabled && Boolean(orgId),
  });

export function useOrgApplicationsQuery(orgId: string, enabled = true): UseQueryResult<OrganisationApplicationsResponse, ApiError> {
  return useQuery(orgApplicationsQueryOptions(orgId, enabled));
}

export function useAssignOrgApplicationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: applicationId => call(assignOrgApplication({ data: { orgId, applicationId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(orgId) }),
  });
}

export function useUnassignOrgApplicationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: applicationId => call(unassignOrgApplication({ data: { orgId, applicationId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(orgId) }),
  });
}

export function useSetAppAccessModeMutation(orgId: string): UseMutationResult<undefined, ApiError, AppAccessMode> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, AppAccessMode>({
    mutationFn: appAccessMode => call(setAppAccessMode({ data: { orgId, appAccessMode } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
    },
  });
}

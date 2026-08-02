/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type OrganisationApplicationItem, type OrganisationApplicationsResponse, type UpdateOrganisationBody } from './api-types.gen';
import { orgKeys } from './organisation.api';
import { type ApiError, APIRequest } from './transport';

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

/** ---------- queries + mutations ---------- */

export const orgApplicationsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<OrganisationApplicationsResponse, ApiError>({
    queryKey: orgApplicationKeys.list(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/applications`).signal(signal).execute<OrganisationApplicationsResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useOrgApplicationsQuery(orgId: string, enabled = true): UseQueryResult<OrganisationApplicationsResponse, ApiError> {
  return useQuery(orgApplicationsQueryOptions(orgId, enabled));
}

export function useAssignOrgApplicationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: applicationId => APIRequest.post(`/organisations/${orgId}/applications`).body({ applicationId }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(orgId) }),
  });
}

export function useUnassignOrgApplicationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: applicationId => APIRequest.delete(`/organisations/${orgId}/applications/${applicationId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(orgId) }),
  });
}

export function useSetAppAccessModeMutation(orgId: string): UseMutationResult<undefined, ApiError, AppAccessMode> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, AppAccessMode>({
    mutationFn: appAccessMode =>
      APIRequest.patch(`/organisations/${orgId}`)
        .body({ appAccessMode } satisfies UpdateOrganisationBody)
        .execute<undefined>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
    },
  });
}

/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type PolicyActionResponse, type PolicyItem, type PolicyListResponse, type SetPolicyBody } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

/**
 * Defining types
 */

export type { PolicyItem, PolicyListResponse, SetPolicyBody };

/**
 * Declaring the constants
 */
export const policyKeys = {
  all: ['organisations'] as const,
  list: (orgId: string) => [...policyKeys.all, orgId, 'policies'] as const,
};

/** ---------- queries ---------- */

export const organisationPoliciesQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<PolicyListResponse, ApiError>({
    queryKey: policyKeys.list(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/policies`).signal(signal).execute<PolicyListResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function usePoliciesQuery(orgId: string, enabled = true): UseQueryResult<PolicyListResponse, ApiError> {
  return useQuery(organisationPoliciesQueryOptions(orgId, enabled));
}

/** ---------- mutations ---------- */

/** Set an organisation's override for one policy key — `value` for an integer key, `enabled` for a boolean one (step-up required server-side). */
export function useSetPolicyMutation(): UseMutationResult<PolicyActionResponse, ApiError, { orgId: string; policyKey: string; body: SetPolicyBody }> {
  const queryClient = useQueryClient();
  return useMutation<PolicyActionResponse, ApiError, { orgId: string; policyKey: string; body: SetPolicyBody }>({
    mutationFn: input => APIRequest.put(`/organisations/${input.orgId}/policies/${input.policyKey}`).body(input.body).execute<PolicyActionResponse>(),
    onSuccess: (_data, { orgId }) => queryClient.invalidateQueries({ queryKey: policyKeys.list(orgId) }),
  });
}

/** Clear an organisation's override so the key inherits the platform default (step-up required server-side). */
export function useClearPolicyMutation(): UseMutationResult<PolicyActionResponse, ApiError, { orgId: string; policyKey: string }> {
  const queryClient = useQueryClient();
  return useMutation<PolicyActionResponse, ApiError, { orgId: string; policyKey: string }>({
    mutationFn: input => APIRequest.delete(`/organisations/${input.orgId}/policies/${input.policyKey}`).execute<PolicyActionResponse>(),
    onSuccess: (_data, { orgId }) => queryClient.invalidateQueries({ queryKey: policyKeys.list(orgId) }),
  });
}

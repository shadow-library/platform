/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type PolicyActionResponse, type PolicyItem, type PolicyListResponse, type SetPolicyBody } from './api-types.gen';
import { serverFetch } from './server-fetch';

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

/** ---------- server functions ---------- */

const fetchPolicies = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<PolicyListResponse>({ method: 'GET', path: `/organisations/${data}/policies` }));
const setPolicy = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; policyKey: string; body: SetPolicyBody }) => input)
  .handler(({ data }) => serverFetch<PolicyActionResponse>({ method: 'PUT', path: `/organisations/${data.orgId}/policies/${data.policyKey}`, body: data.body }));
const clearPolicy = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; policyKey: string }) => input)
  .handler(({ data }) => serverFetch<PolicyActionResponse>({ method: 'DELETE', path: `/organisations/${data.orgId}/policies/${data.policyKey}` }));

/** ---------- queries ---------- */

export const organisationPoliciesQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<PolicyListResponse, ApiError>({
    queryKey: policyKeys.list(orgId),
    queryFn: () => call(fetchPolicies({ data: orgId })),
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
    mutationFn: input => call(setPolicy({ data: input })),
    onSuccess: (_data, { orgId }) => queryClient.invalidateQueries({ queryKey: policyKeys.list(orgId) }),
  });
}

/** Clear an organisation's override so the key inherits the platform default (step-up required server-side). */
export function useClearPolicyMutation(): UseMutationResult<PolicyActionResponse, ApiError, { orgId: string; policyKey: string }> {
  const queryClient = useQueryClient();
  return useMutation<PolicyActionResponse, ApiError, { orgId: string; policyKey: string }>({
    mutationFn: input => call(clearPolicy({ data: input })),
    onSuccess: (_data, { orgId }) => queryClient.invalidateQueries({ queryKey: policyKeys.list(orgId) }),
  });
}

/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ApiError, APIRequest } from './api-request';
import { type ClientDetailResponse, type ClientListResponse, type ClientSummaryItem, type RotateSecretResponse, type UpdateClientBody } from './api-types.gen';

/**
 * Defining types
 */

export type { ClientDetailResponse, ClientListResponse, ClientSummaryItem, RotateSecretResponse, UpdateClientBody };
export type ClientKind = ClientSummaryItem['kind'];
export type GrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';

/**
 * Declaring the constants
 */
export const adminClientKeys = {
  all: ['admin', 'clients'] as const,
  list: () => [...adminClientKeys.all, 'list'] as const,
  detail: (clientId: string) => [...adminClientKeys.all, clientId] as const,
};

/** ---------- queries ---------- */

export const adminClientsQueryOptions = () =>
  queryOptions<ClientListResponse, ApiError>({
    queryKey: adminClientKeys.list(),
    queryFn: ({ signal }) => APIRequest.get('/admin/clients').signal(signal).execute<ClientListResponse>(),
  });

export function useClientsQuery(): UseQueryResult<ClientListResponse, ApiError> {
  return useQuery(adminClientsQueryOptions());
}

export const adminClientQueryOptions = (clientId: string, enabled = true) =>
  queryOptions<ClientDetailResponse, ApiError>({
    queryKey: adminClientKeys.detail(clientId),
    queryFn: ({ signal }) => APIRequest.get(`/admin/clients/${clientId}`).signal(signal).execute<ClientDetailResponse>(),
    enabled: enabled && Boolean(clientId),
  });

export function useClientQuery(clientId: string, enabled = true): UseQueryResult<ClientDetailResponse, ApiError> {
  return useQuery(adminClientQueryOptions(clientId, enabled));
}

/** ---------- mutations ---------- */

export function useUpdateClientMutation(): UseMutationResult<ClientDetailResponse, ApiError, { clientId: string; body: UpdateClientBody }> {
  const queryClient = useQueryClient();
  return useMutation<ClientDetailResponse, ApiError, { clientId: string; body: UpdateClientBody }>({
    mutationFn: input => APIRequest.patch(`/admin/clients/${input.clientId}`).body(input.body).execute<ClientDetailResponse>(),
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: adminClientKeys.list() });
      queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) });
    },
  });
}

export function useRotateClientSecretMutation(): UseMutationResult<RotateSecretResponse, ApiError, string> {
  return useMutation<RotateSecretResponse, ApiError, string>({
    mutationFn: clientId => APIRequest.post(`/admin/clients/${clientId}/rotate-secret`).body({}).execute<RotateSecretResponse>(),
  });
}

export function useGrantClientScopeMutation(): UseMutationResult<undefined, ApiError, { clientId: string; scopeId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { clientId: string; scopeId: string }>({
    mutationFn: input => APIRequest.post(`/admin/clients/${input.clientId}/scopes`).body({ scopeId: input.scopeId }).execute<undefined>(),
    onSuccess: (_data, { clientId }) => queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) }),
  });
}

export function useRevokeClientScopeMutation(): UseMutationResult<undefined, ApiError, { clientId: string; scopeId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { clientId: string; scopeId: string }>({
    mutationFn: input => APIRequest.delete(`/admin/clients/${input.clientId}/scopes/${input.scopeId}`).execute<undefined>(),
    onSuccess: (_data, { clientId }) => queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) }),
  });
}

/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import {
  type ClientDetailResponse,
  type ClientListResponse,
  type ClientSummaryItem,
  type RegisterClientBody,
  type RegisterClientResponse,
  type RotateSecretResponse,
  type UpdateClientBody,
} from './api-types.gen';

/**
 * Defining types
 */

export type { ClientDetailResponse, ClientListResponse, ClientSummaryItem, RegisterClientBody, RegisterClientResponse, RotateSecretResponse, UpdateClientBody };
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

export function useClientsQuery(): UseQueryResult<ClientListResponse, ApiError> {
  return useQuery<ClientListResponse, ApiError>({ queryKey: adminClientKeys.list(), queryFn: () => APIRequest.get('/admin/clients').execute() });
}

export function useClientQuery(clientId: string, enabled = true): UseQueryResult<ClientDetailResponse, ApiError> {
  return useQuery<ClientDetailResponse, ApiError>({
    queryKey: adminClientKeys.detail(clientId),
    queryFn: () => APIRequest.get(`/admin/clients/${clientId}`).execute(),
    enabled: enabled && Boolean(clientId),
  });
}

export function useRegisterClientMutation(): UseMutationResult<RegisterClientResponse, ApiError, RegisterClientBody> {
  const queryClient = useQueryClient();
  return useMutation<RegisterClientResponse, ApiError, RegisterClientBody>({
    mutationFn: body => APIRequest.post('/admin/clients').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminClientKeys.list() }),
  });
}

export function useUpdateClientMutation(): UseMutationResult<ClientDetailResponse, ApiError, { clientId: string; body: UpdateClientBody }> {
  const queryClient = useQueryClient();
  return useMutation<ClientDetailResponse, ApiError, { clientId: string; body: UpdateClientBody }>({
    mutationFn: ({ clientId, body }) => APIRequest.patch(`/admin/clients/${clientId}`).body(body).execute(),
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: adminClientKeys.list() });
      queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) });
    },
  });
}

export function useRotateClientSecretMutation(): UseMutationResult<RotateSecretResponse, ApiError, string> {
  return useMutation<RotateSecretResponse, ApiError, string>({ mutationFn: clientId => APIRequest.post(`/admin/clients/${clientId}/rotate-secret`).body({}).execute() });
}

export function useGrantClientScopeMutation(): UseMutationResult<undefined, ApiError, { clientId: string; scopeId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { clientId: string; scopeId: string }>({
    mutationFn: ({ clientId, scopeId }) => APIRequest.post(`/admin/clients/${clientId}/scopes`).body({ scopeId }).execute(),
    onSuccess: (_data, { clientId }) => queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) }),
  });
}

export function useRevokeClientScopeMutation(): UseMutationResult<undefined, ApiError, { clientId: string; scopeId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { clientId: string; scopeId: string }>({
    mutationFn: ({ clientId, scopeId }) => APIRequest.delete(`/admin/clients/${clientId}/scopes/${scopeId}`).execute(),
    onSuccess: (_data, { clientId }) => queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) }),
  });
}

/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import {
  type ClientDetailResponse,
  type ClientListResponse,
  type ClientSummaryItem,
  type RegisterClientBody,
  type RegisterClientResponse,
  type RotateSecretResponse,
  type UpdateClientBody,
} from './api-types.gen';
import { serverFetch } from './server-fetch';

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

/* ---------- server functions ---------- */

const fetchClients = createServerFn({ method: 'GET' }).handler(() => serverFetch<ClientListResponse>({ method: 'GET', path: '/admin/clients' }));
const fetchClient = createServerFn({ method: 'GET' })
  .validator((clientId: string) => clientId)
  .handler(({ data }) => serverFetch<ClientDetailResponse>({ method: 'GET', path: `/admin/clients/${data}` }));
const registerClient = createServerFn({ method: 'POST' })
  .validator((body: RegisterClientBody) => body)
  .handler(({ data }) => serverFetch<RegisterClientResponse>({ method: 'POST', path: '/admin/clients', body: data }));
const updateClient = createServerFn({ method: 'POST' })
  .validator((input: { clientId: string; body: UpdateClientBody }) => input)
  .handler(({ data }) => serverFetch<ClientDetailResponse>({ method: 'PATCH', path: `/admin/clients/${data.clientId}`, body: data.body }));
const rotateClientSecret = createServerFn({ method: 'POST' })
  .validator((clientId: string) => clientId)
  .handler(({ data }) => serverFetch<RotateSecretResponse>({ method: 'POST', path: `/admin/clients/${data}/rotate-secret`, body: {} }));
const grantClientScope = createServerFn({ method: 'POST' })
  .validator((input: { clientId: string; scopeId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: `/admin/clients/${data.clientId}/scopes`, body: { scopeId: data.scopeId } }));
const revokeClientScope = createServerFn({ method: 'POST' })
  .validator((input: { clientId: string; scopeId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/admin/clients/${data.clientId}/scopes/${data.scopeId}` }));

/* ---------- queries ---------- */

export const adminClientsQueryOptions = () => queryOptions<ClientListResponse, ApiError>({ queryKey: adminClientKeys.list(), queryFn: () => call(fetchClients()) });

export function useClientsQuery(): UseQueryResult<ClientListResponse, ApiError> {
  return useQuery(adminClientsQueryOptions());
}

export const adminClientQueryOptions = (clientId: string, enabled = true) =>
  queryOptions<ClientDetailResponse, ApiError>({
    queryKey: adminClientKeys.detail(clientId),
    queryFn: () => call(fetchClient({ data: clientId })),
    enabled: enabled && Boolean(clientId),
  });

export function useClientQuery(clientId: string, enabled = true): UseQueryResult<ClientDetailResponse, ApiError> {
  return useQuery(adminClientQueryOptions(clientId, enabled));
}

/* ---------- mutations ---------- */

export function useRegisterClientMutation(): UseMutationResult<RegisterClientResponse, ApiError, RegisterClientBody> {
  const queryClient = useQueryClient();
  return useMutation<RegisterClientResponse, ApiError, RegisterClientBody>({
    mutationFn: body => call(registerClient({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminClientKeys.list() }),
  });
}

export function useUpdateClientMutation(): UseMutationResult<ClientDetailResponse, ApiError, { clientId: string; body: UpdateClientBody }> {
  const queryClient = useQueryClient();
  return useMutation<ClientDetailResponse, ApiError, { clientId: string; body: UpdateClientBody }>({
    mutationFn: input => call(updateClient({ data: input })),
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: adminClientKeys.list() });
      queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) });
    },
  });
}

export function useRotateClientSecretMutation(): UseMutationResult<RotateSecretResponse, ApiError, string> {
  return useMutation<RotateSecretResponse, ApiError, string>({ mutationFn: clientId => call(rotateClientSecret({ data: clientId })) });
}

export function useGrantClientScopeMutation(): UseMutationResult<undefined, ApiError, { clientId: string; scopeId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { clientId: string; scopeId: string }>({
    mutationFn: input => call(grantClientScope({ data: input })),
    onSuccess: (_data, { clientId }) => queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) }),
  });
}

export function useRevokeClientScopeMutation(): UseMutationResult<undefined, ApiError, { clientId: string; scopeId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { clientId: string; scopeId: string }>({
    mutationFn: input => call(revokeClientScope({ data: input })),
    onSuccess: (_data, { clientId }) => queryClient.invalidateQueries({ queryKey: adminClientKeys.detail(clientId) }),
  });
}

/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type CreateServiceProviderBody, type ServiceProviderItem, type ServiceProviderListResponse, type UpdateServiceProviderBody } from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

export type { CreateServiceProviderBody, ServiceProviderItem, ServiceProviderListResponse, UpdateServiceProviderBody };
export type SamlNameIdFormat = ServiceProviderItem['nameIdFormat'];

/**
 * Declaring the constants
 */
export const adminSamlKeys = {
  all: ['admin', 'saml'] as const,
  detail: (id: string) => [...adminSamlKeys.all, id] as const,
};

const fetchServiceProviders = createServerFn({ method: 'GET' }).handler(() => serverFetch<ServiceProviderListResponse>({ method: 'GET', path: '/admin/saml/service-providers' }));
const fetchServiceProvider = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => serverFetch<ServiceProviderItem>({ method: 'GET', path: `/admin/saml/service-providers/${data}` }));
const createServiceProvider = createServerFn({ method: 'POST' })
  .validator((body: CreateServiceProviderBody) => body)
  .handler(({ data }) => serverFetch<ServiceProviderItem>({ method: 'POST', path: '/admin/saml/service-providers', body: data }));
const updateServiceProvider = createServerFn({ method: 'POST' })
  .validator((input: { id: string; body: UpdateServiceProviderBody }) => input)
  .handler(({ data }) => serverFetch<ServiceProviderItem>({ method: 'PATCH', path: `/admin/saml/service-providers/${data.id}`, body: data.body }));
const deleteServiceProvider = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/admin/saml/service-providers/${data}` }));

export const serviceProvidersQueryOptions = () =>
  queryOptions<ServiceProviderListResponse, ApiError>({ queryKey: adminSamlKeys.all, queryFn: () => call(fetchServiceProviders()) });

export function useServiceProvidersQuery(): UseQueryResult<ServiceProviderListResponse, ApiError> {
  return useQuery(serviceProvidersQueryOptions());
}

export const serviceProviderQueryOptions = (id: string, enabled = true) =>
  queryOptions<ServiceProviderItem, ApiError>({
    queryKey: adminSamlKeys.detail(id),
    queryFn: () => call(fetchServiceProvider({ data: id })),
    enabled: enabled && Boolean(id),
  });

export function useServiceProviderQuery(id: string, enabled = true): UseQueryResult<ServiceProviderItem, ApiError> {
  return useQuery(serviceProviderQueryOptions(id, enabled));
}

export function useCreateServiceProviderMutation(): UseMutationResult<ServiceProviderItem, ApiError, CreateServiceProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<ServiceProviderItem, ApiError, CreateServiceProviderBody>({
    mutationFn: body => call(createServiceProvider({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

export function useUpdateServiceProviderMutation(): UseMutationResult<ServiceProviderItem, ApiError, { id: string; body: UpdateServiceProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<ServiceProviderItem, ApiError, { id: string; body: UpdateServiceProviderBody }>({
    mutationFn: input => call(updateServiceProvider({ data: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

export function useDeleteServiceProviderMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => call(deleteServiceProvider({ data: id })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

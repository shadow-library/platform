import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type CreateServiceProviderBody, type ServiceProviderItem, type ServiceProviderListResponse, type UpdateServiceProviderBody } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type { CreateServiceProviderBody, ServiceProviderItem, ServiceProviderListResponse, UpdateServiceProviderBody };
export type SamlNameIdFormat = ServiceProviderItem['nameIdFormat'];

export const adminSamlKeys = {
  all: ['admin', 'saml'] as const,
  detail: (id: string) => [...adminSamlKeys.all, id] as const,
};

export const serviceProvidersQueryOptions = () =>
  queryOptions<ServiceProviderListResponse, ApiError>({
    queryKey: adminSamlKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/saml/service-providers').signal(signal).execute<ServiceProviderListResponse>(),
  });

export function useServiceProvidersQuery(): UseQueryResult<ServiceProviderListResponse, ApiError> {
  return useQuery(serviceProvidersQueryOptions());
}

export const serviceProviderQueryOptions = (id: string, enabled = true) =>
  queryOptions<ServiceProviderItem, ApiError>({
    queryKey: adminSamlKeys.detail(id),
    queryFn: ({ signal }) => APIRequest.get(`/admin/saml/service-providers/${id}`).signal(signal).execute<ServiceProviderItem>(),
    enabled: enabled && Boolean(id),
  });

export function useServiceProviderQuery(id: string, enabled = true): UseQueryResult<ServiceProviderItem, ApiError> {
  return useQuery(serviceProviderQueryOptions(id, enabled));
}

export function useCreateServiceProviderMutation(): UseMutationResult<ServiceProviderItem, ApiError, CreateServiceProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<ServiceProviderItem, ApiError, CreateServiceProviderBody>({
    mutationFn: body => APIRequest.post('/admin/saml/service-providers').body(body).execute<ServiceProviderItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

export function useUpdateServiceProviderMutation(): UseMutationResult<ServiceProviderItem, ApiError, { id: string; body: UpdateServiceProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<ServiceProviderItem, ApiError, { id: string; body: UpdateServiceProviderBody }>({
    mutationFn: input => APIRequest.patch(`/admin/saml/service-providers/${input.id}`).body(input.body).execute<ServiceProviderItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

export function useDeleteServiceProviderMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => APIRequest.delete(`/admin/saml/service-providers/${id}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

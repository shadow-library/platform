/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type CreateServiceProviderBody, type ServiceProviderItem, type ServiceProviderListResponse, type UpdateServiceProviderBody } from './api-types.gen';

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

export function useServiceProvidersQuery(): UseQueryResult<ServiceProviderListResponse, ApiError> {
  return useQuery<ServiceProviderListResponse, ApiError>({ queryKey: adminSamlKeys.all, queryFn: () => APIRequest.get('/admin/saml/service-providers').execute() });
}

export function useServiceProviderQuery(id: string, enabled = true): UseQueryResult<ServiceProviderItem, ApiError> {
  return useQuery<ServiceProviderItem, ApiError>({
    queryKey: adminSamlKeys.detail(id),
    queryFn: () => APIRequest.get(`/admin/saml/service-providers/${id}`).execute(),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateServiceProviderMutation(): UseMutationResult<ServiceProviderItem, ApiError, CreateServiceProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<ServiceProviderItem, ApiError, CreateServiceProviderBody>({
    mutationFn: body => APIRequest.post('/admin/saml/service-providers').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

export function useUpdateServiceProviderMutation(): UseMutationResult<ServiceProviderItem, ApiError, { id: string; body: UpdateServiceProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<ServiceProviderItem, ApiError, { id: string; body: UpdateServiceProviderBody }>({
    mutationFn: ({ id, body }) => APIRequest.patch(`/admin/saml/service-providers/${id}`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

export function useDeleteServiceProviderMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => APIRequest.delete(`/admin/saml/service-providers/${id}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSamlKeys.all }),
  });
}

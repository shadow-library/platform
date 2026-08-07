import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type CreateScopeBody, type ResourceItem, type ResourceListResponse, type ScopeItem } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type { CreateScopeBody, ResourceItem, ResourceListResponse, ScopeItem };

export const adminResourceKeys = {
  all: ['admin', 'resources'] as const,
};

export const adminResourcesQueryOptions = () =>
  queryOptions<ResourceListResponse, ApiError>({
    queryKey: adminResourceKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/resources').signal(signal).execute<ResourceListResponse>(),
  });

export function useResourcesQuery(): UseQueryResult<ResourceListResponse, ApiError> {
  return useQuery(adminResourcesQueryOptions());
}

export function useCreateScopeMutation(): UseMutationResult<{ id: string }, ApiError, { resourceId: string; body: CreateScopeBody }> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, { resourceId: string; body: CreateScopeBody }>({
    mutationFn: input => APIRequest.post(`/admin/resources/${input.resourceId}/scopes`).body(input.body).execute<{ id: string }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminResourceKeys.all }),
  });
}

/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type CreateResourceBody, type CreateScopeBody, type ResourceItem, type ResourceListResponse, type ScopeItem } from './api-types.gen';

/**
 * Defining types
 */

export type { CreateResourceBody, CreateScopeBody, ResourceItem, ResourceListResponse, ScopeItem };

/**
 * Declaring the constants
 */
export const adminResourceKeys = {
  all: ['admin', 'resources'] as const,
};

export function useResourcesQuery(): UseQueryResult<ResourceListResponse, ApiError> {
  return useQuery<ResourceListResponse, ApiError>({ queryKey: adminResourceKeys.all, queryFn: () => APIRequest.get('/admin/resources').execute() });
}

export function useCreateResourceMutation(): UseMutationResult<{ id: string }, ApiError, CreateResourceBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, CreateResourceBody>({
    mutationFn: body => APIRequest.post('/admin/resources').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminResourceKeys.all }),
  });
}

export function useCreateScopeMutation(): UseMutationResult<{ id: string }, ApiError, { resourceId: string; body: CreateScopeBody }> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, { resourceId: string; body: CreateScopeBody }>({
    mutationFn: ({ resourceId, body }) => APIRequest.post(`/admin/resources/${resourceId}/scopes`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminResourceKeys.all }),
  });
}

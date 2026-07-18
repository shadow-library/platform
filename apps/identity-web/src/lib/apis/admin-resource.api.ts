/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type CreateResourceBody, type CreateScopeBody, type ResourceItem, type ResourceListResponse, type ScopeItem } from './api-types.gen';
import { serverFetch } from './server-fetch';

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

const fetchResources = createServerFn({ method: 'GET' }).handler(() => serverFetch<ResourceListResponse>({ method: 'GET', path: '/admin/resources' }));
const createResource = createServerFn({ method: 'POST' })
  .validator((body: CreateResourceBody) => body)
  .handler(({ data }) => serverFetch<{ id: string }>({ method: 'POST', path: '/admin/resources', body: data }));
const createScope = createServerFn({ method: 'POST' })
  .validator((input: { resourceId: string; body: CreateScopeBody }) => input)
  .handler(({ data }) => serverFetch<{ id: string }>({ method: 'POST', path: `/admin/resources/${data.resourceId}/scopes`, body: data.body }));

export const adminResourcesQueryOptions = () => queryOptions<ResourceListResponse, ApiError>({ queryKey: adminResourceKeys.all, queryFn: () => call(fetchResources()) });

export function useResourcesQuery(): UseQueryResult<ResourceListResponse, ApiError> {
  return useQuery(adminResourcesQueryOptions());
}

export function useCreateResourceMutation(): UseMutationResult<{ id: string }, ApiError, CreateResourceBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, CreateResourceBody>({
    mutationFn: body => call(createResource({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminResourceKeys.all }),
  });
}

export function useCreateScopeMutation(): UseMutationResult<{ id: string }, ApiError, { resourceId: string; body: CreateScopeBody }> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, { resourceId: string; body: CreateScopeBody }>({
    mutationFn: input => call(createScope({ data: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminResourceKeys.all }),
  });
}

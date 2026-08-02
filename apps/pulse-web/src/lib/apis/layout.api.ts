/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from './transport';

/**
 * Importing user defined packages
 */
import { type CreateLayoutBody, type LayoutDetailResponse, type LayoutResponse, type LayoutVersionResponse, type PublishLayoutBody, type UpdateLayoutBody } from './api-types.gen';
import { type ListLayoutResponse, type UpsertLayoutDraftBody } from './studio.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const layoutKeys = {
  all: ['layouts'],
  lists: () => [...layoutKeys.all, 'list'],
  list: () => [...layoutKeys.lists()],
  detail: (layoutId: string) => [...layoutKeys.all, layoutId],
} as const;

/** Shared by the layouts list route's loader prefetch and `useListLayoutsQuery` — identical key + fn, so SSR-dehydrated data hydrates without a second request. */
export const listLayoutsQueryOptions = (): UseQueryOptions<ListLayoutResponse, ApiError> =>
  queryOptions<ListLayoutResponse, ApiError>({
    queryKey: layoutKeys.list(),
    queryFn: () => APIRequest.get('/layouts').execute(),
  });

/** Shared by the layout detail route's loader prefetch and `useLayoutQuery`. */
export const layoutQueryOptions = (layoutId: string): UseQueryOptions<LayoutDetailResponse, ApiError> =>
  queryOptions<LayoutDetailResponse, ApiError>({
    queryKey: layoutKeys.detail(layoutId),
    queryFn: () => APIRequest.get(`/layouts/${layoutId}`).execute(),
  });

export function useListLayoutsQuery(): UseQueryResult<ListLayoutResponse, ApiError> {
  return useQuery(listLayoutsQueryOptions());
}

export function useLayoutQuery(layoutId: string): UseQueryResult<LayoutDetailResponse, ApiError> {
  return useQuery(layoutQueryOptions(layoutId));
}

export function useCreateLayoutMutation(): UseMutationResult<LayoutResponse, ApiError, CreateLayoutBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutResponse, ApiError, CreateLayoutBody>({
    mutationFn: data => APIRequest.post('/layouts').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: layoutKeys.lists() }),
  });
}

export function useUpdateLayoutMutation(layoutId: string): UseMutationResult<LayoutResponse, ApiError, UpdateLayoutBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutResponse, ApiError, UpdateLayoutBody>({
    mutationFn: data => APIRequest.patch(`/layouts/${layoutId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.detail(layoutId) });
      queryClient.invalidateQueries({ queryKey: layoutKeys.lists() });
    },
  });
}

export function useUpsertLayoutDraftMutation(layoutId: string): UseMutationResult<LayoutVersionResponse, ApiError, UpsertLayoutDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutVersionResponse, ApiError, UpsertLayoutDraftBody>({
    mutationFn: data => APIRequest.put(`/layouts/${layoutId}/draft`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: layoutKeys.detail(layoutId) }),
  });
}

export function usePublishLayoutMutation(layoutId: string): UseMutationResult<LayoutVersionResponse, ApiError, PublishLayoutBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutVersionResponse, ApiError, PublishLayoutBody>({
    mutationFn: data => APIRequest.post(`/layouts/${layoutId}/publish`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.detail(layoutId) });
      queryClient.invalidateQueries({ queryKey: layoutKeys.lists() });
    },
  });
}

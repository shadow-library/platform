/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from './api-request';

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

export function useListLayoutsQuery(): UseQueryResult<ListLayoutResponse, ApiError> {
  return useQuery<ListLayoutResponse, ApiError>({
    queryKey: layoutKeys.list(),
    queryFn: () => APIRequest.get('/layouts').execute(),
  });
}

export function useLayoutQuery(layoutId: string): UseQueryResult<LayoutDetailResponse, ApiError> {
  return useQuery<LayoutDetailResponse, ApiError>({
    queryKey: layoutKeys.detail(layoutId),
    queryFn: () => APIRequest.get(`/layouts/${layoutId}`).execute(),
  });
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

/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages
 */
import {
  type CreateLayoutBody,
  type LayoutDetailResponse,
  type LayoutResponse,
  type LayoutVersionResponse,
  type ListLayoutResponse,
  type PublishLayoutBody,
  type UpdateLayoutBody,
  type UpsertLayoutDraftBody,
} from './studio.types';

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
    queryFn: ({ signal }) => APIRequest.get('/api/v1/layouts').signal(signal).execute(),
  });
}

export function useLayoutQuery(layoutId: string): UseQueryResult<LayoutDetailResponse, ApiError> {
  return useQuery<LayoutDetailResponse, ApiError>({
    queryKey: layoutKeys.detail(layoutId),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/layouts/${layoutId}`).signal(signal).execute(),
  });
}

export function useCreateLayoutMutation(): UseMutationResult<LayoutResponse, ApiError, CreateLayoutBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutResponse, ApiError, CreateLayoutBody>({
    mutationFn: data => APIRequest.post('/api/v1/layouts').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: layoutKeys.lists() }),
  });
}

export function useUpdateLayoutMutation(layoutId: string): UseMutationResult<LayoutResponse, ApiError, UpdateLayoutBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutResponse, ApiError, UpdateLayoutBody>({
    mutationFn: data => APIRequest.patch(`/api/v1/layouts/${layoutId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.detail(layoutId) });
      queryClient.invalidateQueries({ queryKey: layoutKeys.lists() });
    },
  });
}

export function useUpsertLayoutDraftMutation(layoutId: string): UseMutationResult<LayoutVersionResponse, ApiError, UpsertLayoutDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutVersionResponse, ApiError, UpsertLayoutDraftBody>({
    mutationFn: data => APIRequest.put(`/api/v1/layouts/${layoutId}/draft`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: layoutKeys.detail(layoutId) }),
  });
}

export function usePublishLayoutMutation(layoutId: string): UseMutationResult<LayoutVersionResponse, ApiError, PublishLayoutBody> {
  const queryClient = useQueryClient();
  return useMutation<LayoutVersionResponse, ApiError, PublishLayoutBody>({
    mutationFn: data => APIRequest.post(`/api/v1/layouts/${layoutId}/publish`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.detail(layoutId) });
      queryClient.invalidateQueries({ queryKey: layoutKeys.lists() });
    },
  });
}

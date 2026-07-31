/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from './api-request';

/**
 * Importing user defined packages
 */
import {
  type CreatePartialBody,
  type ListPartialResponse,
  type PartialDetailResponse,
  type PartialResponse,
  type PartialVersionResponse,
  type PublishPartialBody,
  type UpdatePartialBody,
  type UpsertPartialDraftBody,
} from './studio.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const partialKeys = {
  all: ['partials'],
  lists: () => [...partialKeys.all, 'list'],
  list: () => [...partialKeys.lists()],
  detail: (partialId: string) => [...partialKeys.all, partialId],
} as const;

export function useListPartialsQuery(): UseQueryResult<ListPartialResponse, ApiError> {
  return useQuery<ListPartialResponse, ApiError>({
    queryKey: partialKeys.list(),
    queryFn: () => APIRequest.get('/partials').execute(),
  });
}

export function usePartialQuery(partialId: string): UseQueryResult<PartialDetailResponse, ApiError> {
  return useQuery<PartialDetailResponse, ApiError>({
    queryKey: partialKeys.detail(partialId),
    queryFn: () => APIRequest.get(`/partials/${partialId}`).execute(),
  });
}

export function useCreatePartialMutation(): UseMutationResult<PartialResponse, ApiError, CreatePartialBody> {
  const queryClient = useQueryClient();
  return useMutation<PartialResponse, ApiError, CreatePartialBody>({
    mutationFn: data => APIRequest.post('/partials').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: partialKeys.lists() }),
  });
}

export function useUpdatePartialMutation(partialId: string): UseMutationResult<PartialResponse, ApiError, UpdatePartialBody> {
  const queryClient = useQueryClient();
  return useMutation<PartialResponse, ApiError, UpdatePartialBody>({
    mutationFn: data => APIRequest.patch(`/partials/${partialId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partialKeys.detail(partialId) });
      queryClient.invalidateQueries({ queryKey: partialKeys.lists() });
    },
  });
}

export function useUpsertPartialDraftMutation(partialId: string): UseMutationResult<PartialVersionResponse, ApiError, UpsertPartialDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<PartialVersionResponse, ApiError, UpsertPartialDraftBody>({
    mutationFn: data => APIRequest.put(`/partials/${partialId}/draft`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: partialKeys.detail(partialId) }),
  });
}

export function usePublishPartialMutation(partialId: string): UseMutationResult<PartialVersionResponse, ApiError, PublishPartialBody> {
  const queryClient = useQueryClient();
  return useMutation<PartialVersionResponse, ApiError, PublishPartialBody>({
    mutationFn: data => APIRequest.post(`/partials/${partialId}/publish`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partialKeys.detail(partialId) });
      queryClient.invalidateQueries({ queryKey: partialKeys.lists() });
    },
  });
}

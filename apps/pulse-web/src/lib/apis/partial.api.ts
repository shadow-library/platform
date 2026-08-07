import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from './transport';

import {
  type CreatePartialBody,
  type PartialDetailResponse,
  type PartialResponse,
  type PartialVersionResponse,
  type PublishPartialBody,
  type UpdatePartialBody,
} from './api-types.gen';
import { type ListPartialResponse, type UpsertPartialDraftBody } from './studio.types';

const partialKeys = {
  all: ['partials'],
  lists: () => [...partialKeys.all, 'list'],
  list: () => [...partialKeys.lists()],
  detail: (partialId: string) => [...partialKeys.all, partialId],
} as const;

/** Shared by the partials list route's loader prefetch and `useListPartialsQuery` — identical key + fn, so SSR-dehydrated data hydrates without a second request. */
export const listPartialsQueryOptions = (): UseQueryOptions<ListPartialResponse, ApiError> =>
  queryOptions<ListPartialResponse, ApiError>({
    queryKey: partialKeys.list(),
    queryFn: () => APIRequest.get('/partials').execute(),
  });

export const partialQueryOptions = (partialId: string): UseQueryOptions<PartialDetailResponse, ApiError> =>
  queryOptions<PartialDetailResponse, ApiError>({
    queryKey: partialKeys.detail(partialId),
    queryFn: () => APIRequest.get(`/partials/${partialId}`).execute(),
  });

export function useListPartialsQuery(): UseQueryResult<ListPartialResponse, ApiError> {
  return useQuery(listPartialsQueryOptions());
}

export function usePartialQuery(partialId: string): UseQueryResult<PartialDetailResponse, ApiError> {
  return useQuery(partialQueryOptions(partialId));
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

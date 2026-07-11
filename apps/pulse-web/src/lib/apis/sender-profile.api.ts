/**
 * Importing npm packages
 */
import { type UseMutationOptions, type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages/modules
 */
import { APIRequest, ApiError } from './api-request';
import {
  type CreateSenderEndpointBody,
  type CreateSenderProfileBody,
  type ListSenderEndpointResponse,
  type ListSenderEndpointsQueryParams,
  type ListSenderProfileResponse,
  type ListSenderProfilesQueryParams,
  type SenderEndpointResponse,
  type SenderProfileResponse,
  type UpdateSenderEndpointBody,
  type UpdateSenderProfileBody,
} from './api-types.gen';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const senderProfileKeys = {
  all: ['sender-profiles'],
  lists: () => [...senderProfileKeys.all, 'list'],
  list: (params?: ListSenderProfilesQueryParams) => [...senderProfileKeys.lists(), params],
  detail: (profileId: string) => [...senderProfileKeys.all, profileId],
  endpoints: (profileId: string) => [...senderProfileKeys.all, profileId, 'endpoints'],
  endpointList: (profileId: string, params?: ListSenderEndpointsQueryParams) => [...senderProfileKeys.endpoints(profileId), params],
  endpoint: (profileId: string, endpointId: string) => [...senderProfileKeys.endpoints(profileId), endpointId],
} as const;

export function useListSenderProfilesQuery(params: ListSenderProfilesQueryParams = {}): UseQueryResult<ListSenderProfileResponse, ApiError> {
  return useQuery<ListSenderProfileResponse, ApiError>({
    queryKey: senderProfileKeys.list(params),
    queryFn: () => APIRequest.get('/sender-profiles').query(params).execute(),
  });
}

export function useSenderProfileQuery(profileId: string): UseQueryResult<SenderProfileResponse, ApiError> {
  return useQuery<SenderProfileResponse, ApiError>({
    queryKey: senderProfileKeys.detail(profileId),
    queryFn: () => APIRequest.get(`/sender-profiles/${profileId}`).execute(),
  });
}

export function useCreateSenderProfileMutation(): UseMutationResult<SenderProfileResponse, ApiError, CreateSenderProfileBody> {
  const queryClient = useQueryClient();
  return useMutation<SenderProfileResponse, ApiError, CreateSenderProfileBody>({
    mutationFn: data => APIRequest.post('/sender-profiles').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderProfileKeys.lists() }),
  });
}

export function useUpdateSenderProfileMutation(profileId: string): UseMutationResult<SenderProfileResponse, ApiError, UpdateSenderProfileBody> {
  const queryClient = useQueryClient();
  return useMutation<SenderProfileResponse, ApiError, UpdateSenderProfileBody>({
    mutationFn: data => APIRequest.patch(`/sender-profiles/${profileId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: senderProfileKeys.detail(profileId) });
      queryClient.invalidateQueries({ queryKey: senderProfileKeys.lists() });
    },
  });
}

export function useDeleteSenderProfileMutation(profileId: string): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<void, ApiError, void> = {
    mutationFn: () => APIRequest.delete(`/sender-profiles/${profileId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderProfileKeys.lists() }),
  };
  return useMutation(options);
}

export function useListSenderEndpointsQuery(profileId: string, params: ListSenderEndpointsQueryParams = {}): UseQueryResult<ListSenderEndpointResponse, ApiError> {
  return useQuery<ListSenderEndpointResponse, ApiError>({
    queryKey: senderProfileKeys.endpointList(profileId, params),
    queryFn: () => APIRequest.get(`/sender-profiles/${profileId}/endpoints`).query(params).execute(),
  });
}

export function useSenderEndpointQuery(profileId: string, endpointId: string): UseQueryResult<SenderEndpointResponse, ApiError> {
  return useQuery<SenderEndpointResponse, ApiError>({
    queryKey: senderProfileKeys.endpoint(profileId, endpointId),
    queryFn: () => APIRequest.get(`/sender-profiles/${profileId}/endpoints/${endpointId}`).execute(),
  });
}

export function useCreateSenderEndpointMutation(profileId: string): UseMutationResult<SenderEndpointResponse, ApiError, CreateSenderEndpointBody> {
  const queryClient = useQueryClient();
  return useMutation<SenderEndpointResponse, ApiError, CreateSenderEndpointBody>({
    mutationFn: data => APIRequest.post(`/sender-profiles/${profileId}/endpoints`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderProfileKeys.endpoints(profileId) }),
  });
}

export function useUpdateSenderEndpointMutation(profileId: string, endpointId: string): UseMutationResult<SenderEndpointResponse, ApiError, UpdateSenderEndpointBody> {
  const queryClient = useQueryClient();
  return useMutation<SenderEndpointResponse, ApiError, UpdateSenderEndpointBody>({
    mutationFn: data => APIRequest.patch(`/sender-profiles/${profileId}/endpoints/${endpointId}`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderProfileKeys.endpoints(profileId) }),
  });
}

export function useDeleteSenderEndpointMutation(profileId: string, endpointId: string): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<void, ApiError, void> = {
    mutationFn: () => APIRequest.delete(`/sender-profiles/${profileId}/endpoints/${endpointId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: senderProfileKeys.endpoints(profileId) }),
  };
  return useMutation(options);
}

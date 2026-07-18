/**
 * Importing npm packages
 */
import { type QueryKey, useMutation, type UseMutationOptions, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages
 */
import {
  type CreateTemplateGroupBody,
  type CreateTemplateVariantBody,
  type ListTemplateGroupResponse,
  type ListTemplateGroupsQueryParams,
  type ListTemplateVariantResponse,
  type ListTemplateVariantsQueryParams,
  type TemplateGroupResponse,
  type TemplateVariantResponse,
  type UpdateTemplateGroupBody,
  type UpdateTemplateVariantBody,
} from './api-types.gen';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const templateGroupKeys = {
  all: ['template-groups'],
  lists: () => [...templateGroupKeys.all, 'list'],
  list: (params?: ListTemplateGroupsQueryParams) => [...templateGroupKeys.lists(), params],
  detail: (groupId: string) => [...templateGroupKeys.all, groupId],
  variants: (groupId: string) => [...templateGroupKeys.all, groupId, 'variants'],
  variantList: (groupId: string, params?: ListTemplateVariantsQueryParams) => [...templateGroupKeys.variants(groupId), params],
  variant: (groupId: string, variantId: string) => [...templateGroupKeys.variants(groupId), variantId],
} as const;

export function getListTemplateGroupsQueryKey(params?: ListTemplateGroupsQueryParams): QueryKey {
  return params ? templateGroupKeys.list(params) : templateGroupKeys.lists();
}

export function useListTemplateGroupsQuery(params?: ListTemplateGroupsQueryParams): UseQueryResult<ListTemplateGroupResponse, ApiError> {
  return useQuery<ListTemplateGroupResponse, ApiError>({
    queryKey: templateGroupKeys.list(params),
    queryFn: ({ signal }) =>
      APIRequest.get('/api/v1/template-groups')
        .query(params ?? {})
        .signal(signal)
        .execute(),
  });
}

export function useCreateTemplateGroupMutation(): UseMutationResult<TemplateGroupResponse, ApiError, CreateTemplateGroupBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateGroupResponse, ApiError, CreateTemplateGroupBody>({
    mutationFn: data => APIRequest.post('/api/v1/template-groups').body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateGroupKeys.lists() });
    },
  });
}

export function useTemplateGroupQuery(groupId: string): UseQueryResult<TemplateGroupResponse, ApiError> {
  return useQuery<TemplateGroupResponse, ApiError>({
    queryKey: templateGroupKeys.detail(groupId),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/template-groups/${groupId}`).signal(signal).execute(),
  });
}

export function useListTemplateVariantsQuery(groupId: string, params: ListTemplateVariantsQueryParams = {}): UseQueryResult<ListTemplateVariantResponse, ApiError> {
  return useQuery<ListTemplateVariantResponse, ApiError>({
    queryKey: templateGroupKeys.variantList(groupId, params),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/template-groups/${groupId}/variants`).query(params).signal(signal).execute(),
  });
}

export function useUpdateTemplateGroupMutation(groupId: string): UseMutationResult<TemplateGroupResponse, ApiError, UpdateTemplateGroupBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateGroupResponse, ApiError, UpdateTemplateGroupBody>({
    mutationFn: data => APIRequest.patch(`/api/v1/template-groups/${groupId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateGroupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: templateGroupKeys.lists() });
    },
  });
}

export function useCreateTemplateVariantMutation(groupId: string): UseMutationResult<TemplateVariantResponse, ApiError, CreateTemplateVariantBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateVariantResponse, ApiError, CreateTemplateVariantBody>({
    mutationFn: data => APIRequest.post(`/api/v1/template-groups/${groupId}/variants`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateGroupKeys.variants(groupId) }),
  });
}

export function useTemplateVariantQuery(groupId: string, variantId: string): UseQueryResult<TemplateVariantResponse, ApiError> {
  return useQuery<TemplateVariantResponse, ApiError>({
    queryKey: templateGroupKeys.variant(groupId, variantId),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/template-groups/${groupId}/variants/${variantId}`).signal(signal).execute(),
  });
}

export function useDeleteTemplateVariantMutation(groupId: string, variantId: string): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<void, ApiError, void> = {
    mutationFn: () => APIRequest.delete(`/api/v1/template-groups/${groupId}/variants/${variantId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateGroupKeys.variants(groupId) }),
  };
  return useMutation(options);
}

export function useUpdateTemplateVariantMutation(groupId: string, variantId: string): UseMutationResult<TemplateVariantResponse, ApiError, UpdateTemplateVariantBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateVariantResponse, ApiError, UpdateTemplateVariantBody>({
    mutationFn: data => APIRequest.patch(`/api/v1/template-groups/${groupId}/variants/${variantId}`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateGroupKeys.variants(groupId) }),
  });
}

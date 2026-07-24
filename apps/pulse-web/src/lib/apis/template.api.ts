/**
 * Importing npm packages
 */
import { useMutation, type UseMutationOptions, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages
 */
import {
  type ChannelSettingResponse,
  type ContentResponse,
  type CreateTemplateBody,
  type DeleteContentVariables,
  type ListTemplateResponse,
  type ListTemplatesQueryParams,
  type ListVersionResponse,
  type PreviewBody,
  type PreviewResponse,
  type PublishVersionBody,
  type RollbackVersionBody,
  type TemplateDetailResponse,
  type TemplateResponse,
  type UpdateChannelSettingVariables,
  type UpdateTemplateBody,
  type UpsertContentBody,
  type VersionDetailResponse,
  type VersionResponse,
} from './studio.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const templateKeys = {
  all: ['templates'],
  lists: () => [...templateKeys.all, 'list'],
  list: (params?: ListTemplatesQueryParams) => [...templateKeys.lists(), params],
  detail: (templateId: string) => [...templateKeys.all, templateId],
  versions: (templateId: string) => [...templateKeys.all, templateId, 'versions'],
  version: (templateId: string, version: number) => [...templateKeys.versions(templateId), version],
} as const;

export function useListTemplatesQuery(params: ListTemplatesQueryParams = {}): UseQueryResult<ListTemplateResponse, ApiError> {
  return useQuery<ListTemplateResponse, ApiError>({
    queryKey: templateKeys.list(params),
    queryFn: ({ signal }) =>
      APIRequest.get('/api/v1/templates')
        .query(params as Record<string, string | number | boolean | undefined>)
        .signal(signal)
        .execute(),
  });
}

export function useTemplateQuery(templateId: string): UseQueryResult<TemplateDetailResponse, ApiError> {
  return useQuery<TemplateDetailResponse, ApiError>({
    queryKey: templateKeys.detail(templateId),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/templates/${templateId}`).signal(signal).execute(),
  });
}

export function useCreateTemplateMutation(): UseMutationResult<TemplateResponse, ApiError, CreateTemplateBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateResponse, ApiError, CreateTemplateBody>({
    mutationFn: data => APIRequest.post('/api/v1/templates').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.lists() }),
  });
}

export function useUpdateTemplateMutation(templateId: string): UseMutationResult<TemplateResponse, ApiError, UpdateTemplateBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateResponse, ApiError, UpdateTemplateBody>({
    mutationFn: data => APIRequest.patch(`/api/v1/templates/${templateId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

export function useUpdateChannelSettingMutation(templateId: string): UseMutationResult<ChannelSettingResponse, ApiError, UpdateChannelSettingVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChannelSettingResponse, ApiError, UpdateChannelSettingVariables>({
    mutationFn: ({ channel, isEnabled }) => APIRequest.put(`/api/v1/templates/${templateId}/channels/${channel}`).body({ isEnabled }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) }),
  });
}

export function useListVersionsQuery(templateId: string): UseQueryResult<ListVersionResponse, ApiError> {
  return useQuery<ListVersionResponse, ApiError>({
    queryKey: templateKeys.versions(templateId),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/templates/${templateId}/versions`).signal(signal).execute(),
  });
}

export function useVersionQuery(templateId: string, version: number | undefined): UseQueryResult<VersionDetailResponse, ApiError> {
  return useQuery<VersionDetailResponse, ApiError>({
    queryKey: templateKeys.version(templateId, version ?? 0),
    queryFn: ({ signal }) => APIRequest.get(`/api/v1/templates/${templateId}/versions/${version}`).signal(signal).execute(),
    enabled: version != null,
  });
}

export function useOpenDraftMutation(templateId: string): UseMutationResult<VersionResponse, ApiError, void> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<VersionResponse, ApiError, void> = {
    mutationFn: () => APIRequest.post(`/api/v1/templates/${templateId}/versions/draft`).body({}).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  };
  return useMutation(options);
}

export function useUpsertContentMutation(templateId: string): UseMutationResult<ContentResponse, ApiError, UpsertContentBody> {
  const queryClient = useQueryClient();
  return useMutation<ContentResponse, ApiError, UpsertContentBody>({
    mutationFn: data => APIRequest.put(`/api/v1/templates/${templateId}/versions/draft/contents`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  });
}

export function useDeleteContentMutation(templateId: string): UseMutationResult<void, ApiError, DeleteContentVariables> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<void, ApiError, DeleteContentVariables> = {
    mutationFn: ({ channel, locale }) => APIRequest.delete(`/api/v1/templates/${templateId}/versions/draft/contents/${channel}/${locale}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  };
  return useMutation(options);
}

export function usePublishDraftMutation(templateId: string): UseMutationResult<VersionResponse, ApiError, PublishVersionBody> {
  const queryClient = useQueryClient();
  return useMutation<VersionResponse, ApiError, PublishVersionBody>({
    mutationFn: data => APIRequest.post(`/api/v1/templates/${templateId}/versions/draft/publish`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) });
    },
  });
}

export function useRollbackVersionMutation(templateId: string): UseMutationResult<VersionResponse, ApiError, { version: number } & RollbackVersionBody> {
  const queryClient = useQueryClient();
  return useMutation<VersionResponse, ApiError, { version: number } & RollbackVersionBody>({
    mutationFn: ({ version, notes }) => APIRequest.post(`/api/v1/templates/${templateId}/versions/${version}/rollback`).body({ notes }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  });
}

export function usePreviewMutation(templateId: string): UseMutationResult<PreviewResponse, ApiError, PreviewBody> {
  return useMutation<PreviewResponse, ApiError, PreviewBody>({
    mutationFn: data => APIRequest.post(`/api/v1/templates/${templateId}/versions/preview`).body(data).execute(),
  });
}

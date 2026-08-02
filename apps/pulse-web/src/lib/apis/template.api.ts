/**
 * Importing npm packages
 */
import {
  queryOptions,
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { type ApiError, APIRequest } from './transport';

/**
 * Importing user defined packages
 */
import {
  type ChannelSettingResponse,
  type ContentResponse,
  type ListTemplatesQueryParams,
  type PreviewBody,
  type PreviewResponse,
  type PublishVersionBody,
  type UpsertContentBody,
  type VersionDetailResponse,
  type VersionResponse,
} from './api-types.gen';
import {
  type CreateTemplateBody,
  type DeleteContentVariables,
  type ListTemplateResponse,
  type ListVersionResponse,
  type RollbackVersionBody,
  type TemplateDetailResponse,
  type TemplateResponse,
  type UpdateChannelSettingVariables,
  type UpdateTemplateBody,
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
    queryFn: () =>
      APIRequest.get('/templates')
        .query(params as Record<string, string | number | boolean | undefined>)
        .execute(),
  });
}

/** Shared by the template detail route's loader prefetch and `useTemplateQuery`. */
export const templateQueryOptions = (templateId: string): UseQueryOptions<TemplateDetailResponse, ApiError> =>
  queryOptions<TemplateDetailResponse, ApiError>({
    queryKey: templateKeys.detail(templateId),
    queryFn: () => APIRequest.get(`/templates/${templateId}`).execute(),
  });

export function useTemplateQuery(templateId: string): UseQueryResult<TemplateDetailResponse, ApiError> {
  return useQuery(templateQueryOptions(templateId));
}

export function useCreateTemplateMutation(): UseMutationResult<TemplateResponse, ApiError, CreateTemplateBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateResponse, ApiError, CreateTemplateBody>({
    mutationFn: data => APIRequest.post('/templates').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.lists() }),
  });
}

export function useUpdateTemplateMutation(templateId: string): UseMutationResult<TemplateResponse, ApiError, UpdateTemplateBody> {
  const queryClient = useQueryClient();
  return useMutation<TemplateResponse, ApiError, UpdateTemplateBody>({
    mutationFn: data => APIRequest.patch(`/templates/${templateId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

export function useUpdateChannelSettingMutation(templateId: string): UseMutationResult<ChannelSettingResponse, ApiError, UpdateChannelSettingVariables> {
  const queryClient = useQueryClient();
  return useMutation<ChannelSettingResponse, ApiError, UpdateChannelSettingVariables>({
    mutationFn: ({ channel, isEnabled }) => APIRequest.put(`/templates/${templateId}/channels/${channel}`).body({ isEnabled }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) }),
  });
}

export function useListVersionsQuery(templateId: string): UseQueryResult<ListVersionResponse, ApiError> {
  return useQuery<ListVersionResponse, ApiError>({
    queryKey: templateKeys.versions(templateId),
    queryFn: () => APIRequest.get(`/templates/${templateId}/versions`).execute(),
  });
}

export function useVersionQuery(templateId: string, version: number | undefined): UseQueryResult<VersionDetailResponse, ApiError> {
  return useQuery<VersionDetailResponse, ApiError>({
    queryKey: templateKeys.version(templateId, version ?? 0),
    queryFn: () => APIRequest.get(`/templates/${templateId}/versions/${version}`).execute(),
    enabled: version != null,
  });
}

export function useOpenDraftMutation(templateId: string): UseMutationResult<VersionResponse, ApiError, void> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<VersionResponse, ApiError, void> = {
    mutationFn: () => APIRequest.post(`/templates/${templateId}/versions/draft`).body({}).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  };
  return useMutation(options);
}

export function useUpsertContentMutation(templateId: string): UseMutationResult<ContentResponse, ApiError, UpsertContentBody> {
  const queryClient = useQueryClient();
  return useMutation<ContentResponse, ApiError, UpsertContentBody>({
    mutationFn: data => APIRequest.put(`/templates/${templateId}/versions/draft/contents`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  });
}

export function useDeleteContentMutation(templateId: string): UseMutationResult<void, ApiError, DeleteContentVariables> {
  const queryClient = useQueryClient();
  const options: UseMutationOptions<void, ApiError, DeleteContentVariables> = {
    mutationFn: ({ channel, locale }) => APIRequest.delete(`/templates/${templateId}/versions/draft/contents/${channel}/${locale}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  };
  return useMutation(options);
}

export function usePublishDraftMutation(templateId: string): UseMutationResult<VersionResponse, ApiError, PublishVersionBody> {
  const queryClient = useQueryClient();
  return useMutation<VersionResponse, ApiError, PublishVersionBody>({
    mutationFn: data => APIRequest.post(`/templates/${templateId}/versions/draft/publish`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) });
    },
  });
}

export function useRollbackVersionMutation(templateId: string): UseMutationResult<VersionResponse, ApiError, { version: number } & RollbackVersionBody> {
  const queryClient = useQueryClient();
  return useMutation<VersionResponse, ApiError, { version: number } & RollbackVersionBody>({
    mutationFn: ({ version, notes }) => APIRequest.post(`/templates/${templateId}/versions/${version}/rollback`).body({ notes }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) }),
  });
}

export function usePreviewMutation(templateId: string): UseMutationResult<PreviewResponse, ApiError, PreviewBody> {
  return useMutation<PreviewResponse, ApiError, PreviewBody>({
    mutationFn: data => APIRequest.post(`/templates/${templateId}/versions/preview`).body(data).execute(),
  });
}

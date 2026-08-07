import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type ApplicationDetailResponse,
  type ApplicationListResponse,
  type ApplicationMemberItem,
  type ApplicationMemberListResponse,
  type ApplicationOrganisationItem,
  type ApplicationOrganisationListResponse,
  type ApplicationRoleItem,
  type ApplicationSummaryItem,
  type CreateApplicationBody,
  type CreateApplicationResponse,
  type ReleaseApplicationBody,
  type UpdateApplicationBody,
} from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type {
  ApplicationDetailResponse,
  ApplicationListResponse,
  ApplicationMemberItem,
  ApplicationMemberListResponse,
  ApplicationOrganisationItem,
  ApplicationOrganisationListResponse,
  ApplicationRoleItem,
  ApplicationSummaryItem,
  CreateApplicationBody,
  CreateApplicationResponse,
  ReleaseApplicationBody,
  UpdateApplicationBody,
};

/** An application's platform visibility: who could ever be granted it (D-A1). */
export type ApplicationVisibility = ApplicationDetailResponse['visibility'];

export const adminApplicationKeys = {
  all: ['admin', 'applications'] as const,
  list: () => [...adminApplicationKeys.all, 'list'] as const,
  detail: (id: string) => [...adminApplicationKeys.all, id] as const,
  members: (id: string) => [...adminApplicationKeys.all, id, 'members'] as const,
  organisations: (id: string) => [...adminApplicationKeys.all, id, 'organisations'] as const,
};

export const adminApplicationsQueryOptions = () =>
  queryOptions<ApplicationListResponse, ApiError>({
    queryKey: adminApplicationKeys.list(),
    queryFn: ({ signal }) => APIRequest.get('/admin/applications').signal(signal).execute<ApplicationListResponse>(),
  });

export function useApplicationsQuery(): UseQueryResult<ApplicationListResponse, ApiError> {
  return useQuery(adminApplicationsQueryOptions());
}

export const adminApplicationQueryOptions = (appId: string, enabled = true) =>
  queryOptions<ApplicationDetailResponse, ApiError>({
    queryKey: adminApplicationKeys.detail(appId),
    queryFn: ({ signal }) => APIRequest.get(`/admin/applications/${appId}`).signal(signal).execute<ApplicationDetailResponse>(),
    enabled: enabled && Boolean(appId),
  });

export function useApplicationQuery(appId: string, enabled = true): UseQueryResult<ApplicationDetailResponse, ApiError> {
  return useQuery(adminApplicationQueryOptions(appId, enabled));
}

export const adminApplicationMembersQueryOptions = (appId: string, enabled = true) =>
  queryOptions<ApplicationMemberListResponse, ApiError>({
    queryKey: adminApplicationKeys.members(appId),
    queryFn: ({ signal }) => APIRequest.get(`/admin/applications/${appId}/members`).signal(signal).execute<ApplicationMemberListResponse>(),
    enabled: enabled && Boolean(appId),
  });

export function useApplicationMembersQuery(appId: string, enabled = true): UseQueryResult<ApplicationMemberListResponse, ApiError> {
  return useQuery(adminApplicationMembersQueryOptions(appId, enabled));
}

export function useCreateApplicationMutation(): UseMutationResult<CreateApplicationResponse, ApiError, CreateApplicationBody> {
  const queryClient = useQueryClient();
  return useMutation<CreateApplicationResponse, ApiError, CreateApplicationBody>({
    mutationFn: body => APIRequest.post('/admin/applications').body(body).execute<CreateApplicationResponse>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() }),
  });
}

export function useUpdateApplicationMutation(): UseMutationResult<ApplicationDetailResponse, ApiError, { appId: string; body: UpdateApplicationBody }> {
  const queryClient = useQueryClient();
  return useMutation<ApplicationDetailResponse, ApiError, { appId: string; body: UpdateApplicationBody }>({
    mutationFn: input => APIRequest.patch(`/admin/applications/${input.appId}`).body(input.body).execute<ApplicationDetailResponse>(),
    onSuccess: (_data, { appId }) => {
      queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() });
      queryClient.invalidateQueries({ queryKey: adminApplicationKeys.detail(appId) });
    },
  });
}

export function useDeleteApplicationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: appId => APIRequest.delete(`/admin/applications/${appId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() }),
  });
}

export function useRemoveApplicationMemberMutation(): UseMutationResult<undefined, ApiError, { appId: string; userId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { appId: string; userId: string }>({
    mutationFn: input => APIRequest.delete(`/admin/applications/${input.appId}/members/${input.userId}`).execute<undefined>(),
    onSuccess: (_data, { appId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.members(appId) }),
  });
}

export const adminApplicationOrganisationsQueryOptions = (appId: string, enabled = true) =>
  queryOptions<ApplicationOrganisationListResponse, ApiError>({
    queryKey: adminApplicationKeys.organisations(appId),
    queryFn: ({ signal }) => APIRequest.get(`/admin/applications/${appId}/organisations`).signal(signal).execute<ApplicationOrganisationListResponse>(),
    enabled: enabled && Boolean(appId),
  });

export function useApplicationOrganisationsQuery(appId: string, enabled = true): UseQueryResult<ApplicationOrganisationListResponse, ApiError> {
  return useQuery(adminApplicationOrganisationsQueryOptions(appId, enabled));
}

export function useReleaseApplicationMutation(): UseMutationResult<undefined, ApiError, { appId: string; organisationId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { appId: string; organisationId: string }>({
    mutationFn: input => APIRequest.post(`/admin/applications/${input.appId}/organisations`).body({ organisationId: input.organisationId }).execute<undefined>(),
    onSuccess: (_data, { appId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.organisations(appId) }),
  });
}

export function useRevokeApplicationReleaseMutation(): UseMutationResult<undefined, ApiError, { appId: string; organisationId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { appId: string; organisationId: string }>({
    mutationFn: input => APIRequest.delete(`/admin/applications/${input.appId}/organisations/${input.organisationId}`).execute<undefined>(),
    onSuccess: (_data, { appId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.organisations(appId) }),
  });
}

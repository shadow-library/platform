/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import {
  type ApplicationDetailResponse,
  type ApplicationListResponse,
  type ApplicationMemberItem,
  type ApplicationMemberListResponse,
  type ApplicationRoleItem,
  type ApplicationSummaryItem,
  type CreateApplicationBody,
  type UpdateApplicationBody,
} from './api-types.gen';

/**
 * Defining types
 */

export type {
  ApplicationDetailResponse,
  ApplicationListResponse,
  ApplicationMemberItem,
  ApplicationMemberListResponse,
  ApplicationRoleItem,
  ApplicationSummaryItem,
  CreateApplicationBody,
  UpdateApplicationBody,
};

/**
 * Declaring the constants
 */
export const adminApplicationKeys = {
  all: ['admin', 'applications'] as const,
  list: () => [...adminApplicationKeys.all, 'list'] as const,
  detail: (id: string) => [...adminApplicationKeys.all, id] as const,
  members: (id: string) => [...adminApplicationKeys.all, id, 'members'] as const,
};

export function useApplicationsQuery(): UseQueryResult<ApplicationListResponse, ApiError> {
  return useQuery<ApplicationListResponse, ApiError>({ queryKey: adminApplicationKeys.list(), queryFn: () => APIRequest.get('/admin/applications').execute() });
}

export function useApplicationQuery(appId: string, enabled = true): UseQueryResult<ApplicationDetailResponse, ApiError> {
  return useQuery<ApplicationDetailResponse, ApiError>({
    queryKey: adminApplicationKeys.detail(appId),
    queryFn: () => APIRequest.get(`/admin/applications/${appId}`).execute(),
    enabled: enabled && Boolean(appId),
  });
}

export function useApplicationMembersQuery(appId: string, enabled = true): UseQueryResult<ApplicationMemberListResponse, ApiError> {
  return useQuery<ApplicationMemberListResponse, ApiError>({
    queryKey: adminApplicationKeys.members(appId),
    queryFn: () => APIRequest.get(`/admin/applications/${appId}/members`).execute(),
    enabled: enabled && Boolean(appId),
  });
}

export function useCreateApplicationMutation(): UseMutationResult<{ id: number }, ApiError, CreateApplicationBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: number }, ApiError, CreateApplicationBody>({
    mutationFn: body => APIRequest.post('/admin/applications').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() }),
  });
}

export function useUpdateApplicationMutation(): UseMutationResult<ApplicationDetailResponse, ApiError, { appId: string; body: UpdateApplicationBody }> {
  const queryClient = useQueryClient();
  return useMutation<ApplicationDetailResponse, ApiError, { appId: string; body: UpdateApplicationBody }>({
    mutationFn: ({ appId, body }) => APIRequest.patch(`/admin/applications/${appId}`).body(body).execute(),
    onSuccess: (_data, { appId }) => {
      queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() });
      queryClient.invalidateQueries({ queryKey: adminApplicationKeys.detail(appId) });
    },
  });
}

export function useDeleteApplicationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: appId => APIRequest.delete(`/admin/applications/${appId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() }),
  });
}

export function useRemoveApplicationMemberMutation(): UseMutationResult<undefined, ApiError, { appId: string; userId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { appId: string; userId: string }>({
    mutationFn: ({ appId, userId }) => APIRequest.delete(`/admin/applications/${appId}/members/${userId}`).execute(),
    onSuccess: (_data, { appId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.members(appId) }),
  });
}

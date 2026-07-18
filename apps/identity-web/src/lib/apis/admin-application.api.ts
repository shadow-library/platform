/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
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
import { serverFetch } from './server-fetch';

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

/* ---------- server functions ---------- */

const fetchApplications = createServerFn({ method: 'GET' }).handler(() => serverFetch<ApplicationListResponse>({ method: 'GET', path: '/admin/applications' }));
const fetchApplication = createServerFn({ method: 'GET' })
  .validator((appId: string) => appId)
  .handler(({ data }) => serverFetch<ApplicationDetailResponse>({ method: 'GET', path: `/admin/applications/${data}` }));
const fetchApplicationMembers = createServerFn({ method: 'GET' })
  .validator((appId: string) => appId)
  .handler(({ data }) => serverFetch<ApplicationMemberListResponse>({ method: 'GET', path: `/admin/applications/${data}/members` }));
const createApplication = createServerFn({ method: 'POST' })
  .validator((body: CreateApplicationBody) => body)
  .handler(({ data }) => serverFetch<{ id: number }>({ method: 'POST', path: '/admin/applications', body: data }));
const updateApplication = createServerFn({ method: 'POST' })
  .validator((input: { appId: string; body: UpdateApplicationBody }) => input)
  .handler(({ data }) => serverFetch<ApplicationDetailResponse>({ method: 'PATCH', path: `/admin/applications/${data.appId}`, body: data.body }));
const deleteApplication = createServerFn({ method: 'POST' })
  .validator((appId: string) => appId)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/admin/applications/${data}` }));
const removeApplicationMember = createServerFn({ method: 'POST' })
  .validator((input: { appId: string; userId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/admin/applications/${data.appId}/members/${data.userId}` }));

/* ---------- queries ---------- */

export const adminApplicationsQueryOptions = () =>
  queryOptions<ApplicationListResponse, ApiError>({ queryKey: adminApplicationKeys.list(), queryFn: () => call(fetchApplications()) });

export function useApplicationsQuery(): UseQueryResult<ApplicationListResponse, ApiError> {
  return useQuery(adminApplicationsQueryOptions());
}

export const adminApplicationQueryOptions = (appId: string, enabled = true) =>
  queryOptions<ApplicationDetailResponse, ApiError>({
    queryKey: adminApplicationKeys.detail(appId),
    queryFn: () => call(fetchApplication({ data: appId })),
    enabled: enabled && Boolean(appId),
  });

export function useApplicationQuery(appId: string, enabled = true): UseQueryResult<ApplicationDetailResponse, ApiError> {
  return useQuery(adminApplicationQueryOptions(appId, enabled));
}

export const adminApplicationMembersQueryOptions = (appId: string, enabled = true) =>
  queryOptions<ApplicationMemberListResponse, ApiError>({
    queryKey: adminApplicationKeys.members(appId),
    queryFn: () => call(fetchApplicationMembers({ data: appId })),
    enabled: enabled && Boolean(appId),
  });

export function useApplicationMembersQuery(appId: string, enabled = true): UseQueryResult<ApplicationMemberListResponse, ApiError> {
  return useQuery(adminApplicationMembersQueryOptions(appId, enabled));
}

/* ---------- mutations ---------- */

export function useCreateApplicationMutation(): UseMutationResult<{ id: number }, ApiError, CreateApplicationBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: number }, ApiError, CreateApplicationBody>({
    mutationFn: body => call(createApplication({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() }),
  });
}

export function useUpdateApplicationMutation(): UseMutationResult<ApplicationDetailResponse, ApiError, { appId: string; body: UpdateApplicationBody }> {
  const queryClient = useQueryClient();
  return useMutation<ApplicationDetailResponse, ApiError, { appId: string; body: UpdateApplicationBody }>({
    mutationFn: input => call(updateApplication({ data: input })),
    onSuccess: (_data, { appId }) => {
      queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() });
      queryClient.invalidateQueries({ queryKey: adminApplicationKeys.detail(appId) });
    },
  });
}

export function useDeleteApplicationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: appId => call(deleteApplication({ data: appId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.list() }),
  });
}

export function useRemoveApplicationMemberMutation(): UseMutationResult<undefined, ApiError, { appId: string; userId: string }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { appId: string; userId: string }>({
    mutationFn: input => call(removeApplicationMember({ data: input })),
    onSuccess: (_data, { appId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.members(appId) }),
  });
}

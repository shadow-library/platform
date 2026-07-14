/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type JsonValue } from '@/types';

import { type ApiError, call } from './api-request';
import {
  type UserAuditEventItem,
  type UserAuditEventsResponse,
  type UserContactItem,
  type UserDetailResponse,
  type UserMfaSummary,
  type UserSearchResponse,
  type UserSummaryItem,
} from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

export type { UserAuditEventItem, UserAuditEventsResponse, UserContactItem, UserDetailResponse, UserMfaSummary, UserSearchResponse, UserSummaryItem };
export type UserStatus = UserSummaryItem['status'];
export type LockMode = UserSummaryItem['lockMode'];

/** Query params for the admin user search (`GET /admin/users`). */
export interface UserSearchParams {
  email?: string;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

/** Combined client-side input for the lock action. */
export interface LockUserInput {
  userId: string;
  mode: 'OTP_ONLY' | 'FULL';
  until?: string;
}

/**
 * Declaring the constants
 */
export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  list: (params?: UserSearchParams) => [...adminUserKeys.all, 'list', params] as const,
  detail: (userId: string) => [...adminUserKeys.all, userId] as const,
  audit: (userId: string) => [...adminUserKeys.all, userId, 'audit'] as const,
};

/* ---------- server functions ---------- */

const fetchUsers = createServerFn({ method: 'GET' })
  .validator((params: UserSearchParams) => params)
  .handler(({ data }) => serverFetch<UserSearchResponse>({ method: 'GET', path: '/admin/users', query: data }));
const fetchUser = createServerFn({ method: 'GET' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<UserDetailResponse>({ method: 'GET', path: `/admin/users/${data}` }));
const fetchUserAudit = createServerFn({ method: 'GET' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<UserAuditEventsResponse>({ method: 'GET', path: `/admin/users/${data}/audit` }));

const lockUser = createServerFn({ method: 'POST' })
  .validator((input: LockUserInput) => input)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'POST', path: `/admin/users/${data.userId}/lock`, body: { mode: data.mode, until: data.until } }));
const unlockUser = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'POST', path: `/admin/users/${data}/unlock`, body: {} }));
const forcePasswordReset = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'POST', path: `/admin/users/${data}/force-password-reset`, body: {} }));
const terminateSessions = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'POST', path: `/admin/users/${data}/sessions/terminate`, body: {} }));
const deactivateUser = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'POST', path: `/admin/users/${data}/deactivate`, body: {} }));
const reactivateUser = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'POST', path: `/admin/users/${data}/reactivate`, body: {} }));
const deleteUser = createServerFn({ method: 'POST' })
  .validator((userId: string) => userId)
  .handler(({ data }) => serverFetch<JsonValue>({ method: 'DELETE', path: `/admin/users/${data}` }));

/* ---------- queries ---------- */

export const adminUsersQueryOptions = (params?: UserSearchParams) =>
  queryOptions<UserSearchResponse, ApiError>({
    queryKey: adminUserKeys.list(params),
    queryFn: () => call(fetchUsers({ data: params ?? {} })),
  });

export function useUsersQuery(params?: UserSearchParams): UseQueryResult<UserSearchResponse, ApiError> {
  return useQuery(adminUsersQueryOptions(params));
}

export const adminUserQueryOptions = (userId: string, enabled = true) =>
  queryOptions<UserDetailResponse, ApiError>({
    queryKey: adminUserKeys.detail(userId),
    queryFn: () => call(fetchUser({ data: userId })),
    enabled: enabled && Boolean(userId),
  });

export function useUserQuery(userId: string, enabled = true): UseQueryResult<UserDetailResponse, ApiError> {
  return useQuery(adminUserQueryOptions(userId, enabled));
}

export const adminUserAuditQueryOptions = (userId: string, enabled = true) =>
  queryOptions<UserAuditEventsResponse, ApiError>({
    queryKey: adminUserKeys.audit(userId),
    queryFn: () => call(fetchUserAudit({ data: userId })),
    enabled: enabled && Boolean(userId),
  });

export function useUserAuditQuery(userId: string, enabled = true): UseQueryResult<UserAuditEventsResponse, ApiError> {
  return useQuery(adminUserAuditQueryOptions(userId, enabled));
}

/* ---------- lifecycle mutations ---------- */

/** Refreshes both the searched list and the affected user's detail after a lifecycle action (AAL2). */
function useUserActionMutation<V extends { userId: string }>(action: (vars: V) => Promise<unknown>): UseMutationResult<unknown, ApiError, V> {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, V>({
    mutationFn: action,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(vars.userId) });
    },
  });
}

export function useLockUserMutation(): UseMutationResult<unknown, ApiError, LockUserInput> {
  return useUserActionMutation<LockUserInput>(input => call(lockUser({ data: input })));
}

export function useUnlockUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => call(unlockUser({ data: userId })));
}

export function useForcePasswordResetMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => call(forcePasswordReset({ data: userId })));
}

export function useTerminateUserSessionsMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => call(terminateSessions({ data: userId })));
}

export function useDeactivateUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => call(deactivateUser({ data: userId })));
}

export function useReactivateUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => call(reactivateUser({ data: userId })));
}

/** Right-to-erasure — scrubs PII/credentials, keeps the audit skeleton. */
export function useDeleteUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => call(deleteUser({ data: userId })));
}

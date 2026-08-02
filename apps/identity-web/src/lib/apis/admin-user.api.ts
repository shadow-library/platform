/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type JsonValue } from '@/types';

import {
  type UserAuditEventItem,
  type UserAuditEventsResponse,
  type UserContactItem,
  type UserDetailResponse,
  type UserMfaSummary,
  type UserSearchResponse,
  type UserSummaryItem,
} from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

/**
 * Defining types
 */

export type { UserAuditEventItem, UserAuditEventsResponse, UserContactItem, UserDetailResponse, UserMfaSummary, UserSearchResponse, UserSummaryItem };
export type UserStatus = UserSummaryItem['status'];
export type LockMode = UserSummaryItem['lockMode'];

/** Query params for the admin user search (`GET /admin/users`) — offset-based pagination. */
export interface UserSearchParams {
  email?: string;
  status?: UserStatus;
  offset?: number;
  limit?: number;
}

/** Combined client-side input for the lock action. */
export interface LockUserInput {
  userId: string;
  mode: 'OTP_ONLY' | 'FULL';
  until?: string;
}

/** A suspension is the only account hold that may lapse on its own, so it is the only one carrying `until`. */
export interface SuspendUserInput {
  userId: string;
  reason?: string;
  until?: string;
}

export interface BlockUserInput {
  userId: string;
  reason?: string;
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

/** ---------- queries ---------- */

export const adminUsersQueryOptions = (params?: UserSearchParams) =>
  queryOptions<UserSearchResponse, ApiError>({
    queryKey: adminUserKeys.list(params),
    queryFn: ({ signal }) => APIRequest.get('/admin/users').query(params).signal(signal).execute<UserSearchResponse>(),
  });

export function useUsersQuery(params?: UserSearchParams): UseQueryResult<UserSearchResponse, ApiError> {
  return useQuery(adminUsersQueryOptions(params));
}

export const adminUserQueryOptions = (userId: string, enabled = true) =>
  queryOptions<UserDetailResponse, ApiError>({
    queryKey: adminUserKeys.detail(userId),
    queryFn: ({ signal }) => APIRequest.get(`/admin/users/${userId}`).signal(signal).execute<UserDetailResponse>(),
    enabled: enabled && Boolean(userId),
  });

export function useUserQuery(userId: string, enabled = true): UseQueryResult<UserDetailResponse, ApiError> {
  return useQuery(adminUserQueryOptions(userId, enabled));
}

export const adminUserAuditQueryOptions = (userId: string, enabled = true) =>
  queryOptions<UserAuditEventsResponse, ApiError>({
    queryKey: adminUserKeys.audit(userId),
    queryFn: ({ signal }) => APIRequest.get(`/admin/users/${userId}/audit`).signal(signal).execute<UserAuditEventsResponse>(),
    enabled: enabled && Boolean(userId),
  });

export function useUserAuditQuery(userId: string, enabled = true): UseQueryResult<UserAuditEventsResponse, ApiError> {
  return useQuery(adminUserAuditQueryOptions(userId, enabled));
}

/** ---------- lifecycle mutations ---------- */

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
  return useUserActionMutation<LockUserInput>(input => APIRequest.post(`/admin/users/${input.userId}/lock`).body({ mode: input.mode, until: input.until }).execute<JsonValue>());
}

export function useUnlockUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/unlock`).body({}).execute<JsonValue>());
}

export function useForcePasswordResetMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/force-password-reset`).body({}).execute<JsonValue>());
}

export function useTerminateUserSessionsMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/sessions/terminate`).body({}).execute<JsonValue>());
}

export function useDeactivateUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/deactivate`).body({}).execute<JsonValue>());
}

export function useSuspendUserMutation(): UseMutationResult<unknown, ApiError, SuspendUserInput> {
  return useUserActionMutation(input => APIRequest.post(`/admin/users/${input.userId}/suspend`).body({ reason: input.reason, until: input.until }).execute<JsonValue>());
}

export function useBlockUserMutation(): UseMutationResult<unknown, ApiError, BlockUserInput> {
  return useUserActionMutation(input => APIRequest.post(`/admin/users/${input.userId}/block`).body({ reason: input.reason }).execute<JsonValue>());
}

export function useReactivateUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/reactivate`).body({}).execute<JsonValue>());
}

/** Right-to-erasure — scrubs PII/credentials, keeps the audit skeleton. */
export function useDeleteUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.delete(`/admin/users/${userId}`).execute<JsonValue>());
}

/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import {
  type UserAuditEventItem,
  type UserAuditEventsResponse,
  type UserContactItem,
  type UserDetailResponse,
  type UserMfaSummary,
  type UserSearchResponse,
  type UserSummaryItem,
} from './api-types.gen';

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

export function useUsersQuery(params?: UserSearchParams): UseQueryResult<UserSearchResponse, ApiError> {
  return useQuery<UserSearchResponse, ApiError>({
    queryKey: adminUserKeys.list(params),
    queryFn: () =>
      APIRequest.get('/admin/users')
        .query(params ?? {})
        .execute(),
  });
}

export function useUserQuery(userId: string, enabled = true): UseQueryResult<UserDetailResponse, ApiError> {
  return useQuery<UserDetailResponse, ApiError>({
    queryKey: adminUserKeys.detail(userId),
    queryFn: () => APIRequest.get(`/admin/users/${userId}`).execute(),
    enabled: enabled && Boolean(userId),
  });
}

export function useUserAuditQuery(userId: string, enabled = true): UseQueryResult<UserAuditEventsResponse, ApiError> {
  return useQuery<UserAuditEventsResponse, ApiError>({
    queryKey: adminUserKeys.audit(userId),
    queryFn: () => APIRequest.get(`/admin/users/${userId}/audit`).execute(),
    enabled: enabled && Boolean(userId),
  });
}

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
  return useUserActionMutation<LockUserInput>(({ userId, mode, until }) => APIRequest.post(`/admin/users/${userId}/lock`).body({ mode, until }).execute());
}

export function useUnlockUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/unlock`).body({}).execute());
}

export function useForcePasswordResetMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/force-password-reset`).body({}).execute());
}

export function useTerminateUserSessionsMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/sessions/terminate`).body({}).execute());
}

export function useDeactivateUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/deactivate`).body({}).execute());
}

export function useReactivateUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.post(`/admin/users/${userId}/reactivate`).body({}).execute());
}

/** Right-to-erasure — scrubs PII/credentials, keeps the audit skeleton. */
export function useDeleteUserMutation(): UseMutationResult<unknown, ApiError, { userId: string }> {
  return useUserActionMutation(({ userId }) => APIRequest.delete(`/admin/users/${userId}`).execute());
}

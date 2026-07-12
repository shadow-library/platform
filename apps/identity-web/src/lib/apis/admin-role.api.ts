/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { adminApplicationKeys } from './admin-application.api';
import { APIRequest, type ApiError } from './api-request';
import {
  type AssignmentListResponse,
  type CreatePermissionBody,
  type CreateRoleBody,
  type PermissionItem,
  type PermissionListResponse,
  type RoleAssignmentBody,
  type RoleAssignmentItem,
} from './api-types.gen';

/**
 * Defining types
 */

export type { AssignmentListResponse, CreatePermissionBody, CreateRoleBody, PermissionItem, PermissionListResponse, RoleAssignmentBody, RoleAssignmentItem };
export type PrincipalType = RoleAssignmentItem['principalType'];

export interface AssignmentListParams {
  principalType?: PrincipalType;
  principalId?: string;
  organisationId?: string;
  roleId?: number;
}

/**
 * Declaring the constants
 */
export const adminRoleKeys = {
  permissions: (applicationId: number) => ['admin', 'permissions', applicationId] as const,
  assignments: (params?: AssignmentListParams) => ['admin', 'role-assignments', params] as const,
};

export function usePermissionsQuery(applicationId: number, enabled = true): UseQueryResult<PermissionListResponse, ApiError> {
  return useQuery<PermissionListResponse, ApiError>({
    queryKey: adminRoleKeys.permissions(applicationId),
    queryFn: () => APIRequest.get('/admin/permissions').query({ applicationId }).execute(),
    enabled: enabled && Number.isFinite(applicationId),
  });
}

/** Roles are listed through their owning application (`GET /admin/applications/:id`); creating one refreshes it. */
export function useCreateRoleMutation(): UseMutationResult<{ id: number }, ApiError, CreateRoleBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: number }, ApiError, CreateRoleBody>({
    mutationFn: body => APIRequest.post('/admin/roles').body(body).execute(),
    onSuccess: (_data, { applicationId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.detail(String(applicationId)) }),
  });
}

export function useCreatePermissionMutation(): UseMutationResult<{ id: string }, ApiError, CreatePermissionBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, CreatePermissionBody>({
    mutationFn: body => APIRequest.post('/admin/permissions').body(body).execute(),
    onSuccess: (_data, { applicationId }) => queryClient.invalidateQueries({ queryKey: adminRoleKeys.permissions(applicationId) }),
  });
}

export function useGrantRolePermissionMutation(): UseMutationResult<undefined, ApiError, { roleId: number; permissionId: string }> {
  return useMutation<undefined, ApiError, { roleId: number; permissionId: string }>({
    mutationFn: ({ roleId, permissionId }) => APIRequest.post(`/admin/roles/${roleId}/permissions`).body({ permissionId }).execute(),
  });
}

export function useRevokeRolePermissionMutation(): UseMutationResult<undefined, ApiError, { roleId: number; permissionId: string }> {
  return useMutation<undefined, ApiError, { roleId: number; permissionId: string }>({
    mutationFn: ({ roleId, permissionId }) => APIRequest.delete(`/admin/roles/${roleId}/permissions/${permissionId}`).execute(),
  });
}

export function useRoleAssignmentsQuery(params?: AssignmentListParams): UseQueryResult<AssignmentListResponse, ApiError> {
  return useQuery<AssignmentListResponse, ApiError>({
    queryKey: adminRoleKeys.assignments(params),
    queryFn: () =>
      APIRequest.get('/admin/role-assignments')
        .query(params ?? {})
        .execute(),
  });
}

export function useCreateRoleAssignmentMutation(): UseMutationResult<undefined, ApiError, RoleAssignmentBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, RoleAssignmentBody>({
    mutationFn: body => APIRequest.post('/admin/role-assignments').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'role-assignments'] }),
  });
}

export function useRevokeRoleAssignmentMutation(): UseMutationResult<undefined, ApiError, RoleAssignmentBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, RoleAssignmentBody>({
    mutationFn: body => APIRequest.post('/admin/role-assignments/revoke').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'role-assignments'] }),
  });
}

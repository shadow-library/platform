/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { adminApplicationKeys } from './admin-application.api';
import { type ApiError, call } from './api-request';
import {
  type AssignmentListResponse,
  type CreatePermissionBody,
  type CreateRoleBody,
  type PermissionItem,
  type PermissionListResponse,
  type RoleAssignmentBody,
  type RoleAssignmentItem,
} from './api-types.gen';
import { serverFetch } from './server-fetch';

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

/* ---------- server functions ---------- */

const fetchPermissions = createServerFn({ method: 'GET' })
  .validator((applicationId: number) => applicationId)
  .handler(({ data }) => serverFetch<PermissionListResponse>({ method: 'GET', path: '/admin/permissions', query: { applicationId: data } }));
const createRole = createServerFn({ method: 'POST' })
  .validator((body: CreateRoleBody) => body)
  .handler(({ data }) => serverFetch<{ id: number }>({ method: 'POST', path: '/admin/roles', body: data }));
const createPermission = createServerFn({ method: 'POST' })
  .validator((body: CreatePermissionBody) => body)
  .handler(({ data }) => serverFetch<{ id: string }>({ method: 'POST', path: '/admin/permissions', body: data }));
const grantRolePermission = createServerFn({ method: 'POST' })
  .validator((input: { roleId: number; permissionId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: `/admin/roles/${data.roleId}/permissions`, body: { permissionId: data.permissionId } }));
const revokeRolePermission = createServerFn({ method: 'POST' })
  .validator((input: { roleId: number; permissionId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/admin/roles/${data.roleId}/permissions/${data.permissionId}` }));
const fetchRoleAssignments = createServerFn({ method: 'GET' })
  .validator((params: AssignmentListParams) => params)
  .handler(({ data }) => serverFetch<AssignmentListResponse>({ method: 'GET', path: '/admin/role-assignments', query: data }));
const createRoleAssignment = createServerFn({ method: 'POST' })
  .validator((body: RoleAssignmentBody) => body)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/admin/role-assignments', body: data }));
const revokeRoleAssignment = createServerFn({ method: 'POST' })
  .validator((body: RoleAssignmentBody) => body)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/admin/role-assignments/revoke', body: data }));

/* ---------- queries + mutations ---------- */

export const permissionsQueryOptions = (applicationId: number, enabled = true) =>
  queryOptions<PermissionListResponse, ApiError>({
    queryKey: adminRoleKeys.permissions(applicationId),
    queryFn: () => call(fetchPermissions({ data: applicationId })),
    enabled: enabled && Number.isFinite(applicationId),
  });

export function usePermissionsQuery(applicationId: number, enabled = true): UseQueryResult<PermissionListResponse, ApiError> {
  return useQuery(permissionsQueryOptions(applicationId, enabled));
}

/** Roles are listed through their owning application (`GET /admin/applications/:id`); creating one refreshes it. */
export function useCreateRoleMutation(): UseMutationResult<{ id: number }, ApiError, CreateRoleBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: number }, ApiError, CreateRoleBody>({
    mutationFn: body => call(createRole({ data: body })),
    onSuccess: (_data, { applicationId }) => queryClient.invalidateQueries({ queryKey: adminApplicationKeys.detail(String(applicationId)) }),
  });
}

export function useCreatePermissionMutation(): UseMutationResult<{ id: string }, ApiError, CreatePermissionBody> {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, ApiError, CreatePermissionBody>({
    mutationFn: body => call(createPermission({ data: body })),
    onSuccess: (_data, { applicationId }) => queryClient.invalidateQueries({ queryKey: adminRoleKeys.permissions(applicationId) }),
  });
}

export function useGrantRolePermissionMutation(): UseMutationResult<undefined, ApiError, { roleId: number; permissionId: string }> {
  return useMutation<undefined, ApiError, { roleId: number; permissionId: string }>({
    mutationFn: input => call(grantRolePermission({ data: input })),
  });
}

export function useRevokeRolePermissionMutation(): UseMutationResult<undefined, ApiError, { roleId: number; permissionId: string }> {
  return useMutation<undefined, ApiError, { roleId: number; permissionId: string }>({
    mutationFn: input => call(revokeRolePermission({ data: input })),
  });
}

export const roleAssignmentsQueryOptions = (params?: AssignmentListParams) =>
  queryOptions<AssignmentListResponse, ApiError>({
    queryKey: adminRoleKeys.assignments(params),
    queryFn: () => call(fetchRoleAssignments({ data: params ?? {} })),
  });

export function useRoleAssignmentsQuery(params?: AssignmentListParams): UseQueryResult<AssignmentListResponse, ApiError> {
  return useQuery(roleAssignmentsQueryOptions(params));
}

export function useCreateRoleAssignmentMutation(): UseMutationResult<undefined, ApiError, RoleAssignmentBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, RoleAssignmentBody>({
    mutationFn: body => call(createRoleAssignment({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'role-assignments'] }),
  });
}

export function useRevokeRoleAssignmentMutation(): UseMutationResult<undefined, ApiError, RoleAssignmentBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, RoleAssignmentBody>({
    mutationFn: body => call(revokeRoleAssignment({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'role-assignments'] }),
  });
}

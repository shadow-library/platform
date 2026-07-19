/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type AssignmentListResponse, type PermissionItem, type PermissionListResponse, type RoleAssignmentBody, type RoleAssignmentItem } from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

export type { AssignmentListResponse, PermissionItem, PermissionListResponse, RoleAssignmentBody, RoleAssignmentItem };
export type PrincipalType = RoleAssignmentItem['principalType'];

export interface AssignmentListParams {
  principalType?: PrincipalType;
  principalId?: string;
  organisationId?: string;
  roleId?: number;
}

/**
 * Declaring the constants
 *
 * Role and permission *definitions* are owned by each application and pushed declaratively through the
 * SDK's catalog sync (`PUT /api/v1/authz/catalog`); the console can only read them. What it still drives
 * is *assignment* — granting a defined role to a principal.
 */
export const adminRoleKeys = {
  permissions: (applicationId: number) => ['admin', 'permissions', applicationId] as const,
  assignments: (params?: AssignmentListParams) => ['admin', 'role-assignments', params] as const,
};

/* ---------- server functions ---------- */

const fetchPermissions = createServerFn({ method: 'GET' })
  .validator((applicationId: number) => applicationId)
  .handler(({ data }) => serverFetch<PermissionListResponse>({ method: 'GET', path: '/admin/permissions', query: { applicationId: data } }));
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

/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Query, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { PolicyDecisionService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { CreatedResponse } from './admin-client.dto';
import {
  ApplicationIdQuery,
  AssignmentListQuery,
  AssignmentListResponse,
  CreatePermissionBody,
  CreateRoleBody,
  GrantRolePermissionBody,
  PermissionListResponse,
  RoleAssignmentBody,
  RoleIdParams,
  RolePermissionParams,
} from './admin-role.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Role/permission administration is two-tier (T-601): `iam:roles:manage` operates anywhere while
 * `app:roles:manage` only reaches the application that owns the caller's permission. Cross-
 * application grants are structurally rejected — a role may only carry permissions owned by its
 * own application.
 */

@HttpController('/api/v1/admin')
export class AdminRoleController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {}

  private async requireRole(roleId: number): Promise<Application.Role> {
    const role = await this.applicationRoleService.getRole(roleId);
    if (!role) throw new ServerError(AppErrorCode.APP_003);
    return role;
  }

  private async record(actor: AdminActor, action: string, targetType: string, targetId: string, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({ action, outcome: 'SUCCESS', actorType: 'USER', actorId: actor.session.userId.toString(), targetType, targetId, detail: detail ?? null });
  }

  @Post('/roles')
  @RespondFor(201, CreatedResponse)
  async createRole(@Body() body: CreateRoleBody, @Req() request: FastifyRequest): Promise<CreatedResponse> {
    const actor = await this.access.requireRoleAdmin(request, body.applicationId);
    const application = this.applicationService.getApplicationByIdOrThrow(body.applicationId);
    const role = await this.applicationRoleService.addRole(application.name, { roleName: body.roleName, description: body.description });
    await this.record(actor, 'admin.role.created', 'application_role', String(role.id), { roleName: body.roleName, applicationId: body.applicationId });
    return { id: String(role.id) };
  }

  @Post('/permissions')
  @RespondFor(201, CreatedResponse)
  async createPermission(@Body() body: CreatePermissionBody, @Req() request: FastifyRequest): Promise<CreatedResponse> {
    const actor = await this.access.requireRoleAdmin(request, body.applicationId);
    this.applicationService.getApplicationByIdOrThrow(body.applicationId);
    const permissionId = await this.policyDecisionService.ensurePermission(body.applicationId, body.name, body.description);
    await this.record(actor, 'admin.permission.created', 'permission', permissionId, { name: body.name, applicationId: body.applicationId });
    return { id: permissionId };
  }

  @Get('/permissions')
  @RespondFor(200, PermissionListResponse)
  async listPermissions(@Query() query: ApplicationIdQuery, @Req() request: FastifyRequest): Promise<PermissionListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.rolesManage);
    const permissions = await this.policyDecisionService.listPermissionsForApplication(query.applicationId);
    return { items: permissions.map(permission => ({ id: permission.id, name: permission.name, description: permission.description ?? undefined })) };
  }

  @Post('/roles/:roleId/permissions')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async grantPermission(@Params() params: RoleIdParams, @Body() body: GrantRolePermissionBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const role = await this.requireRole(Number(params.roleId));
    const actor = await this.access.requireRoleAdmin(request, role.applicationId);

    const permission = await this.policyDecisionService.getPermission(body.permissionId);
    if (!permission) throw new ServerError(AppErrorCode.ADM_003);
    /** A role may only ever carry permissions its own application defines. */
    if (permission.applicationId !== role.applicationId) throw new ServerError(AppErrorCode.ADM_003);

    await this.policyDecisionService.grantPermissionToRole(role.id, body.permissionId);
    await this.record(actor, 'admin.role.permission_granted', 'application_role', String(role.id), { permissionId: body.permissionId, permission: permission.name });
    return { success: true };
  }

  @Delete('/roles/:roleId/permissions/:permissionId')
  @RespondFor(200, AdminActionResponse)
  async revokePermission(@Params() params: RolePermissionParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const role = await this.requireRole(Number(params.roleId));
    const actor = await this.access.requireRoleAdmin(request, role.applicationId);
    await this.policyDecisionService.revokePermissionFromRole(role.id, params.permissionId);
    await this.record(actor, 'admin.role.permission_revoked', 'application_role', String(role.id), { permissionId: params.permissionId });
    return { success: true };
  }

  @Post('/role-assignments')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async assign(@Body() body: RoleAssignmentBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const role = await this.requireRole(body.roleId);
    const actor = await this.access.requireRoleAdmin(request, role.applicationId);
    const principal = { type: body.principalType, id: body.principalId };
    await this.policyDecisionService.assignRole(principal, role.id, body.organisationId, actor.session.userId.toString());
    await this.record(actor, 'admin.role.assigned', 'role_assignment', `${body.principalType}:${body.principalId}`, { roleId: role.id, organisationId: body.organisationId });
    return { success: true };
  }

  @Post('/role-assignments/revoke')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async revoke(@Body() body: RoleAssignmentBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const role = await this.requireRole(body.roleId);
    const actor = await this.access.requireRoleAdmin(request, role.applicationId);
    const principal = { type: body.principalType, id: body.principalId };
    await this.policyDecisionService.revokeRole(principal, role.id, body.organisationId);
    await this.record(actor, 'admin.role.revoked', 'role_assignment', `${body.principalType}:${body.principalId}`, { roleId: role.id, organisationId: body.organisationId });
    return { success: true };
  }

  @Get('/role-assignments')
  @RespondFor(200, AssignmentListResponse)
  async listAssignments(@Query() query: AssignmentListQuery, @Req() request: FastifyRequest): Promise<AssignmentListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.rolesManage);
    const assignments = await this.policyDecisionService.listAssignments({
      principal: query.principalType && query.principalId ? { type: query.principalType, id: query.principalId } : undefined,
      organisationId: query.organisationId,
      roleId: query.roleId,
    });
    return {
      items: assignments.map(assignment => ({
        id: assignment.id,
        principalType: assignment.principalType,
        principalId: assignment.principalId,
        roleId: assignment.roleId,
        organisationId: assignment.organisationId.toString(),
        grantedBy: assignment.grantedBy ?? undefined,
        grantedAt: assignment.grantedAt.toISOString(),
      })),
    };
  }
}

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, HttpStatus, Post, Query, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { PolicyDecisionService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { ApplicationIdQuery, AssignmentListQuery, AssignmentListResponse, PermissionListResponse, RoleAssignmentBody } from './admin-role.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Role and permission *definitions* are owned by each application and pushed declaratively through
 * the SDK's catalog sync (`PUT /api/v1/authz/catalog`); admins no longer create them by hand. What
 * remains here is *assignment* — granting a defined role to a principal — which stays a deliberate
 * human decision, plus a read view of the catalog. `iam:roles:manage` operates anywhere while
 * `app:roles:manage` only reaches the application that owns the caller's permission.
 */

@HttpController('/api/v1/admin')
export class AdminRoleController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly applicationRoleService: ApplicationRoleService,
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

  @Get('/permissions')
  @RespondFor(200, PermissionListResponse)
  async listPermissions(@Query() query: ApplicationIdQuery, @Req() request: FastifyRequest): Promise<PermissionListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.rolesManage);
    const permissions = await this.policyDecisionService.listPermissionsForApplication(query.applicationId);
    return { items: permissions.map(permission => ({ id: permission.id, name: permission.name, description: permission.description ?? undefined })) };
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

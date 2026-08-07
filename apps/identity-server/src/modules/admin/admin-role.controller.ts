import { Body, Get, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { PolicyDecisionService, type Principal } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { ApplicationIdQuery, AssignmentListQuery, AssignmentListResponse, PermissionListResponse, RoleAssignmentBody } from './admin-role.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

@HttpController('/api/v1/admin')
export class AdminRoleController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly organisationService: OrganisationService,
    private readonly auditService: AuditService,
  ) {}

  private async findRoleOrThrow(roleId: number): Promise<Application.Role> {
    const role = await this.applicationRoleService.getRole(roleId);
    if (!role) throw AppErrorCode.APP_003.create();
    return role;
  }

  /** Organisation-grant scope is derived from the principal, never trusted from the request; revocation skips liveness so suspended-org grants remain removable. */
  private async resolveAssignment(body: RoleAssignmentBody, validate: boolean): Promise<{ principal: Principal; organisationId: string }> {
    if (body.principalType !== 'ORGANISATION') return { principal: { type: body.principalType, id: body.principalId }, organisationId: body.organisationId };
    if (validate) await this.organisationService.assertActiveTeam(body.principalId);
    return { principal: { type: 'ORGANISATION', id: body.principalId }, organisationId: body.principalId };
  }

  private async record(actor: AdminActor, action: string, targetType: string, targetId: string, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({ action, outcome: 'SUCCESS', actorType: 'USER', actorId: actor.session.userId.toString(), targetType, targetId, detail: detail ?? null });
  }

  @Get('/permissions')
  @Auth({ permission: ADMIN_PERMISSIONS.rolesManage })
  @RespondFor(200, PermissionListResponse)
  async listApplicationPermissions(@Query() query: ApplicationIdQuery): Promise<PermissionListResponse> {
    const permissions = await this.policyDecisionService.listPermissionsForApplication(query.applicationId);
    return { items: permissions.map(permission => ({ id: permission.id, name: permission.name, description: permission.description ?? undefined })) };
  }

  @Post('/role-assignments')
  @Auth({ elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async assignRole(@Body() body: RoleAssignmentBody): Promise<AdminActionResponse> {
    const role = await this.findRoleOrThrow(body.roleId);
    const actor = await this.access.requireRoleAdmin(Context.getSession(), role.applicationId);
    const { principal, organisationId } = await this.resolveAssignment(body, true);
    await this.policyDecisionService.assignRole(principal, role.id, organisationId, actor.session.userId.toString());
    await this.record(actor, 'admin.role.assigned', 'role_assignment', `${principal.type}:${principal.id}`, { roleId: role.id, organisationId });
    return { success: true };
  }

  @Post('/role-assignments/revoke')
  @Auth({ elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async revokeRoleAssignment(@Body() body: RoleAssignmentBody): Promise<AdminActionResponse> {
    const role = await this.findRoleOrThrow(body.roleId);
    const actor = await this.access.requireRoleAdmin(Context.getSession(), role.applicationId);
    const { principal, organisationId } = await this.resolveAssignment(body, false);
    await this.policyDecisionService.revokeRole(principal, role.id, organisationId);
    await this.record(actor, 'admin.role.revoked', 'role_assignment', `${principal.type}:${principal.id}`, { roleId: role.id, organisationId });
    return { success: true };
  }

  @Get('/role-assignments')
  @Auth({ permission: ADMIN_PERMISSIONS.rolesManage })
  @RespondFor(200, AssignmentListResponse)
  async listRoleAssignments(@Query() query: AssignmentListQuery): Promise<AssignmentListResponse> {
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

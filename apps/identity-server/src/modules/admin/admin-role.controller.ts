import { Body, Get, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { isNumericId } from '@server/constants';
import { Auth, Context } from '@server/modules/access';
import { PolicyDecisionService, type Principal } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationRoleService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor, AdminScope } from './admin-access.service';
import { ApplicationIdQuery, AssignmentListQuery, AssignmentListResponse, PermissionListResponse, RoleAssignmentBody } from './admin-role.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

@HttpController('/api/v1/admin')
export class AdminRoleController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly applicationAccess: ApplicationAccessService,
    private readonly organisationService: OrganisationService,
    private readonly auditService: AuditService,
  ) {}

  private async findRoleOrThrow(roleId: number): Promise<Application.Role> {
    const role = await this.applicationRoleService.getRole(roleId);
    if (!role) throw AppErrorCode.APP_003.create();
    return role;
  }

  /** An organisation grant's scope is derived from the principal; a user/service grant's is caller-supplied and validated at write time, never trusted. */
  private resolveAssignment(body: RoleAssignmentBody): { principal: Principal; organisationId: string } {
    if (body.principalType === 'ORGANISATION') return { principal: { type: 'ORGANISATION', id: body.principalId }, organisationId: body.principalId };
    return { principal: { type: body.principalType, id: body.principalId }, organisationId: body.organisationId };
  }

  /**
   * The base rule — an org-wide grant targets an active team organisation — holds for every caller. The stronger tenant
   * checks (the role's application entitled in the target, and for a user their membership of it) close HIGH-001 for the
   * lower-trust app-scoped tier: without them an app admin could plant its application's role onto any principal in any
   * organisation. A platform `iam:roles:manage` admin is already trusted across every tenant, so it keeps unrestricted reach.
   */
  private async assertAssignable(role: Application.Role, principal: Principal, organisationId: string, scope: AdminScope): Promise<void> {
    if (principal.type === 'ORGANISATION') {
      const organisation = await this.organisationService.assertActiveTeam(organisationId);
      if (scope === 'application') await this.assertApplicationEntitled(role.applicationId, organisation.id);
      return;
    }
    if (scope !== 'application') return;
    const organisation = await this.organisationService.assertActiveOrganisation(organisationId);
    await this.assertApplicationEntitled(role.applicationId, organisation.id);
    if (principal.type === 'USER') await this.organisationService.assertMember(this.parseUserId(principal.id), organisation.id);
  }

  /** Revocation deliberately skips organisation liveness so a suspended-org grant stays removable; the app-scoped tier still may not touch a tenant its application is not entitled in, so a cross-tenant app admin cannot tamper (HIGH-001). The platform tier is unrestricted, mirroring assignment. */
  private async assertRevocable(role: Application.Role, organisationId: string, scope: AdminScope): Promise<void> {
    if (scope !== 'application') return;
    await this.assertApplicationEntitled(role.applicationId, this.parseOrganisationId(organisationId), AppErrorCode.ORG_011_REVOKE);
  }

  private async assertApplicationEntitled(applicationId: number, organisationId: bigint, error: AppErrorCode = AppErrorCode.ORG_011): Promise<void> {
    const entitled = await this.applicationAccess.listOrganisationApplicationIds(organisationId);
    if (!entitled.has(applicationId)) throw error.create();
  }

  private parseOrganisationId(organisationId: string): bigint {
    if (!isNumericId(organisationId)) throw AppErrorCode.ORG_002.create();
    return BigInt(organisationId);
  }

  private parseUserId(userId: string): bigint {
    if (!isNumericId(userId)) throw AppErrorCode.ORG_001.create();
    return BigInt(userId);
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
    const { principal, organisationId } = this.resolveAssignment(body);
    await this.assertAssignable(role, principal, organisationId, actor.scope);
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
    const { principal, organisationId } = this.resolveAssignment(body);
    await this.assertRevocable(role, organisationId, actor.scope);
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

import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { DatabaseService, Permission, PrimaryDatabase, RoleAssignment, schema } from '@server/modules/infrastructure/datastore';

export interface Principal {
  type: RoleAssignment.PrincipalType;
  id: string;
}

export interface CheckRequest {
  principal: Principal;
  organisationId: string;
  action: string;
}

export interface AssignmentFilter {
  principal?: Principal;
  organisationId?: string;
  roleId?: number;
}

export interface Decision {
  decision: 'PERMIT' | 'DENY';
  reasons: string[];
  authzVersion: number;
}

@Injectable()
export class PolicyDecisionService {
  private readonly logger = Logger.getLogger(APP_NAME, PolicyDecisionService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  private versionKey(principal: Principal): string {
    /**
     * An ORGANISATION grant's invalidation lives on the per-org component every member's decision
     * folds in — never a principal key nothing reads — so one org-wide change converges all members
     * without enumerating them (T-904).
     */
    return principal.type === 'ORGANISATION' ? this.orgVersionKey(principal.id) : `authz_version:${principal.type}:${principal.id}`;
  }

  private orgVersionKey(organisationId: string): string {
    return `authz_version:org:${organisationId}`;
  }

  async getAuthzVersion(principal: Principal): Promise<number> {
    const value = await this.redis.get(this.versionKey(principal));
    return value ? Number(value) : 0;
  }

  private async getOrgVersion(organisationId: string): Promise<number> {
    const value = await this.redis.get(this.orgVersionKey(organisationId));
    return value ? Number(value) : 0;
  }

  private async resolveAuthzVersion(principal: Principal, organisationId: string): Promise<number> {
    const [principalVersion, orgVersion] = await Promise.all([this.getAuthzVersion(principal), this.getOrgVersion(organisationId)]);
    return principalVersion + orgVersion;
  }

  private async bumpAuthzVersion(principal: Principal): Promise<void> {
    const version = await this.redis.incr(this.versionKey(principal));
    this.logger.debug('bumped authz version, cached decisions invalidated', { principal, version });
  }

  async invalidatePrincipal(principal: Principal): Promise<void> {
    await this.bumpAuthzVersion(principal);
  }

  async check(request: CheckRequest): Promise<Decision> {
    const authzVersion = await this.resolveAuthzVersion(request.principal, request.organisationId);
    const permissions = await this.resolvePermissions(request.principal, request.organisationId);
    const decision: Decision = permissions.has(request.action)
      ? { decision: 'PERMIT', reasons: [`granted by role permission '${request.action}'`], authzVersion }
      : { decision: 'DENY', reasons: ['no assigned role grants this permission'], authzVersion };
    this.logger.debug('policy decision resolved', {
      principal: request.principal,
      organisationId: request.organisationId,
      action: request.action,
      decision: decision.decision,
      authzVersion,
    });
    return decision;
  }

  async listPermissions(principal: Principal, organisationId: string): Promise<Set<string>> {
    return this.resolvePermissions(principal, organisationId);
  }

  async checkForApplication(request: CheckRequest, applicationId: number): Promise<Decision> {
    const authzVersion = await this.resolveAuthzVersion(request.principal, request.organisationId);
    const permissions = await this.resolvePermissions(request.principal, request.organisationId, applicationId);
    const decision: Decision = permissions.has(request.action)
      ? { decision: 'PERMIT', reasons: [`granted by application-scoped role permission '${request.action}'`], authzVersion }
      : { decision: 'DENY', reasons: ['no assigned role grants this permission for the application'], authzVersion };
    this.logger.debug('application-scoped policy decision resolved', {
      principal: request.principal,
      organisationId: request.organisationId,
      applicationId,
      action: request.action,
      decision: decision.decision,
      authzVersion,
    });
    return decision;
  }

  private async resolvePermissions(principal: Principal, organisationId: string, applicationId?: number): Promise<Set<string>> {
    const roleIds = await this.resolveRoleIds(principal, organisationId, applicationId);
    if (roleIds.size === 0) {
      this.logger.debug('principal resolves no roles in organisation', { principal, organisationId, applicationId });
      return new Set();
    }

    const ids = [...roleIds];
    const scope =
      applicationId === undefined
        ? inArray(schema.rolePermissions.roleId, ids)
        : and(inArray(schema.rolePermissions.roleId, ids), eq(schema.permissions.applicationId, applicationId));
    const rows = await this.db
      .select({ name: schema.permissions.name })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(scope);
    const permissions = new Set(rows.map(row => row.name));
    this.logger.debug('resolved principal permissions', { principal, organisationId, applicationId, roleIds: ids, permissions: [...permissions] });
    return permissions;
  }

  private async resolveRoleIds(principal: Principal, organisationId: string, applicationId?: number): Promise<Set<number>> {
    const orgId = BigInt(organisationId);
    const notExpired = or(isNull(schema.roleAssignments.expiresAt), gt(schema.roleAssignments.expiresAt, new Date()));
    const roleIds = new Set<number>();

    const explicit = await this.db
      .select({ roleId: schema.roleAssignments.roleId })
      .from(schema.roleAssignments)
      .where(
        and(
          eq(schema.roleAssignments.principalType, principal.type),
          eq(schema.roleAssignments.principalId, principal.id),
          eq(schema.roleAssignments.organisationId, orgId),
          notExpired,
        ),
      );
    for (const row of explicit) roleIds.add(row.roleId);

    if (principal.type !== 'USER') return roleIds;

    if (await this.isActiveMember(principal.id, orgId)) {
      const orgWide = await this.db
        .select({ roleId: schema.roleAssignments.roleId })
        .from(schema.roleAssignments)
        .where(
          and(
            eq(schema.roleAssignments.principalType, 'ORGANISATION'),
            eq(schema.roleAssignments.principalId, organisationId),
            eq(schema.roleAssignments.organisationId, orgId),
            notExpired,
          ),
        );
      for (const row of orgWide) roleIds.add(row.roleId);
    }

    for (const id of await this.defaultRoleIds(applicationId)) roleIds.add(id);
    return roleIds;
  }

  private async isActiveMember(userId: string, organisationId: bigint): Promise<boolean> {
    if (!/^\d+$/.test(userId)) return false;
    const membership = await this.db.query.organisationMembers.findFirst({
      where: and(eq(schema.organisationMembers.userId, BigInt(userId)), eq(schema.organisationMembers.organisationId, organisationId)),
      with: { organisation: true },
    });
    if (!membership || membership.organisation.status !== 'ACTIVE') return false;
    if (membership.status === 'ACTIVE') return true;
    return membership.status === 'SUSPENDED' && membership.statusUntil !== null && membership.statusUntil.getTime() <= Date.now();
  }

  private async defaultRoleIds(applicationId?: number): Promise<number[]> {
    const scope =
      applicationId === undefined
        ? eq(schema.applicationRoles.isDefault, true)
        : and(eq(schema.applicationRoles.isDefault, true), eq(schema.applicationRoles.applicationId, applicationId));
    const rows = await this.db.select({ id: schema.applicationRoles.id }).from(schema.applicationRoles).where(scope);
    return rows.map(row => row.id);
  }

  async createPermission(applicationId: number, name: string, description?: string): Promise<string> {
    const [permission] = await this.db.insert(schema.permissions).values({ applicationId, name, description }).returning({ id: schema.permissions.id });
    if (!permission) {
      this.logger.error('failed to create permission', { applicationId, name });
      throw AppError.internal('Failed to create permission');
    }
    this.logger.debug('created permission', { permissionId: permission.id, applicationId, name });
    return permission.id;
  }

  async ensurePermission(applicationId: number, name: string, description?: string): Promise<string> {
    await this.db.insert(schema.permissions).values({ applicationId, name, description }).onConflictDoNothing();
    const permission = await this.db.query.permissions.findFirst({ where: and(eq(schema.permissions.applicationId, applicationId), eq(schema.permissions.name, name)) });
    if (!permission) {
      this.logger.error('failed to provision permission', { applicationId, name });
      throw AppError.internal(`Permission '${name}' could not be provisioned`);
    }
    return permission.id;
  }

  async getPermission(permissionId: string): Promise<Permission | null> {
    const permission = await this.db.query.permissions.findFirst({ where: eq(schema.permissions.id, permissionId) });
    return permission ?? null;
  }

  async listPermissionsForApplication(applicationId: number): Promise<Permission[]> {
    return this.db.query.permissions.findMany({ where: eq(schema.permissions.applicationId, applicationId) });
  }

  async grantPermissionToRole(roleId: number, permissionId: string): Promise<void> {
    await this.db.insert(schema.rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
    this.logger.debug('granted permission to role', { roleId, permissionId });
  }

  async revokePermissionFromRole(roleId: number, permissionId: string): Promise<void> {
    await this.db.delete(schema.rolePermissions).where(and(eq(schema.rolePermissions.roleId, roleId), eq(schema.rolePermissions.permissionId, permissionId)));
    this.logger.debug('revoked permission from role', { roleId, permissionId });
  }

  async listAssignments(filter: AssignmentFilter): Promise<RoleAssignment[]> {
    const conditions = [
      filter.principal ? eq(schema.roleAssignments.principalType, filter.principal.type) : undefined,
      filter.principal ? eq(schema.roleAssignments.principalId, filter.principal.id) : undefined,
      filter.organisationId ? eq(schema.roleAssignments.organisationId, BigInt(filter.organisationId)) : undefined,
      filter.roleId !== undefined ? eq(schema.roleAssignments.roleId, filter.roleId) : undefined,
    ].filter(condition => condition !== undefined);
    return this.db.query.roleAssignments.findMany({ where: and(...conditions) });
  }

  async assignRole(principal: Principal, roleId: number, organisationId: string, grantedBy?: string): Promise<void> {
    await this.db
      .insert(schema.roleAssignments)
      .values({ principalType: principal.type, principalId: principal.id, roleId, organisationId: BigInt(organisationId), grantedBy })
      .onConflictDoNothing();
    await this.bumpAuthzVersion(principal);
    this.logger.info('assigned role', { principal, roleId, organisationId, grantedBy });
  }

  async revokeRole(principal: Principal, roleId: number, organisationId: string): Promise<void> {
    await this.db
      .delete(schema.roleAssignments)
      .where(
        and(
          eq(schema.roleAssignments.principalType, principal.type),
          eq(schema.roleAssignments.principalId, principal.id),
          eq(schema.roleAssignments.roleId, roleId),
          eq(schema.roleAssignments.organisationId, BigInt(organisationId)),
        ),
      );
    await this.bumpAuthzVersion(principal);
    this.logger.info('revoked role', { principal, roleId, organisationId });
  }

  async revokeAllForPrincipalInOrganisation(principal: Principal, organisationId: string): Promise<void> {
    await this.db
      .delete(schema.roleAssignments)
      .where(
        and(
          eq(schema.roleAssignments.principalType, principal.type),
          eq(schema.roleAssignments.principalId, principal.id),
          eq(schema.roleAssignments.organisationId, BigInt(organisationId)),
        ),
      );
    await this.bumpAuthzVersion(principal);
    this.logger.info('revoked all roles for principal in organisation', { principal, organisationId });
  }

  async revokeAllForOrganisation(organisationId: string): Promise<void> {
    const removed = await this.db
      .delete(schema.roleAssignments)
      .where(eq(schema.roleAssignments.organisationId, BigInt(organisationId)))
      .returning({ principalType: schema.roleAssignments.principalType, principalId: schema.roleAssignments.principalId });
    const principals = new Map(removed.map(row => [`${row.principalType}:${row.principalId}`, { type: row.principalType, id: row.principalId }]));
    for (const principal of principals.values()) await this.bumpAuthzVersion(principal);
    this.logger.info('revoked all role assignments for organisation', { organisationId, removedCount: removed.length, affectedPrincipals: principals.size });
  }
}

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, Permission, PrimaryDatabase, RoleAssignment, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

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

/**
 * Declaring the constants
 *
 * Central RBAC policy decision point (D-3): access tokens carry no permissions; enforcement points
 * resolve decisions here. `authz_version` bumps on any grant change so cached decisions are
 * discarded on mismatch.
 */

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
    return `authz_version:${principal.type}:${principal.id}`;
  }

  async getAuthzVersion(principal: Principal): Promise<number> {
    const value = await this.redis.get(this.versionKey(principal));
    return value ? Number(value) : 0;
  }

  private async bumpAuthzVersion(principal: Principal): Promise<void> {
    await this.redis.incr(this.versionKey(principal));
  }

  /** Resolves a permission decision: deny by default; a matching permission on any assigned role permits. */
  async check(request: CheckRequest): Promise<Decision> {
    const authzVersion = await this.getAuthzVersion(request.principal);
    const permissions = await this.resolvePermissions(request.principal, request.organisationId);
    if (permissions.has(request.action)) return { decision: 'PERMIT', reasons: [`granted by role permission '${request.action}'`], authzVersion };
    return { decision: 'DENY', reasons: ['no assigned role grants this permission'], authzVersion };
  }

  /**
   * Like `check`, but only permissions owned by the given application count. Permission names are
   * unique per application, not globally, so an application-scoped admin permission (for example
   * `app:roles:manage`) must never leak across applications that happen to reuse the name.
   */
  async checkForApplication(request: CheckRequest, applicationId: number): Promise<Decision> {
    const authzVersion = await this.getAuthzVersion(request.principal);
    const permissions = await this.resolvePermissions(request.principal, request.organisationId, applicationId);
    if (permissions.has(request.action)) return { decision: 'PERMIT', reasons: [`granted by application-scoped role permission '${request.action}'`], authzVersion };
    return { decision: 'DENY', reasons: ['no assigned role grants this permission for the application'], authzVersion };
  }

  private async resolvePermissions(principal: Principal, organisationId: string, applicationId?: number): Promise<Set<string>> {
    const assignments = await this.db
      .select({ roleId: schema.roleAssignments.roleId })
      .from(schema.roleAssignments)
      .where(
        and(
          eq(schema.roleAssignments.principalType, principal.type),
          eq(schema.roleAssignments.principalId, principal.id),
          eq(schema.roleAssignments.organisationId, BigInt(organisationId)),
          or(isNull(schema.roleAssignments.expiresAt), gt(schema.roleAssignments.expiresAt, new Date())),
        ),
      );
    const roleIds = assignments.map(assignment => assignment.roleId);
    if (roleIds.length === 0) return new Set();

    const scope =
      applicationId === undefined
        ? inArray(schema.rolePermissions.roleId, roleIds)
        : and(inArray(schema.rolePermissions.roleId, roleIds), eq(schema.permissions.applicationId, applicationId));
    const rows = await this.db
      .select({ name: schema.permissions.name })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(scope);
    return new Set(rows.map(row => row.name));
  }

  async createPermission(applicationId: number, name: string, description?: string): Promise<string> {
    const [permission] = await this.db.insert(schema.permissions).values({ applicationId, name, description }).returning({ id: schema.permissions.id });
    if (!permission) throw new Error('Failed to create permission');
    return permission.id;
  }

  /** Idempotent variant of `createPermission` for boot-time seeding: tolerates an existing row. */
  async ensurePermission(applicationId: number, name: string, description?: string): Promise<string> {
    await this.db.insert(schema.permissions).values({ applicationId, name, description }).onConflictDoNothing();
    const permission = await this.db.query.permissions.findFirst({ where: and(eq(schema.permissions.applicationId, applicationId), eq(schema.permissions.name, name)) });
    if (!permission) throw new Error(`Permission '${name}' could not be provisioned`);
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
  }

  async revokePermissionFromRole(roleId: number, permissionId: string): Promise<void> {
    await this.db.delete(schema.rolePermissions).where(and(eq(schema.rolePermissions.roleId, roleId), eq(schema.rolePermissions.permissionId, permissionId)));
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
    this.logger.info('Assigned role', { principal, roleId, organisationId });
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
  }

  /** Clears every product-role grant a principal holds in the organisation; used when membership ends. */
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
  }

  /** Clears every grant scoped to the organisation (org deletion); bumps each affected principal. */
  async revokeAllForOrganisation(organisationId: string): Promise<void> {
    const removed = await this.db
      .delete(schema.roleAssignments)
      .where(eq(schema.roleAssignments.organisationId, BigInt(organisationId)))
      .returning({ principalType: schema.roleAssignments.principalType, principalId: schema.roleAssignments.principalId });
    const principals = new Map(removed.map(row => [`${row.principalType}:${row.principalId}`, { type: row.principalType, id: row.principalId }]));
    for (const principal of principals.values()) await this.bumpAuthzVersion(principal);
  }
}

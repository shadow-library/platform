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
import { DatabaseService, PrimaryDatabase, RoleAssignment, schema } from '@server/modules/infrastructure/datastore';

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

  private async resolvePermissions(principal: Principal, organisationId: string): Promise<Set<string>> {
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

    const rows = await this.db
      .select({ name: schema.permissions.name })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(inArray(schema.rolePermissions.roleId, roleIds));
    return new Set(rows.map(row => row.name));
  }

  async createPermission(applicationId: number, name: string, description?: string): Promise<string> {
    const [permission] = await this.db.insert(schema.permissions).values({ applicationId, name, description }).returning({ id: schema.permissions.id });
    if (!permission) throw new Error('Failed to create permission');
    return permission.id;
  }

  async grantPermissionToRole(roleId: number, permissionId: string): Promise<void> {
    await this.db.insert(schema.rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
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
}

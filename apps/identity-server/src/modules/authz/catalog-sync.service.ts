/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq, inArray, notInArray } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { PolicyDecisionService, type Principal } from './policy-decision.service';

/**
 * Defining types
 */

interface CatalogPermission {
  name: string;
  description?: string;
}

interface CatalogRole {
  name: string;
  description?: string;
  permissions: string[];
}

export interface CatalogManifest {
  permissions: CatalogPermission[];
  roles: CatalogRole[];
}

export interface CatalogSyncResult {
  permissionsUpserted: number;
  permissionsDeleted: number;
  rolesUpserted: number;
  rolesDeleted: number;
  principalsInvalidated: number;
}

/**
 * Declaring the constants
 *
 * A service token's client id is a UUID; guard the lookup so a malformed value is a clean 403
 * rather than a Postgres cast error.
 *
 * Declarative role-catalog reconciliation (D-15): a service owns the roles and permissions of its
 * own application and pushes the full manifest through the SDK. The manifest is the source of
 * truth — anything absent from it is deleted, cascading (ON DELETE CASCADE) into `role_permissions`
 * and `role_assignments`. Because cascades do not touch the Redis `authz_version`, every principal
 * holding a role in the application is snapshotted before mutation and invalidated after commit, so
 * a revoked grant cannot survive in an enforcement-point cache. Assignments themselves stay an
 * administrative operation — a service never grants roles to users.
 */

const UUID_PATTERN = /^[0-9a-fA-F-]{36}$/;

@Injectable()
export class CatalogSyncService {
  private readonly logger = Logger.getLogger(APP_NAME, CatalogSyncService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /** Resolves the application a service account owns from its client id; the caller can only ever touch its own application's catalog. */
  private async resolveApplicationId(clientId: string): Promise<number> {
    if (!UUID_PATTERN.test(clientId)) throw AppErrorCode.AUTHZ_002.create();
    const client = await this.db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, clientId), columns: { applicationId: true } });
    if (!client) throw AppErrorCode.AUTHZ_002.create();
    return client.applicationId;
  }

  async sync(actorClientId: string, manifest: CatalogManifest): Promise<CatalogSyncResult> {
    const applicationId = await this.resolveApplicationId(actorClientId);
    const permissionNames = new Set(manifest.permissions.map(permission => permission.name));
    if (permissionNames.size !== manifest.permissions.length) throw AppErrorCode.AUTHZ_001.create();
    const roleNames = new Set(manifest.roles.map(role => role.name));
    if (roleNames.size !== manifest.roles.length) throw AppErrorCode.AUTHZ_001.create();
    for (const role of manifest.roles) for (const permission of role.permissions) if (!permissionNames.has(permission)) throw AppErrorCode.AUTHZ_001.create();

    const { result, principals } = await this.db.transaction(async tx => {
      /** Snapshot every principal holding a role here before mutating, so a cascade-deleted assignment or a changed binding still invalidates its caches. */
      const holders = await tx
        .select({ principalType: schema.roleAssignments.principalType, principalId: schema.roleAssignments.principalId })
        .from(schema.roleAssignments)
        .innerJoin(schema.applicationRoles, eq(schema.roleAssignments.roleId, schema.applicationRoles.id))
        .where(eq(schema.applicationRoles.applicationId, applicationId));
      const affected = new Map<string, Principal>(holders.map(holder => [`${holder.principalType}:${holder.principalId}`, { type: holder.principalType, id: holder.principalId }]));

      for (const permission of manifest.permissions)
        await tx
          .insert(schema.permissions)
          .values({ applicationId, name: permission.name, description: permission.description ?? null })
          .onConflictDoUpdate({ target: [schema.permissions.applicationId, schema.permissions.name], set: { description: permission.description ?? null } });

      const permissionScope = permissionNames.size
        ? and(eq(schema.permissions.applicationId, applicationId), notInArray(schema.permissions.name, [...permissionNames]))
        : eq(schema.permissions.applicationId, applicationId);
      const deletedPermissions = await tx.delete(schema.permissions).where(permissionScope).returning({ id: schema.permissions.id });

      for (const role of manifest.roles)
        await tx
          .insert(schema.applicationRoles)
          .values({ applicationId, roleName: role.name, description: role.description ?? null })
          .onConflictDoUpdate({
            target: [schema.applicationRoles.applicationId, schema.applicationRoles.roleName],
            set: { description: role.description ?? null, updatedAt: new Date() },
          });

      const roleScope = roleNames.size
        ? and(eq(schema.applicationRoles.applicationId, applicationId), notInArray(schema.applicationRoles.roleName, [...roleNames]))
        : eq(schema.applicationRoles.applicationId, applicationId);
      const deletedRoles = await tx.delete(schema.applicationRoles).where(roleScope).returning({ id: schema.applicationRoles.id });

      const permissionRows = await tx
        .select({ id: schema.permissions.id, name: schema.permissions.name })
        .from(schema.permissions)
        .where(eq(schema.permissions.applicationId, applicationId));
      const permissionByName = new Map(permissionRows.map(row => [row.name, row.id]));
      const roleRows = await tx
        .select({ id: schema.applicationRoles.id, roleName: schema.applicationRoles.roleName })
        .from(schema.applicationRoles)
        .where(eq(schema.applicationRoles.applicationId, applicationId));
      const roleByName = new Map(roleRows.map(row => [row.roleName, row.id]));

      for (const role of manifest.roles) {
        const roleId = roleByName.get(role.name);
        if (roleId === undefined) throw AppErrorCode.AUTHZ_001.create();
        const desired = new Set(role.permissions.map(name => permissionByName.get(name)).filter((id): id is string => id !== undefined));
        const current = await tx.select({ permissionId: schema.rolePermissions.permissionId }).from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
        const currentIds = new Set(current.map(row => row.permissionId));
        for (const permissionId of desired) if (!currentIds.has(permissionId)) await tx.insert(schema.rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
        const stale = [...currentIds].filter(id => !desired.has(id));
        if (stale.length) await tx.delete(schema.rolePermissions).where(and(eq(schema.rolePermissions.roleId, roleId), inArray(schema.rolePermissions.permissionId, stale)));
      }

      const result: CatalogSyncResult = {
        permissionsUpserted: manifest.permissions.length,
        permissionsDeleted: deletedPermissions.length,
        rolesUpserted: manifest.roles.length,
        rolesDeleted: deletedRoles.length,
        principalsInvalidated: affected.size,
      };
      return { result, principals: [...affected.values()] };
    });

    for (const principal of principals) await this.policyDecisionService.invalidatePrincipal(principal);
    await this.applicationService.loadApplications();
    await this.auditService.record({
      action: 'authz.catalog.synced',
      outcome: 'SUCCESS',
      actorType: 'SERVICE_ACCOUNT',
      actorId: actorClientId,
      targetType: 'application',
      targetId: String(applicationId),
      detail: { ...result },
    });
    this.logger.info('synced application role catalog', { applicationId, actorClientId, ...result });
    return result;
  }
}

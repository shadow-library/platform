import { and, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { PolicyDecisionService, type Principal } from '@server/modules/authz';
import { Application, DatabaseService, PrimaryDatabase, schema, ScimGroup, ScimGroupRoleMapping } from '@server/modules/infrastructure/datastore';
import { OrganisationApplicationService } from '@server/modules/system/application';

export interface GroupMappingRow {
  id: string;
  groupId: string;
  roleId: number;
  organisationId: bigint;
  createdBy: string | null;
  createdAt: Date;
}

export interface GroupMappingFilter {
  organisationId?: bigint;
  groupId?: string;
}

/**
 * The group→role sync engine (T-905). A mapping never stores an assignment: it is glue that drives
 * ordinary `role_assignments` rows carrying a `scim:group:<groupId>` provenance marker (D-A9), org =
 * the group's organisation, principal = the member USER. `reconcile` is the single source of truth —
 * it re-derives whether *any* mapped group in the org still grants the role to the member and either
 * materialises the marker row or, for a marker row only (never a manual grant), revokes it. Because
 * it re-derives, one code path serves membership add, membership remove, mapping create/delete and
 * group delete, and the overlap rule (a second mapped group still granting the role → keep) falls out
 * for free. Every applied change bumps the affected principal's authz version through the PDP.
 */
const MARKER_PREFIX = 'scim:group:';

@Injectable()
export class ScimGroupMappingService {
  private readonly logger = Logger.getLogger(APP_NAME, ScimGroupMappingService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly organisationApplicationService: OrganisationApplicationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listMappings(filter: GroupMappingFilter): Promise<GroupMappingRow[]> {
    const conditions = [
      filter.groupId ? eq(schema.scimGroupRoleMappings.groupId, filter.groupId) : undefined,
      filter.organisationId !== undefined ? eq(schema.scimGroups.organisationId, filter.organisationId) : undefined,
    ].filter(condition => condition !== undefined);
    return this.db
      .select({
        id: schema.scimGroupRoleMappings.id,
        groupId: schema.scimGroupRoleMappings.groupId,
        roleId: schema.scimGroupRoleMappings.roleId,
        organisationId: schema.scimGroups.organisationId,
        createdBy: schema.scimGroupRoleMappings.createdBy,
        createdAt: schema.scimGroupRoleMappings.createdAt,
      })
      .from(schema.scimGroupRoleMappings)
      .innerJoin(schema.scimGroups, eq(schema.scimGroups.id, schema.scimGroupRoleMappings.groupId))
      .where(and(...conditions))
      .orderBy(schema.scimGroupRoleMappings.createdAt);
  }

  async getMapping(mappingId: string): Promise<ScimGroupRoleMapping | null> {
    const mapping = await this.db.query.scimGroupRoleMappings.findFirst({ where: eq(schema.scimGroupRoleMappings.id, mappingId) });
    return mapping ?? null;
  }

  async createMapping(role: Application.Role, groupId: string, createdBy: string): Promise<GroupMappingRow> {
    const group = await this.requireGroup(groupId);
    await this.organisationApplicationService.assertReachable(group.organisationId, role.applicationId);

    const [inserted] = await this.db.insert(schema.scimGroupRoleMappings).values({ groupId, roleId: role.id, createdBy }).onConflictDoNothing().returning();
    const mapping =
      inserted ??
      (await this.db.query.scimGroupRoleMappings.findFirst({ where: and(eq(schema.scimGroupRoleMappings.groupId, groupId), eq(schema.scimGroupRoleMappings.roleId, role.id)) }));
    if (!mapping) throw AppError.internal('Scim group role mapping insert failed');

    await this.backfill(group, role.id);
    this.logger.info('created scim group role mapping', { mappingId: mapping.id, groupId, roleId: role.id, organisationId: group.organisationId.toString() });
    return { id: mapping.id, groupId: mapping.groupId, roleId: mapping.roleId, organisationId: group.organisationId, createdBy: mapping.createdBy, createdAt: mapping.createdAt };
  }

  async deleteMapping(mapping: ScimGroupRoleMapping): Promise<void> {
    const group = await this.requireGroup(mapping.groupId);
    await this.db.delete(schema.scimGroupRoleMappings).where(eq(schema.scimGroupRoleMappings.id, mapping.id));
    for (const userId of await this.memberUserIds(group.id)) await this.reconcile(userId, mapping.roleId, group.organisationId);
    this.logger.info('deleted scim group role mapping', { mappingId: mapping.id, groupId: mapping.groupId, roleId: mapping.roleId });
  }

  async syncMembership(group: ScimGroup, directoryIds: string[]): Promise<void> {
    if (directoryIds.length === 0) return;
    const roleIds = await this.mappedRoleIds(group.id);
    if (roleIds.length === 0) return;
    const userIds = await this.directoryUserIds(directoryIds);
    for (const userId of userIds) for (const roleId of roleIds) await this.reconcile(userId, roleId, group.organisationId);
  }

  /**
   * The (member, role) pairs a group grants, captured *before* the group is deleted (its members and
   * mappings cascade away with it). The caller deletes the group, then feeds these to `reconcilePairs`
   * so each marker row is revoked unless another mapped group still grants it.
   */
  async collectMemberRolePairs(group: ScimGroup): Promise<{ userId: bigint; roleId: number }[]> {
    const roleIds = await this.mappedRoleIds(group.id);
    if (roleIds.length === 0) return [];
    const userIds = await this.memberUserIds(group.id);
    return userIds.flatMap(userId => roleIds.map(roleId => ({ userId, roleId })));
  }

  async reconcilePairs(organisationId: bigint, pairs: { userId: bigint; roleId: number }[]): Promise<void> {
    for (const pair of pairs) await this.reconcile(pair.userId, pair.roleId, organisationId);
  }

  private async reconcile(userId: bigint, roleId: number, organisationId: bigint): Promise<void> {
    const principal: Principal = { type: 'USER', id: userId.toString() };
    const grantingGroupId = await this.grantingGroupId(userId, roleId, organisationId);
    const existing = await this.db.query.roleAssignments.findFirst({
      where: and(
        eq(schema.roleAssignments.principalType, 'USER'),
        eq(schema.roleAssignments.principalId, userId.toString()),
        eq(schema.roleAssignments.roleId, roleId),
        eq(schema.roleAssignments.organisationId, organisationId),
      ),
    });

    if (grantingGroupId !== null) {
      if (!existing) await this.policyDecisionService.assignRole(principal, roleId, organisationId.toString(), `${MARKER_PREFIX}${grantingGroupId}`);
      return;
    }
    if (existing && existing.grantedBy?.startsWith(MARKER_PREFIX)) await this.policyDecisionService.revokeRole(principal, roleId, organisationId.toString());
  }

  private async backfill(group: ScimGroup, roleId: number): Promise<void> {
    for (const userId of await this.memberUserIds(group.id)) await this.reconcile(userId, roleId, group.organisationId);
  }

  private async grantingGroupId(userId: bigint, roleId: number, organisationId: bigint): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.scimGroups.id })
      .from(schema.scimGroupRoleMappings)
      .innerJoin(schema.scimGroups, eq(schema.scimGroups.id, schema.scimGroupRoleMappings.groupId))
      .innerJoin(schema.scimGroupMembers, eq(schema.scimGroupMembers.groupId, schema.scimGroups.id))
      .innerJoin(schema.scimDirectory, eq(schema.scimDirectory.id, schema.scimGroupMembers.directoryId))
      .where(and(eq(schema.scimGroupRoleMappings.roleId, roleId), eq(schema.scimGroups.organisationId, organisationId), eq(schema.scimDirectory.userId, userId)))
      .limit(1);
    return row?.id ?? null;
  }

  private async mappedRoleIds(groupId: string): Promise<number[]> {
    const rows = await this.db.select({ roleId: schema.scimGroupRoleMappings.roleId }).from(schema.scimGroupRoleMappings).where(eq(schema.scimGroupRoleMappings.groupId, groupId));
    return rows.map(row => row.roleId);
  }

  private async memberUserIds(groupId: string): Promise<bigint[]> {
    const rows = await this.db
      .select({ userId: schema.scimDirectory.userId })
      .from(schema.scimGroupMembers)
      .innerJoin(schema.scimDirectory, eq(schema.scimDirectory.id, schema.scimGroupMembers.directoryId))
      .where(eq(schema.scimGroupMembers.groupId, groupId));
    return rows.map(row => row.userId);
  }

  private async directoryUserIds(directoryIds: string[]): Promise<bigint[]> {
    const rows = await this.db.query.scimDirectory.findMany({ where: inArray(schema.scimDirectory.id, directoryIds) });
    return rows.map(row => row.userId);
  }

  private async requireGroup(groupId: string): Promise<ScimGroup> {
    const group = await this.db.query.scimGroups.findFirst({ where: eq(schema.scimGroups.id, groupId) });
    if (!group) throw AppErrorCode.SCIM_001.create();
    return group;
  }
}

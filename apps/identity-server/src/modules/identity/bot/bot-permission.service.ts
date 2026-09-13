import { and, asc, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, isNumericId } from '@server/constants';
import { type AuthzReader, PolicyDecisionService, type Principal } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { type Application, type Bot, DatabaseService, type Organisation, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

import { findBot, findManageableBot } from './bot-lookup.util';
import { resolveUserRefs } from './bot-user-ref.util';
import { type BotActor, type BotUserRef } from './bot.types';

/** Read and write sides of the primary database, satisfied by both the pool and an open transaction. */
export type BotGrantWriter = Pick<PrimaryDatabase, 'select' | 'query' | 'insert' | 'delete'>;

export interface BotGrantInput {
  applicationId: number;
  resource: string;
  level: Application.BotGrantLevel;
}

export interface BotGrantRef {
  roleId: number;
  roleName: string;
  applicationId: number;
  application: string;
  resource: string | null;
  level: Application.BotGrantLevel | null;
}

export interface BotGrantDiff {
  added: BotGrantRef[];
  removed: BotGrantRef[];
}

/**
 * A desired grant set paired with the organisation's reachable applications. Reachability is Redis-cached
 * and resolved through the connection pool, so it must be prepared before a caller opens the transaction
 * the grants are written in; everything the ceiling actually rests on is re-derived inside it.
 */
export interface BotGrantContext {
  desired: BotGrantInput[];
  reachable: Set<number>;
}

export interface BotGrant extends BotGrantRef {
  applicationDisplayName: string | null;
  sensitive: boolean;
  eligible: boolean;
  grantedAt: Date;
  grantedBy: BotUserRef | null;
  granterHoldsPermission: boolean;
  /** Written by this endpoint, so a permissions write may change it. False for a platform-staff assignment on the same principal. */
  managed: boolean;
}

export interface BotCatalogLevel {
  roleId: number;
  roleName: string;
  description: string | null;
  level: Application.BotGrantLevel;
  sensitive: boolean;
  eligible: boolean;
  heldByYou: boolean;
}

export interface BotCatalogResource {
  resource: string;
  levels: BotCatalogLevel[];
}

export interface BotCatalogApplication {
  applicationId: number;
  name: string;
  displayName: string | null;
  logoUrl: string | null;
  resources: BotCatalogResource[];
}

interface GrantableRole {
  roleId: number;
  roleName: string;
  description: string | null;
  applicationId: number;
  application: string;
  applicationDisplayName: string | null;
  applicationLogoUrl: string | null;
  resource: string;
  level: Application.BotGrantLevel;
  sensitive: boolean;
}

interface HeldCandidate {
  roleId: number;
  applicationId: number;
  permissions: string[];
}

const ADMIN_RANKS: Organisation.MemberRole[] = ['ADMIN', 'OWNER'];
const LEVEL_ORDER: Record<Application.BotGrantLevel, number> = { read: 0, write: 1 };

/**
 * Provenance marker on `granted_by`, following the `scim:group:` precedent: the same principal's
 * assignments can also be written by the platform admin role-assignment API, and there is no provenance
 * column to tell them apart. Tagging the rows this endpoint writes lets it replace its own grants — a
 * grant whose role later stops being bot-grantable included, which no desired set can name and which
 * would otherwise be unrevokable — while leaving a staff assignment untouched.
 */
const GRANT_MARKER = 'bot:';

const slotOf = (applicationId: number, resource: string, level: string): string => `${applicationId}:${resource}:${level}`;

const markerFor = (userId: bigint): string => `${GRANT_MARKER}${userId}`;

const isManagedGrant = (grantedBy: string | null): boolean => grantedBy?.startsWith(GRANT_MARKER) ?? false;

const granterIdOf = (grantedBy: string | null): string | null => {
  if (grantedBy === null) return null;
  const raw = grantedBy.startsWith(GRANT_MARKER) ? grantedBy.slice(GRANT_MARKER.length) : grantedBy;
  return isNumericId(raw) ? raw : null;
};

@Injectable()
export class BotPermissionService {
  private readonly logger = Logger.getLogger(APP_NAME, BotPermissionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly applicationService: ApplicationService,
    private readonly accessService: ApplicationAccessService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async prepareGrants(organisationId: bigint, desired: BotGrantInput[]): Promise<BotGrantContext> {
    return { desired, reachable: desired.length === 0 ? new Set() : await this.accessService.listOrganisationApplicationIds(organisationId) };
  }

  async listCatalog(organisationId: bigint, adminUserId: bigint): Promise<BotCatalogApplication[]> {
    const roles = await this.grantableRoles(this.db, await this.accessService.listOrganisationApplicationIds(organisationId));
    if (roles.length === 0) return [];

    const candidates = await this.heldCandidates(this.db, roles);
    const held = await this.heldRoleIds(this.db, adminUserId.toString(), organisationId, candidates);

    const applications = new Map<number, BotCatalogApplication>();
    const resources = new Map<string, BotCatalogResource>();
    for (const role of roles) {
      let application = applications.get(role.applicationId);
      if (!application) {
        application = { applicationId: role.applicationId, name: role.application, displayName: role.applicationDisplayName, logoUrl: role.applicationLogoUrl, resources: [] };
        applications.set(role.applicationId, application);
      }

      const key = `${role.applicationId}:${role.resource}`;
      let resource = resources.get(key);
      if (!resource) {
        resource = { resource: role.resource, levels: [] };
        resources.set(key, resource);
        application.resources.push(resource);
      }

      resource.levels.push({
        roleId: role.roleId,
        roleName: role.roleName,
        description: role.description,
        level: role.level,
        sensitive: role.sensitive,
        eligible: true,
        heldByYou: held.has(role.roleId),
      });
    }

    for (const application of applications.values()) for (const resource of application.resources) resource.levels.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    return [...applications.values()];
  }

  async listGrants(organisationId: bigint, botId: bigint): Promise<BotGrant[]> {
    const bot = await findBot(this.db, organisationId, botId);
    const rows = await this.assignedRoles(this.db, bot);
    if (rows.length === 0) return [];

    const candidates = await this.heldCandidates(
      this.db,
      rows.map(row => ({ roleId: row.roleId, applicationId: row.applicationId })),
    );
    const byRole = new Map(candidates.map(candidate => [candidate.roleId, candidate]));

    const granters = [...new Set(rows.map(row => granterIdOf(row.grantedBy)).filter((id): id is string => id !== null))];
    const stillHeld = new Map(
      await Promise.all(
        granters.map(async granter => {
          const relevant = rows.filter(row => granterIdOf(row.grantedBy) === granter).flatMap(row => byRole.get(row.roleId) ?? []);
          return [granter, await this.heldRoleIds(this.db, granter, organisationId, relevant)] as const;
        }),
      ),
    );

    const userRef = await resolveUserRefs(
      this.db,
      rows.map(row => {
        const granter = granterIdOf(row.grantedBy);
        return granter === null ? null : BigInt(granter);
      }),
    );

    return rows.map(row => {
      const granter = granterIdOf(row.grantedBy);
      return {
        roleId: row.roleId,
        roleName: row.roleName,
        applicationId: row.applicationId,
        application: row.application,
        applicationDisplayName: row.applicationDisplayName,
        resource: row.resource,
        level: row.level,
        sensitive: row.sensitive,
        eligible: row.eligible,
        grantedAt: row.grantedAt,
        grantedBy: userRef(granter === null ? null : BigInt(granter)),
        granterHoldsPermission: granter !== null && (stillHeld.get(granter)?.has(row.roleId) ?? false),
        managed: isManagedGrant(row.grantedBy),
      };
    });
  }

  async replaceGrants(actor: BotActor, organisationId: bigint, botId: bigint, desired: BotGrantInput[]): Promise<BotGrantDiff> {
    const context = await this.prepareGrants(organisationId, desired);
    const { bot, diff } = await this.db.transaction(async tx => {
      const bot = await findManageableBot(tx, organisationId, botId);
      const roles = await this.resolveDesiredRoles(tx, actor, bot, context);
      const assigned = await this.assignedRoles(tx, bot);

      const keep = new Set(roles.map(role => role.roleId));
      const removed = assigned.filter(row => isManagedGrant(row.grantedBy) && !keep.has(row.roleId));
      const present = new Set(assigned.map(row => row.roleId));
      const added = roles.filter(role => !present.has(role.roleId));

      if (added.length > 0)
        await tx
          .insert(schema.roleAssignments)
          .values(
            added.map(role => ({ principalType: 'SERVICE_ACCOUNT' as const, principalId: bot.clientId, roleId: role.roleId, organisationId, grantedBy: markerFor(actor.userId) })),
          )
          .onConflictDoNothing();
      if (removed.length > 0)
        await tx.delete(schema.roleAssignments).where(
          and(
            this.principalScope(bot),
            inArray(
              schema.roleAssignments.roleId,
              removed.map(row => row.roleId),
            ),
          ),
        );

      return { bot, diff: { added: added.map(role => this.refOf(role)), removed: removed.map(row => this.refOf(row)) } };
    });

    await this.announceChange(actor, bot, diff);
    return diff;
  }

  /** Grants applied while the bot row is still being created, so an ineligible or unheld grant rolls the whole creation back. */
  async grantInTransaction(tx: BotGrantWriter, actor: BotActor, bot: Bot, context: BotGrantContext): Promise<BotGrantRef[]> {
    if (context.desired.length === 0) return [];
    const roles = await this.resolveDesiredRoles(tx, actor, bot, context);
    await tx
      .insert(schema.roleAssignments)
      .values(
        roles.map(role => ({
          principalType: 'SERVICE_ACCOUNT' as const,
          principalId: bot.clientId,
          roleId: role.roleId,
          organisationId: bot.organisationId,
          grantedBy: markerFor(actor.userId),
        })),
      )
      .onConflictDoNothing();
    return roles.map(role => this.refOf(role));
  }

  async announceChange(actor: BotActor, bot: Bot, diff: BotGrantDiff): Promise<void> {
    if (diff.added.length === 0 && diff.removed.length === 0) return;

    await this.policyDecisionService.invalidatePrincipal(this.principalOf(bot));
    await this.auditService.record({
      action: 'bot.permissions.changed',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.userId.toString(),
      organisationId: bot.organisationId.toString(),
      targetType: 'bot',
      targetId: bot.id.toString(),
      ipAddress: actor.ip ?? null,
      detail: { added: diff.added, removed: diff.removed },
    });
    this.logger.info('changed bot permissions', {
      organisationId: bot.organisationId.toString(),
      botId: bot.id.toString(),
      added: diff.added.map(grant => grant.roleName),
      removed: diff.removed.map(grant => grant.roleName),
    });
  }

  private principalOf(bot: Bot): Principal {
    return { type: 'SERVICE_ACCOUNT', id: bot.clientId };
  }

  private principalScope(bot: Bot) {
    return and(
      eq(schema.roleAssignments.principalType, 'SERVICE_ACCOUNT'),
      eq(schema.roleAssignments.principalId, bot.clientId),
      eq(schema.roleAssignments.organisationId, bot.organisationId),
    );
  }

  private refOf(role: {
    roleId: number;
    roleName: string;
    applicationId: number;
    application: string;
    resource: string | null;
    level: Application.BotGrantLevel | null;
  }): BotGrantRef {
    return { roleId: role.roleId, roleName: role.roleName, applicationId: role.applicationId, application: role.application, resource: role.resource, level: role.level };
  }

  /**
   * The desired set is expressed as (application, resource, level) rather than role ids, so a client can
   * only name grants the catalog exposes. Both halves of the ceiling are re-derived here from the same
   * executor the write uses: the role must be bot-grantable on an application this organisation reaches,
   * and the granting admin must hold it.
   */
  private async resolveDesiredRoles(db: BotGrantWriter, actor: BotActor, bot: Bot, context: BotGrantContext): Promise<GrantableRole[]> {
    const wanted = new Map(context.desired.map(grant => [slotOf(grant.applicationId, grant.resource, grant.level), grant]));
    if (wanted.size === 0) return [];

    const grantable = await this.grantableRoles(db, context.reachable);
    const bySlot = new Map(grantable.map(role => [slotOf(role.applicationId, role.resource, role.level), role]));
    const roles: GrantableRole[] = [];
    for (const [slot, grant] of wanted) {
      const role = bySlot.get(slot);
      if (!role) {
        this.logger.warn('bot grant refused: the permission is not bot-grantable in this organisation', {
          securityEvent: 'bot.grant_ineligible',
          botId: bot.id.toString(),
          ...grant,
        });
        throw AppErrorCode.BOT_004.create();
      }
      roles.push(role);
    }

    const candidates = await this.heldCandidates(db, roles);
    const held = await this.heldRoleIds(db, actor.userId.toString(), bot.organisationId, candidates);
    for (const role of roles) {
      if (held.has(role.roleId)) continue;
      this.logger.warn('bot grant refused: the granting admin does not hold the permission', {
        securityEvent: 'bot.grant_not_held',
        botId: bot.id.toString(),
        userId: actor.userId.toString(),
        roleName: role.roleName,
      });
      throw AppErrorCode.BOT_005.create();
    }
    return roles;
  }

  private async grantableRoles(db: AuthzReader, reachable: Set<number>): Promise<GrantableRole[]> {
    if (reachable.size === 0) return [];

    const rows = await db
      .select({
        roleId: schema.applicationRoles.id,
        roleName: schema.applicationRoles.roleName,
        description: schema.applicationRoles.description,
        applicationId: schema.applications.id,
        application: schema.applications.name,
        applicationDisplayName: schema.applications.displayName,
        applicationLogoUrl: schema.applications.logoUrl,
        resource: schema.applicationRoles.botResource,
        level: schema.applicationRoles.botLevel,
        sensitive: schema.applicationRoles.isSensitive,
      })
      .from(schema.applicationRoles)
      .innerJoin(schema.applications, eq(schema.applications.id, schema.applicationRoles.applicationId))
      .where(and(eq(schema.applicationRoles.botGrantable, true), eq(schema.applications.isActive, true), inArray(schema.applications.id, [...reachable])))
      .orderBy(asc(schema.applications.name), asc(schema.applicationRoles.botResource), asc(schema.applicationRoles.id));

    const roles: GrantableRole[] = [];
    const claimed = new Set<string>();
    for (const row of rows) {
      if (row.resource === null || row.level === null) continue;
      const slot = slotOf(row.applicationId, row.resource, row.level);
      if (claimed.has(slot)) {
        this.logger.warn('ignoring a duplicate bot grant slot in the role catalog', {
          applicationId: row.applicationId,
          resource: row.resource,
          level: row.level,
          roleId: row.roleId,
        });
        continue;
      }
      claimed.add(slot);
      roles.push({ ...row, resource: row.resource, level: row.level });
    }
    return roles;
  }

  private async assignedRoles(db: AuthzReader, bot: Bot) {
    return db
      .select({
        roleId: schema.applicationRoles.id,
        roleName: schema.applicationRoles.roleName,
        applicationId: schema.applications.id,
        application: schema.applications.name,
        applicationDisplayName: schema.applications.displayName,
        resource: schema.applicationRoles.botResource,
        level: schema.applicationRoles.botLevel,
        sensitive: schema.applicationRoles.isSensitive,
        eligible: schema.applicationRoles.botGrantable,
        grantedAt: schema.roleAssignments.grantedAt,
        grantedBy: schema.roleAssignments.grantedBy,
      })
      .from(schema.roleAssignments)
      .innerJoin(schema.applicationRoles, eq(schema.applicationRoles.id, schema.roleAssignments.roleId))
      .innerJoin(schema.applications, eq(schema.applications.id, schema.applicationRoles.applicationId))
      .where(this.principalScope(bot))
      .orderBy(asc(schema.applications.name), asc(schema.applicationRoles.botResource), asc(schema.applicationRoles.id));
  }

  private async heldCandidates(db: AuthzReader, roles: { roleId: number; applicationId: number }[]): Promise<HeldCandidate[]> {
    if (roles.length === 0) return [];
    const rows = await db
      .select({ roleId: schema.rolePermissions.roleId, name: schema.permissions.name })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(
        inArray(
          schema.rolePermissions.roleId,
          roles.map(role => role.roleId),
        ),
      );

    const permissions = new Map<number, string[]>();
    for (const row of rows) permissions.set(row.roleId, [...(permissions.get(row.roleId) ?? []), row.name]);
    return roles.map(role => ({ roleId: role.roleId, applicationId: role.applicationId, permissions: permissions.get(role.roleId) ?? [] }));
  }

  /**
   * Identity's own `identity:org:*` permissions are held by organisation rank rather than by a role
   * assignment, so an ADMIN or OWNER holds every bot-grantable role of the platform application. Every
   * other application is resolved through the PDP, one call per application rather than one per role.
   *
   * A permission-less role is never held: `every` on an empty set is vacuously true, which would put such a
   * role above the BOT_005 ceiling for every admin and silently promote its grants once a later sync gave it
   * permissions. The catalog sync refuses to create one; this is the second lock on data that predates it.
   */
  private async heldRoleIds(db: AuthzReader, userId: string, organisationId: bigint, candidates: HeldCandidate[]): Promise<Set<number>> {
    const held = new Set<number>();
    if (candidates.length === 0 || !isNumericId(userId)) return held;

    const byApplication = new Map<number, HeldCandidate[]>();
    for (const candidate of candidates) byApplication.set(candidate.applicationId, [...(byApplication.get(candidate.applicationId) ?? []), candidate]);

    const platformApplicationId = this.applicationService.getApplicationOrThrow(APP_NAME).id;
    const principal: Principal = { type: 'USER', id: userId };
    for (const [applicationId, roles] of byApplication) {
      if (applicationId === platformApplicationId) {
        if (await this.holdsByRank(db, userId, organisationId)) for (const role of roles) held.add(role.roleId);
        continue;
      }

      const permissions = await this.policyDecisionService.listPermissions(principal, organisationId.toString(), { applicationId, executor: db });
      for (const role of roles) if (role.permissions.length > 0 && role.permissions.every(permission => permissions.has(permission))) held.add(role.roleId);
    }
    return held;
  }

  private async holdsByRank(db: AuthzReader, userId: string, organisationId: bigint): Promise<boolean> {
    const membership = await db.query.organisationMembers.findFirst({
      where: and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.userId, BigInt(userId))),
      columns: { role: true, status: true },
    });
    return membership?.status === 'ACTIVE' && ADMIN_RANKS.includes(membership.role);
  }
}

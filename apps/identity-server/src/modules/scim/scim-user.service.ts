/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';
import { SQL, and, asc, count, eq, sql } from 'drizzle-orm';
import validator from 'validator';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { SessionService } from '@server/modules/auth/session';
import { BackChannelLogoutService, RefreshTokenService } from '@server/modules/auth/token';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, ScimDirectoryEntry, schema } from '@server/modules/infrastructure/datastore';

import { ScimTenant } from './scim-auth.service';
import {
  ScimError,
  ScimFilter,
  ScimListResult,
  ScimMemberRef,
  ScimName,
  ScimPage,
  ScimPatchOperation,
  ScimUserInput,
  ScimUserResource,
  USER_SCHEMA,
  asBoolean,
  asOptionalString,
  asRecord,
} from './scim.types';

/**
 * Defining types
 */

interface ScimUserChanges {
  externalId?: string | null;
  active?: boolean;
  name?: ScimName;
  displayName?: string;
}

/**
 * Declaring the constants
 *
 * Ownership rules (recorded decisions, T-704):
 * - `userName` must be an email whose domain the organisation has VERIFIED — a tenant can only
 *   provision its own namespace, which also closes the account-enumeration oracle for foreign
 *   addresses (probing gmail.com fails identically whether or not an account exists).
 * - Provisioning an email that already belongs to a verified local account ADOPTS it
 *   (`managed = false`): deprovisioning strips org membership and org-scoped tokens but never
 *   touches the account. Only accounts born via SCIM (`managed = true`) are deactivated at
 *   account level, with sessions/tokens revoked and back-channel logout fanned out.
 * - Profile fields (name, displayName) are written only to managed accounts; adopted users own
 *   their profile.
 */

@Injectable()
export class ScimUserService {
  private readonly logger = Logger.getLogger(APP_NAME, ScimUserService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly userService: UserService,
    private readonly organisationService: OrganisationService,
    private readonly sessionService: SessionService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly backChannelLogoutService: BackChannelLogoutService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /* ----------------------------------------- reads ----------------------------------------- */

  async list(tenant: ScimTenant, filter: ScimFilter | undefined, page: ScimPage): Promise<ScimListResult<ScimUserResource>> {
    const conditions: SQL[] = [eq(schema.scimDirectory.organisationId, tenant.organisationId)];
    if (filter?.attribute === 'userName') conditions.push(sql`lower(${schema.scimDirectory.userName}) = ${filter.value.toLowerCase()}`);
    if (filter?.attribute === 'externalId') conditions.push(eq(schema.scimDirectory.externalId, filter.value));
    const where = and(...conditions);

    const [total] = await this.db.select({ value: count() }).from(schema.scimDirectory).where(where);
    const entries = await this.db.query.scimDirectory.findMany({
      where,
      orderBy: asc(schema.scimDirectory.createdAt),
      offset: page.startIndex - 1,
      limit: page.count,
    });
    const resources = await Promise.all(entries.map(entry => this.toResource(entry)));
    return { total: total?.value ?? 0, resources };
  }

  async get(tenant: ScimTenant, id: string): Promise<ScimUserResource> {
    return this.toResource(await this.requireEntry(tenant, id));
  }

  /* ---------------------------------------- create ----------------------------------------- */

  async create(tenant: ScimTenant, input: ScimUserInput): Promise<ScimUserResource> {
    const email = input.userName.toLowerCase();
    if (!validator.isEmail(email)) throw new ScimError(400, 'userName must be an email address', 'invalidValue');
    await this.assertDomainVerified(tenant.organisationId, email);

    const duplicate = await this.db.query.scimDirectory.findFirst({
      where: and(eq(schema.scimDirectory.organisationId, tenant.organisationId), sql`lower(${schema.scimDirectory.userName}) = ${email}`),
    });
    if (duplicate) throw new ScimError(409, 'A resource with this userName already exists', 'uniqueness');

    const existing = await this.userService.getUser(email);
    if (existing && existing.status === 'CLOSED') throw new ScimError(409, 'A resource with this userName already exists', 'uniqueness');

    const userId = existing
      ? existing.id
      : (
          await this.userService.createProvisionedUser({
            email,
            emailVerified: true,
            status: 'ACTIVE',
            firstName: input.name.givenName,
            lastName: input.name.familyName,
            displayName: input.displayName,
          })
        ).id;

    await this.organisationService.ensureMember(tenant.organisationId, userId, 'MEMBER');
    const entry = await this.db
      .insert(schema.scimDirectory)
      .values({ organisationId: tenant.organisationId, userId, userName: email, externalId: input.externalId, active: true, managed: !existing })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('Scim directory insert failed')));

    if (!input.active) await this.setActive(entry, false);
    await this.audit(tenant, 'scim.user.provisioned', userId, { adopted: Boolean(existing) });
    this.logger.info('scim user provisioned', { organisationId: tenant.organisationId.toString(), userId: userId.toString(), adopted: Boolean(existing) });
    return this.toResource({ ...entry, active: input.active });
  }

  /* ------------------------------------ replace / patch ------------------------------------ */

  async replace(tenant: ScimTenant, id: string, input: ScimUserInput): Promise<ScimUserResource> {
    const entry = await this.requireEntry(tenant, id);
    if (input.userName.toLowerCase() !== entry.userName.toLowerCase()) throw new ScimError(400, 'userName is immutable', 'mutability');
    await this.applyChanges(entry, { externalId: input.externalId ?? null, active: input.active, name: input.name, displayName: input.displayName });
    await this.audit(tenant, 'scim.user.replaced', entry.userId);
    return this.toResource(await this.requireEntry(tenant, id));
  }

  async patch(tenant: ScimTenant, id: string, operations: ScimPatchOperation[]): Promise<ScimUserResource> {
    const entry = await this.requireEntry(tenant, id);
    const changes: ScimUserChanges = {};

    for (const operation of operations) {
      if (operation.op !== 'add' && operation.op !== 'replace' && operation.op !== 'remove') throw new ScimError(400, `Unsupported PATCH op '${operation.op}'`, 'invalidValue');
      if (operation.op === 'remove') {
        if (operation.path?.toLowerCase() === 'externalid') changes.externalId = null;
        else throw new ScimError(400, `Unsupported remove path '${operation.path ?? ''}'`, 'invalidPath');
        continue;
      }
      const path = operation.path?.toLowerCase();
      if (path === undefined) {
        const value = asRecord(operation.value, 'value');
        if (value['active'] !== undefined) changes.active = asBoolean(value['active'], 'active');
        if (value['externalId'] !== undefined) changes.externalId = asOptionalString(value['externalId'], 'externalId') ?? null;
        if (value['displayName'] !== undefined) changes.displayName = asOptionalString(value['displayName'], 'displayName');
        if (value['name'] !== undefined) {
          const name = asRecord(value['name'], 'name');
          changes.name = { givenName: asOptionalString(name['givenName'], 'name.givenName'), familyName: asOptionalString(name['familyName'], 'name.familyName') };
        }
      } else if (path === 'active') changes.active = asBoolean(operation.value, 'active');
      else if (path === 'externalid') changes.externalId = asOptionalString(operation.value, 'externalId') ?? null;
      else if (path === 'displayname') changes.displayName = asOptionalString(operation.value, 'displayName');
      else if (path === 'name.givenname') changes.name = { ...changes.name, givenName: asOptionalString(operation.value, 'name.givenName') };
      else if (path === 'name.familyname') changes.name = { ...changes.name, familyName: asOptionalString(operation.value, 'name.familyName') };
      else if (path === 'username') throw new ScimError(400, 'userName is immutable', 'mutability');
      else throw new ScimError(400, `Unsupported PATCH path '${operation.path ?? ''}'`, 'invalidPath');
    }

    await this.applyChanges(entry, changes);
    await this.audit(tenant, 'scim.user.patched', entry.userId);
    return this.toResource(await this.requireEntry(tenant, id));
  }

  /* ---------------------------------------- delete ----------------------------------------- */

  async remove(tenant: ScimTenant, id: string): Promise<void> {
    const entry = await this.requireEntry(tenant, id);
    if (entry.active) await this.setActive(entry, false);
    await this.db.delete(schema.scimDirectory).where(eq(schema.scimDirectory.id, entry.id));
    await this.audit(tenant, 'scim.user.deprovisioned', entry.userId);
    this.logger.info('scim user deprovisioned', { organisationId: tenant.organisationId.toString(), userId: entry.userId.toString() });
  }

  /* --------------------------------------- internals --------------------------------------- */

  async requireEntry(tenant: ScimTenant, id: string): Promise<ScimDirectoryEntry> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const entry = isUuid
      ? await this.db.query.scimDirectory.findFirst({ where: and(eq(schema.scimDirectory.id, id), eq(schema.scimDirectory.organisationId, tenant.organisationId)) })
      : undefined;
    if (!entry) throw new ScimError(404, 'Resource not found');
    return entry;
  }

  private async assertDomainVerified(organisationId: bigint, email: string): Promise<void> {
    const domain = email.split('@')[1] ?? '';
    const verified = await this.db.query.organisationDomains.findFirst({
      where: and(eq(schema.organisationDomains.organisationId, organisationId), eq(schema.organisationDomains.domain, domain), eq(schema.organisationDomains.status, 'VERIFIED')),
    });
    if (!verified) throw new ScimError(400, `Domain '${domain}' is not verified for this organisation`, 'invalidValue');
  }

  private async applyChanges(entry: ScimDirectoryEntry, changes: ScimUserChanges): Promise<void> {
    if (changes.externalId !== undefined) {
      await this.db.update(schema.scimDirectory).set({ externalId: changes.externalId, updatedAt: new Date() }).where(eq(schema.scimDirectory.id, entry.id));
    }
    if (entry.managed && (changes.name !== undefined || changes.displayName !== undefined)) {
      const profile: Record<string, string> = {};
      if (changes.name?.givenName !== undefined) profile['firstName'] = changes.name.givenName;
      if (changes.name?.familyName !== undefined) profile['lastName'] = changes.name.familyName;
      if (changes.displayName !== undefined) profile['displayName'] = changes.displayName;
      if (Object.keys(profile).length > 0) await this.db.update(schema.userProfiles).set(profile).where(eq(schema.userProfiles.userId, entry.userId));
    }
    if (changes.active !== undefined && changes.active !== entry.active) await this.setActive(entry, changes.active);
  }

  private async setActive(entry: ScimDirectoryEntry, active: boolean): Promise<void> {
    if (active) {
      if (entry.managed) await this.db.update(schema.users).set({ status: 'ACTIVE', updatedAt: new Date() }).where(eq(schema.users.id, entry.userId));
      else await this.organisationService.ensureMember(entry.organisationId, entry.userId, 'MEMBER');
    } else if (entry.managed) {
      await this.db.update(schema.users).set({ status: 'DISABLED', updatedAt: new Date() }).where(eq(schema.users.id, entry.userId));
      await this.revokeAccountAccess(entry.userId);
    } else {
      await this.removeMembership(entry);
      await this.refreshTokenService.revokeForUserOrganisation(entry.userId, entry.organisationId);
    }
    await this.db.update(schema.scimDirectory).set({ active, updatedAt: new Date() }).where(eq(schema.scimDirectory.id, entry.id));
  }

  private async removeMembership(entry: ScimDirectoryEntry): Promise<void> {
    try {
      await this.organisationService.removeMember(entry.organisationId, entry.userId);
    } catch (error) {
      /** Absent membership is fine (already removed by an admin); a last-owner refusal is the tenant's conflict to resolve. */
      if (AppError.is(error, AppErrorCode.ORG_004)) throw new ScimError(409, 'Cannot deprovision the last owner of the organisation', 'mutability');
      if (!AppError.is(error, AppErrorCode.USR_001)) throw error;
    }
  }

  private async revokeAccountAccess(userId: bigint): Promise<void> {
    const sessions = await this.sessionService.listActiveForUser(userId);
    await this.sessionService.terminateAllForUser(userId);
    await this.refreshTokenService.revokeAllForUser(userId);
    for (const session of sessions) await this.backChannelLogoutService.enqueueForSession(session.id, userId);
  }

  private async audit(tenant: ScimTenant, action: string, userId: bigint, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'SERVICE_ACCOUNT',
      actorId: tenant.clientId,
      organisationId: tenant.organisationId.toString(),
      targetType: 'user',
      targetId: userId.toString(),
      detail: detail ?? null,
    });
  }

  async toResource(entry: ScimDirectoryEntry): Promise<ScimUserResource> {
    const profile = await this.db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, entry.userId) });
    const memberships = await this.db
      .select({ id: schema.scimGroups.id, displayName: schema.scimGroups.displayName })
      .from(schema.scimGroupMembers)
      .innerJoin(schema.scimGroups, eq(schema.scimGroupMembers.groupId, schema.scimGroups.id))
      .where(eq(schema.scimGroupMembers.directoryId, entry.id));
    const groups: ScimMemberRef[] = memberships.map(group => ({ value: group.id, display: group.displayName }));

    return {
      schemas: [USER_SCHEMA],
      id: entry.id,
      externalId: entry.externalId ?? undefined,
      userName: entry.userName,
      active: entry.active,
      name: { givenName: profile?.firstName ?? undefined, familyName: profile?.lastName ?? undefined },
      displayName: profile?.displayName ?? undefined,
      emails: [{ value: entry.userName, primary: true }],
      groups,
      meta: {
        resourceType: 'User',
        created: entry.createdAt.toISOString(),
        lastModified: entry.updatedAt.toISOString(),
        location: `${this.issuer}/scim/v2/Users/${entry.id}`,
      },
    };
  }
}

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, throwError } from '@shadow-library/common';
import { SQL, and, asc, count, eq, inArray, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, ScimGroup, schema } from '@server/modules/infrastructure/datastore';

import { ScimTenant } from './scim-auth.service';
import { GROUP_SCHEMA, ScimError, ScimFilter, ScimGroupInput, ScimGroupResource, ScimListResult, ScimPage, ScimPatchOperation, asRecord, asString } from './scim.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * SCIM groups are the tenant's provisioning structure: membership references directory entries
 * (never platform user ids) and carries no authorization semantics yet — mapping groups onto
 * application roles is deferred until a tenant needs it (recorded in tasks.md).
 */

@Injectable()
export class ScimGroupService {
  private readonly issuer = Config.get('oauth.issuer');
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async list(tenant: ScimTenant, filter: ScimFilter | undefined, page: ScimPage): Promise<ScimListResult<ScimGroupResource>> {
    const conditions: SQL[] = [eq(schema.scimGroups.organisationId, tenant.organisationId)];
    if (filter?.attribute === 'displayName') conditions.push(sql`lower(${schema.scimGroups.displayName}) = ${filter.value.toLowerCase()}`);
    if (filter?.attribute === 'externalId') conditions.push(eq(schema.scimGroups.externalId, filter.value));
    const where = and(...conditions);

    const [total] = await this.db.select({ value: count() }).from(schema.scimGroups).where(where);
    const groups = await this.db.query.scimGroups.findMany({ where, orderBy: asc(schema.scimGroups.createdAt), offset: page.startIndex - 1, limit: page.count });
    const resources = await Promise.all(groups.map(group => this.toResource(group)));
    return { total: total?.value ?? 0, resources };
  }

  async get(tenant: ScimTenant, id: string): Promise<ScimGroupResource> {
    return this.toResource(await this.requireGroup(tenant, id));
  }

  async create(tenant: ScimTenant, input: ScimGroupInput): Promise<ScimGroupResource> {
    const duplicate = await this.db.query.scimGroups.findFirst({
      where: and(eq(schema.scimGroups.organisationId, tenant.organisationId), sql`lower(${schema.scimGroups.displayName}) = ${input.displayName.toLowerCase()}`),
    });
    if (duplicate) throw new ScimError(409, 'A group with this displayName already exists', 'uniqueness');

    const group = await this.db
      .insert(schema.scimGroups)
      .values({ organisationId: tenant.organisationId, displayName: input.displayName, externalId: input.externalId })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('Scim group insert failed')));
    if (input.members.length > 0) await this.addMembers(tenant, group.id, input.members);
    await this.audit(tenant, 'scim.group.created', group.id);
    return this.toResource(group);
  }

  async replace(tenant: ScimTenant, id: string, input: ScimGroupInput): Promise<ScimGroupResource> {
    const group = await this.requireGroup(tenant, id);
    await this.db
      .update(schema.scimGroups)
      .set({ displayName: input.displayName, externalId: input.externalId ?? group.externalId, updatedAt: new Date() })
      .where(eq(schema.scimGroups.id, group.id));
    await this.db.delete(schema.scimGroupMembers).where(eq(schema.scimGroupMembers.groupId, group.id));
    if (input.members.length > 0) await this.addMembers(tenant, group.id, input.members);
    await this.audit(tenant, 'scim.group.replaced', group.id);
    return this.toResource(await this.requireGroup(tenant, id));
  }

  async patch(tenant: ScimTenant, id: string, operations: ScimPatchOperation[]): Promise<ScimGroupResource> {
    const group = await this.requireGroup(tenant, id);
    for (const operation of operations) {
      const path = operation.path?.toLowerCase() ?? '';
      /** Entra removes single members with the filter form `members[value eq "<id>"]`. */
      const filtered = path.match(/^members\[value eq "([^"]+)"\]$/);

      if ((operation.op === 'add' || operation.op === 'replace') && path === 'members') {
        if (operation.op === 'replace') await this.db.delete(schema.scimGroupMembers).where(eq(schema.scimGroupMembers.groupId, group.id));
        const values = Array.isArray(operation.value) ? operation.value : [operation.value];
        await this.addMembers(
          tenant,
          group.id,
          values.map(member => asString(asRecord(member, 'member')['value'], 'member.value')),
        );
      } else if (operation.op === 'replace' && (path === 'displayname' || path === '')) {
        const displayName = path === '' ? asString(asRecord(operation.value, 'value')['displayName'], 'displayName') : asString(operation.value, 'displayName');
        await this.db.update(schema.scimGroups).set({ displayName, updatedAt: new Date() }).where(eq(schema.scimGroups.id, group.id));
      } else if (operation.op === 'remove' && filtered) {
        await this.db.delete(schema.scimGroupMembers).where(and(eq(schema.scimGroupMembers.groupId, group.id), eq(schema.scimGroupMembers.directoryId, filtered[1] as string)));
      } else if (operation.op === 'remove' && path === 'members') {
        const values = Array.isArray(operation.value) ? operation.value : operation.value === undefined ? [] : [operation.value];
        if (values.length === 0) await this.db.delete(schema.scimGroupMembers).where(eq(schema.scimGroupMembers.groupId, group.id));
        else {
          const ids = values.map(member => asString(asRecord(member, 'member')['value'], 'member.value'));
          await this.db.delete(schema.scimGroupMembers).where(and(eq(schema.scimGroupMembers.groupId, group.id), inArray(schema.scimGroupMembers.directoryId, ids)));
        }
      } else {
        throw new ScimError(400, `Unsupported PATCH operation '${operation.op}' at path '${operation.path ?? ''}'`, 'invalidPath');
      }
    }
    await this.audit(tenant, 'scim.group.patched', group.id);
    return this.toResource(await this.requireGroup(tenant, id));
  }

  async remove(tenant: ScimTenant, id: string): Promise<void> {
    const group = await this.requireGroup(tenant, id);
    await this.db.delete(schema.scimGroups).where(eq(schema.scimGroups.id, group.id));
    await this.audit(tenant, 'scim.group.deleted', group.id);
  }

  private async requireGroup(tenant: ScimTenant, id: string): Promise<ScimGroup> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const group = isUuid
      ? await this.db.query.scimGroups.findFirst({ where: and(eq(schema.scimGroups.id, id), eq(schema.scimGroups.organisationId, tenant.organisationId)) })
      : undefined;
    if (!group) throw new ScimError(404, 'Resource not found');
    return group;
  }

  /** Members must be directory entries of the same tenant — platform user ids never appear on this surface. */
  private async addMembers(tenant: ScimTenant, groupId: string, directoryIds: string[]): Promise<void> {
    const unique = [...new Set(directoryIds)];
    const entries = await this.db.query.scimDirectory.findMany({
      where: and(eq(schema.scimDirectory.organisationId, tenant.organisationId), inArray(schema.scimDirectory.id, unique)),
    });
    if (entries.length !== unique.length) throw new ScimError(400, 'One or more members are not resources of this tenant', 'invalidValue');
    await this.db
      .insert(schema.scimGroupMembers)
      .values(unique.map(directoryId => ({ groupId, directoryId })))
      .onConflictDoNothing();
  }

  private async audit(tenant: ScimTenant, action: string, groupId: string): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'SERVICE_ACCOUNT',
      actorId: tenant.clientId,
      organisationId: tenant.organisationId.toString(),
      targetType: 'scim_group',
      targetId: groupId,
    });
  }

  private async toResource(group: ScimGroup): Promise<ScimGroupResource> {
    const members = await this.db
      .select({ id: schema.scimDirectory.id, userName: schema.scimDirectory.userName })
      .from(schema.scimGroupMembers)
      .innerJoin(schema.scimDirectory, eq(schema.scimGroupMembers.directoryId, schema.scimDirectory.id))
      .where(eq(schema.scimGroupMembers.groupId, group.id));

    return {
      schemas: [GROUP_SCHEMA],
      id: group.id,
      externalId: group.externalId ?? undefined,
      displayName: group.displayName,
      members: members.map(member => ({ value: member.id, display: member.userName })),
      meta: {
        resourceType: 'Group',
        created: group.createdAt.toISOString(),
        lastModified: group.updatedAt.toISOString(),
        location: `${this.issuer}/scim/v2/Groups/${group.id}`,
      },
    };
  }
}

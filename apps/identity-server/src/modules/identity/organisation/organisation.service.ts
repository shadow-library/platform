/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { and, eq, isNotNull } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

type OrgWriter = Pick<PrimaryDatabase, 'insert'>;

export interface CreateTeamInput {
  name: string;
  slug?: string;
}

export interface MemberDetail {
  member: Organisation.Member;
  email: string | null;
}

export interface MembershipWithOrganisation {
  membership: Organisation.Member;
  organisation: Organisation;
}

/**
 * Declaring the constants
 *
 * Org-level roles govern organisation administration only (membership, domains, lifecycle);
 * product permissions stay on the PDP's `role_assignments`, keeping exactly one authorization
 * system (DB §4). Absent orgs and foreign orgs answer identically (ORG_001) so organisation ids
 * cannot be probed.
 */
const ROLE_RANK: Record<Organisation.MemberRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;

@Injectable()
export class OrganisationService {
  private readonly logger = Logger.getLogger(APP_NAME, OrganisationService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Creates a user's synthetic personal workspace and its owner membership (D-1). Accepts the
   * surrounding transaction so the workspace is committed atomically with the user.
   */
  async createPersonalWorkspace(userId: bigint, name: string, executor: OrgWriter = this.db): Promise<Organisation> {
    const slug = this.generateSlug(name);
    const [organisation] = await executor.insert(schema.organisations).values({ name, slug, type: 'PERSONAL', status: 'ACTIVE' }).returning();
    if (!organisation) throw new Error('Failed to create personal workspace');
    await executor.insert(schema.organisationMembers).values({ organisationId: organisation.id, userId, role: 'OWNER', isDefault: true });
    return organisation;
  }

  /** Creates a team organisation with the creator as its first owner. */
  async createTeam(userId: bigint, input: CreateTeamInput): Promise<Organisation> {
    if (input.slug && !SLUG_PATTERN.test(input.slug)) throw new ServerError(AppErrorCode.ORG_006);
    const slug = input.slug ?? this.generateSlug(input.name);
    return this.db.transaction(async tx => {
      const [organisation] = await tx
        .insert(schema.organisations)
        .values({ name: input.name, slug, type: 'TEAM', status: 'ACTIVE' })
        .onConflictDoNothing({ target: schema.organisations.slug })
        .returning();
      if (!organisation) throw new ServerError(AppErrorCode.ORG_006);
      await tx.insert(schema.organisationMembers).values({ organisationId: organisation.id, userId, role: 'OWNER' });
      this.logger.info('Created team organisation', { organisationId: organisation.id, userId });
      return organisation;
    });
  }

  /**
   * Idempotently provisions a named team organisation. Organisation names carry no unique
   * constraint, so this must only be called from single-flight contexts (bootstrap) where a
   * concurrent duplicate insert cannot occur.
   */
  async ensureTeamOrganisation(name: string): Promise<Organisation> {
    const existing = await this.findTeamByName(name);
    if (existing) return existing;
    const [organisation] = await this.db
      .insert(schema.organisations)
      .values({ name, slug: this.generateSlug(name), type: 'TEAM', status: 'ACTIVE' })
      .returning();
    if (!organisation) throw new Error(`Failed to create organisation '${name}'`);
    this.logger.info('Created team organisation', { organisationId: organisation.id, name });
    return organisation;
  }

  async findTeamByName(name: string): Promise<Organisation | null> {
    const organisation = await this.db.query.organisations.findFirst({ where: and(eq(schema.organisations.name, name), eq(schema.organisations.type, 'TEAM')) });
    return organisation ?? null;
  }

  /** Idempotently adds a member; an existing membership (any role) is left untouched. */
  async ensureMember(organisationId: bigint, userId: bigint, role: Organisation.MemberRole): Promise<void> {
    await this.db.insert(schema.organisationMembers).values({ organisationId, userId, role }).onConflictDoNothing();
  }

  async getMembership(userId: bigint, organisationId: bigint): Promise<Organisation.Member | null> {
    const membership = await this.db.query.organisationMembers.findFirst({
      where: and(eq(schema.organisationMembers.userId, userId), eq(schema.organisationMembers.organisationId, organisationId)),
    });
    return membership ?? null;
  }

  /** Throws unless the user is a member of the organisation; the guard for every org-scoped read. */
  async assertMember(userId: bigint, organisationId: bigint): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw new ServerError(AppErrorCode.ORG_001);
    return membership;
  }

  /**
   * The guard for team administration: the caller must belong to a live TEAM organisation with at
   * least the given role. Membership is checked before anything else so absent and foreign orgs
   * are indistinguishable; personal workspaces reject administration outright (D-1).
   */
  async requireRole(userId: bigint, organisationId: bigint, minimumRole: Organisation.MemberRole): Promise<MembershipWithOrganisation> {
    const membership = await this.assertMember(userId, organisationId);
    const organisation = await this.getById(organisationId);
    if (!organisation || organisation.status === 'DELETED') throw new ServerError(AppErrorCode.ORG_001);
    if (organisation.type === 'PERSONAL') throw new ServerError(AppErrorCode.ORG_003);
    if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) throw new ServerError(AppErrorCode.ORG_007);
    return { membership, organisation };
  }

  async rename(organisationId: bigint, name: string): Promise<void> {
    await this.db.update(schema.organisations).set({ name, updatedAt: new Date() }).where(eq(schema.organisations.id, organisationId));
  }

  /** Soft-deletes the organisation; role-assignment revocation and auditing ride on the caller. */
  async softDelete(organisationId: bigint): Promise<void> {
    await this.db.update(schema.organisations).set({ status: 'DELETED', deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.organisations.id, organisationId));
  }

  /** Changes a member's org role; refuses to demote the last remaining owner. */
  async updateMemberRole(organisationId: bigint, userId: bigint, role: Organisation.MemberRole): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw new ServerError(AppErrorCode.USR_001);
    if (membership.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(organisationId, userId);
    const [updated] = await this.db
      .update(schema.organisationMembers)
      .set({ role })
      .where(and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.userId, userId)))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.USR_001);
    return updated;
  }

  /** Removes a member; refuses to remove the last remaining owner. */
  async removeMember(organisationId: bigint, userId: bigint): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw new ServerError(AppErrorCode.USR_001);
    if (membership.role === 'OWNER') await this.assertNotLastOwner(organisationId, userId);
    await this.db.delete(schema.organisationMembers).where(and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.userId, userId)));
    return membership;
  }

  private async assertNotLastOwner(organisationId: bigint, exceptUserId: bigint): Promise<void> {
    const owners = await this.db.query.organisationMembers.findMany({
      where: and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.role, 'OWNER')),
    });
    if (!owners.some(owner => owner.userId !== exceptUserId)) throw new ServerError(AppErrorCode.ORG_004);
  }

  /** Lists the members of an organisation, but only for a caller who belongs to it (tenant scope). */
  async listMembers(callerUserId: bigint, organisationId: bigint): Promise<Organisation.Member[]> {
    await this.assertMember(callerUserId, organisationId);
    return this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
  }

  /** Members with their primary verified email, for the member-management surface. */
  async listMembersDetailed(organisationId: bigint): Promise<MemberDetail[]> {
    const members = await this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
    return Promise.all(members.map(async member => ({ member, email: await this.getPrimaryVerifiedEmail(member.userId) })));
  }

  async listMembershipsForUser(userId: bigint): Promise<Organisation.Member[]> {
    return this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.userId, userId) });
  }

  /** Memberships joined with their organisations, for the self-service organisations list. */
  async listOrganisationsForUser(userId: bigint): Promise<MembershipWithOrganisation[]> {
    const memberships = await this.listMembershipsForUser(userId);
    const detailed = await Promise.all(
      memberships.map(async membership => {
        const organisation = await this.getById(membership.organisationId);
        return organisation ? { membership, organisation } : null;
      }),
    );
    return detailed.filter(entry => entry !== null);
  }

  async getById(organisationId: bigint): Promise<Organisation | null> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId) });
    return organisation ?? null;
  }

  /**
   * The user's primary verified email, resolved directly against the schema: `UserModule` imports
   * this module for workspace provisioning, so importing `UserEmailService` back would be a cycle.
   */
  async getPrimaryVerifiedEmail(userId: bigint): Promise<string | null> {
    const emails = await this.db.query.userEmails.findMany({ where: and(eq(schema.userEmails.userId, userId), isNotNull(schema.userEmails.verifiedAt)) });
    const primary = emails.find(email => email.isPrimary) ?? emails[0];
    return primary?.emailId ?? null;
  }

  /** Derives a URL-safe slug from the name; a random suffix keeps generated slugs collision-free. */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const suffix = randomBytes(3).toString('hex');
    return base ? `${base}-${suffix}` : `org-${suffix}`;
  }
}

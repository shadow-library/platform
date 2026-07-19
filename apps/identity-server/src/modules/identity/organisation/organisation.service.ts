/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { and, eq, isNotNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type ValidatedSession } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

import { InvitationService } from './invitation.service';

/**
 * Defining types
 */

type OrgWriter = Pick<PrimaryDatabase, 'insert'>;

export interface CreateTeamInput {
  name: string;
  slug?: string;
}

interface CallerContext {
  session: ValidatedSession;
  ip: string;
}

export interface MemberListItem {
  userId: bigint;
  role: Organisation.MemberRole;
  email?: string;
  joinedAt: Date;
}

export interface MyOrganisationListItem {
  id: bigint;
  slug: string;
  name: string;
  type: Organisation.Type;
  status: Organisation.Status;
  role: Organisation.MemberRole;
  isDefault: boolean;
  joinedAt: Date;
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

const ROLE_CHANGED_TEMPLATE = 'organisation-role-changed';
const MEMBER_REMOVED_TEMPLATE = 'organisation-member-removed';

@Injectable()
export class OrganisationService {
  private readonly logger = Logger.getLogger(APP_NAME, OrganisationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly invitationService: InvitationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private isElevated(session: ValidatedSession): boolean {
    return session.elevatedUntil !== null && session.elevatedUntil > Date.now();
  }

  private async audit(caller: CallerContext, organisationId: bigint, action: string, targetType?: string, targetId?: string): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: caller.session.userId.toString(),
      organisationId: organisationId.toString(),
      targetType,
      targetId,
      ipAddress: caller.ip,
    });
  }

  /**
   * Creates a user's synthetic personal workspace and its owner membership (D-1). Accepts the
   * surrounding transaction so the workspace is committed atomically with the user.
   */
  async createPersonalWorkspace(userId: bigint, name: string, executor: OrgWriter = this.db): Promise<Organisation> {
    const slug = this.generateSlug(name);
    const [organisation] = await executor.insert(schema.organisations).values({ name, slug, type: 'PERSONAL', status: 'ACTIVE' }).returning();
    if (!organisation) {
      this.logger.error('failed to create personal workspace', { userId });
      throw AppError.internal('Failed to create personal workspace');
    }
    await executor.insert(schema.organisationMembers).values({ organisationId: organisation.id, userId, role: 'OWNER', isDefault: true });
    this.logger.debug('created personal workspace', { organisationId: organisation.id, userId });
    return organisation;
  }

  /** Creates a team organisation with the creator as its first owner. */
  async createTeam(userId: bigint, input: CreateTeamInput): Promise<Organisation> {
    if (input.slug && !SLUG_PATTERN.test(input.slug)) throw AppErrorCode.ORG_006.create();
    const slug = input.slug ?? this.generateSlug(input.name);
    return this.db.transaction(async tx => {
      const [organisation] = await tx
        .insert(schema.organisations)
        .values({ name: input.name, slug, type: 'TEAM', status: 'ACTIVE' })
        .onConflictDoNothing({ target: schema.organisations.slug })
        .returning();
      if (!organisation) throw AppErrorCode.ORG_006.create();
      await tx.insert(schema.organisationMembers).values({ organisationId: organisation.id, userId, role: 'OWNER' });
      this.logger.info('created team organisation', { organisationId: organisation.id, userId });
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
    if (!organisation) throw AppError.internal(`Failed to create organisation '${name}'`);
    this.logger.info('created team organisation', { organisationId: organisation.id, name });
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
    if (!membership) throw AppErrorCode.ORG_001.create();
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
    if (!organisation || organisation.status === 'DELETED') throw AppErrorCode.ORG_001.create();
    if (organisation.type === 'PERSONAL') throw AppErrorCode.ORG_003.create();
    if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
      this.logger.debug('organisation role requirement not met', { userId, organisationId, role: membership.role, minimumRole });
      throw AppErrorCode.ORG_007.create();
    }
    return { membership, organisation };
  }

  async rename(organisationId: bigint, name: string): Promise<void> {
    await this.db.update(schema.organisations).set({ name, updatedAt: new Date() }).where(eq(schema.organisations.id, organisationId));
    this.logger.info('renamed organisation', { organisationId, name });
  }

  /** Soft-deletes the organisation; role-assignment revocation and auditing ride on the caller. */
  async softDelete(organisationId: bigint): Promise<void> {
    await this.db.update(schema.organisations).set({ status: 'DELETED', deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.organisations.id, organisationId));
    this.logger.info('soft-deleted organisation', { organisationId });
  }

  /* --------------------------- caller-facing orchestration --------------------------- */

  async createOrganisation(caller: CallerContext, input: CreateTeamInput): Promise<Organisation> {
    const organisation = await this.createTeam(caller.session.userId, input);
    await this.audit(caller, organisation.id, 'org.created');
    return organisation;
  }

  /** A live organisation for a caller the guard already confirmed as a member. */
  async getOrganisation(organisationId: bigint): Promise<Organisation> {
    const organisation = await this.getById(organisationId);
    if (!organisation || organisation.status === 'DELETED') throw AppErrorCode.ORG_001.create();
    return organisation;
  }

  async renameOrganisation(caller: CallerContext, organisation: Organisation, name: string): Promise<Organisation> {
    await this.rename(organisation.id, name);
    await this.audit(caller, organisation.id, 'org.renamed');
    return { ...organisation, name };
  }

  /** Deletion revokes every product-role grant scoped to the org so no PDP decision survives it. */
  async deleteOrganisation(caller: CallerContext, organisationId: bigint): Promise<void> {
    await this.softDelete(organisationId);
    await this.policyDecisionService.revokeAllForOrganisation(organisationId.toString());
    await this.audit(caller, organisationId, 'org.deleted');
  }

  /** Members flattened for the member-management surface, with native id/date the serializer converts. */
  async listMemberItems(organisationId: bigint): Promise<MemberListItem[]> {
    const members = await this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
    return Promise.all(members.map(async member => ({ userId: member.userId, role: member.role, email: (await this.getPrimaryVerifiedEmail(member.userId)) ?? undefined, joinedAt: member.joinedAt })));
  }

  /**
   * Changes a member's org role. Promoting to OWNER is owner-only and step-up-gated; an owner target
   * is owner-only and AAL2-gated; otherwise a caller only administers members ranked strictly below
   * them. Last-owner protection rides on `updateMemberRole`.
   */
  async changeMemberRole(caller: CallerContext, callerMembership: Organisation.Member, organisationId: bigint, targetUserId: bigint, role: Organisation.MemberRole): Promise<void> {
    if (role === 'OWNER') {
      if (!this.isElevated(caller.session)) throw AppErrorCode.AUTH_006.create();
      if (callerMembership.role !== 'OWNER') throw AppErrorCode.ORG_007.create();
    }
    const target = await this.getMembership(targetUserId, organisationId);
    if (!target) throw AppErrorCode.USR_001.create();
    if (target.role === 'OWNER' && callerMembership.role !== 'OWNER') throw AppErrorCode.ORG_007.create();
    if (target.role === 'OWNER' && caller.session.aal !== 'AAL2') throw AppErrorCode.AUTH_006.create();
    if (callerMembership.role !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[callerMembership.role]) throw AppErrorCode.ORG_007.create();

    await this.updateMemberRole(organisationId, targetUserId, role);
    await this.audit(caller, organisationId, 'org.member_role_changed', 'user', targetUserId.toString());
    const email = await this.getPrimaryVerifiedEmail(targetUserId);
    if (email) await this.notificationService.enqueue({ templateKey: ROLE_CHANGED_TEMPLATE, recipients: { email }, payload: { role } });
  }

  async removeOrganisationMember(caller: CallerContext, callerMembership: Organisation.Member, organisationId: bigint, targetUserId: bigint): Promise<void> {
    const target = await this.getMembership(targetUserId, organisationId);
    if (!target) throw AppErrorCode.USR_001.create();
    if (target.userId === caller.session.userId) throw AppErrorCode.ORG_007.create();
    if (target.role === 'OWNER' && (callerMembership.role !== 'OWNER' || caller.session.aal !== 'AAL2')) throw (callerMembership.role !== 'OWNER' ? AppErrorCode.ORG_007 : AppErrorCode.AUTH_006).create();
    if (callerMembership.role !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[callerMembership.role]) throw AppErrorCode.ORG_007.create();

    await this.removeMember(organisationId, targetUserId);
    await this.policyDecisionService.revokeAllForPrincipalInOrganisation({ type: 'USER', id: targetUserId.toString() }, organisationId.toString());
    await this.audit(caller, organisationId, 'org.member_removed', 'user', targetUserId.toString());
    const email = await this.getPrimaryVerifiedEmail(targetUserId);
    if (email) await this.notificationService.enqueue({ templateKey: MEMBER_REMOVED_TEMPLATE, recipients: { email }, payload: {} });
  }

  async listPendingInvitations(organisationId: bigint): Promise<Organisation.Invitation[]> {
    return this.invitationService.listPending(organisationId);
  }

  async inviteMember(caller: CallerContext, organisation: Organisation, email: string, role: Exclude<Organisation.MemberRole, 'OWNER'>): Promise<void> {
    const invitation = await this.invitationService.invite({ organisation, email, role, invitedBy: caller.session.userId });
    await this.audit(caller, organisation.id, 'org.invitation_sent', 'organisation_invitation', invitation.id.toString());
  }

  async revokeInvitation(caller: CallerContext, organisationId: bigint, invitationId: bigint): Promise<void> {
    const invitation = await this.invitationService.revoke(organisationId, invitationId);
    await this.audit(caller, organisationId, 'org.invitation_revoked', 'organisation_invitation', invitation.id.toString());
  }

  /* --------------------------- self-service membership --------------------------- */

  /** The caller's live organisations flattened with their role, for the self-service list. */
  async listMyOrganisationItems(userId: bigint): Promise<MyOrganisationListItem[]> {
    const entries = await this.listOrganisationsForUser(userId);
    return entries
      .filter(entry => entry.organisation.status !== 'DELETED')
      .map(({ membership, organisation }) => ({
        id: organisation.id,
        slug: organisation.slug,
        name: organisation.name,
        type: organisation.type,
        status: organisation.status,
        role: membership.role,
        isDefault: membership.isDefault,
        joinedAt: membership.joinedAt,
      }));
  }

  /** Leaving is removal of oneself: same last-owner protection, same grant revocation. */
  async leaveOrganisation(caller: CallerContext, organisationId: bigint): Promise<void> {
    const membership = await this.getMembership(caller.session.userId, organisationId);
    const organisation = await this.getById(organisationId);
    if (!membership || !organisation) throw AppErrorCode.ORG_001.create();
    if (organisation.type === 'PERSONAL') throw AppErrorCode.ORG_003.create();
    await this.removeMember(organisationId, caller.session.userId);
    await this.policyDecisionService.revokeAllForPrincipalInOrganisation({ type: 'USER', id: caller.session.userId.toString() }, organisationId.toString());
    await this.audit(caller, organisationId, 'org.member_left');
  }

  async acceptInvitation(caller: CallerContext, token: string): Promise<Organisation> {
    const { invitation, organisation } = await this.invitationService.accept(caller.session.userId, token);
    await this.audit(caller, organisation.id, 'org.invitation_accepted', 'organisation_invitation', invitation.id.toString());
    return organisation;
  }

  async declineInvitation(caller: CallerContext, token: string): Promise<void> {
    const invitation = await this.invitationService.decline(caller.session.userId, token);
    await this.audit(caller, invitation.organisationId, 'org.invitation_declined', 'organisation_invitation', invitation.id.toString());
  }

  /** Changes a member's org role; refuses to demote the last remaining owner. */
  async updateMemberRole(organisationId: bigint, userId: bigint, role: Organisation.MemberRole): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw AppErrorCode.USR_001.create();
    if (membership.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(organisationId, userId);
    const [updated] = await this.db
      .update(schema.organisationMembers)
      .set({ role })
      .where(and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.userId, userId)))
      .returning();
    if (!updated) throw AppErrorCode.USR_001.create();
    this.logger.info('updated member role', { organisationId, userId, role });
    return updated;
  }

  /** Removes a member; refuses to remove the last remaining owner. */
  async removeMember(organisationId: bigint, userId: bigint): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw AppErrorCode.USR_001.create();
    if (membership.role === 'OWNER') await this.assertNotLastOwner(organisationId, userId);
    await this.db.delete(schema.organisationMembers).where(and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.userId, userId)));
    this.logger.info('removed organisation member', { organisationId, userId, previousRole: membership.role });
    return membership;
  }

  private async assertNotLastOwner(organisationId: bigint, exceptUserId: bigint): Promise<void> {
    const owners = await this.db.query.organisationMembers.findMany({
      where: and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.role, 'OWNER')),
    });
    if (!owners.some(owner => owner.userId !== exceptUserId)) {
      this.logger.warn('last-owner protection triggered: refusing to remove or demote the only owner', { organisationId, userId: exceptUserId });
      throw AppErrorCode.ORG_004.create();
    }
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

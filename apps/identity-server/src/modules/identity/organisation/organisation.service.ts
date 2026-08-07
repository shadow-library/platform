import { randomBytes } from 'node:crypto';

import { and, eq, isNotNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type ValidatedSession } from '@server/modules/auth/session';
import { RefreshTokenService } from '@server/modules/auth/token';
import { PolicyDecisionService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

import { InvitationService } from './invitation.service';

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
  status: Organisation.MemberStatus;
  statusReason?: string;
  statusUntil?: Date;
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

export interface MemberStatusHold {
  reason?: string;
  until?: Date;
}

export interface MembershipWithOrganisation {
  membership: Organisation.Member;
  organisation: Organisation;
}

const ROLE_RANK: Record<Organisation.MemberRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;

const ROLE_CHANGED_TEMPLATE = 'organisation-role-changed';
const MEMBER_REMOVED_TEMPLATE = 'organisation-member-removed';
const MEMBER_STATUS_TEMPLATE = 'organisation-member-status-changed';

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
    private readonly refreshTokenService: RefreshTokenService,
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

  async assertActiveTeam(organisationId: string): Promise<Organisation> {
    if (!/^\d+$/.test(organisationId)) throw AppErrorCode.ORG_002.create();
    const organisation = await this.getById(BigInt(organisationId));
    if (!organisation || organisation.status !== 'ACTIVE') throw AppErrorCode.ORG_002.create();
    if (organisation.type !== 'TEAM') throw AppErrorCode.ORG_003.create();
    return organisation;
  }

  async ensureMember(organisationId: bigint, userId: bigint, role: Organisation.MemberRole): Promise<void> {
    await this.db.insert(schema.organisationMembers).values({ organisationId, userId, role }).onConflictDoNothing();
  }

  async getMembership(userId: bigint, organisationId: bigint): Promise<Organisation.Member | null> {
    const membership = await this.db.query.organisationMembers.findFirst({
      where: and(eq(schema.organisationMembers.userId, userId), eq(schema.organisationMembers.organisationId, organisationId)),
    });
    return membership ?? null;
  }

  async assertMember(userId: bigint, organisationId: bigint): Promise<Organisation.Member> {
    const membership = await this.getMembership(userId, organisationId);
    if (!membership) throw AppErrorCode.ORG_001.create();
    if ((await this.resolveMemberStatus(membership)) !== 'ACTIVE') throw AppErrorCode.ORG_001.create();
    return membership;
  }

  private async resolveMemberStatus(membership: Organisation.Member): Promise<Organisation.MemberStatus> {
    if (membership.status !== 'SUSPENDED' || !membership.statusUntil || membership.statusUntil.getTime() > Date.now()) return membership.status;
    await this.db
      .update(schema.organisationMembers)
      .set({ status: 'ACTIVE', statusReason: null, statusChangedAt: new Date(), statusUntil: null })
      .where(and(eq(schema.organisationMembers.organisationId, membership.organisationId), eq(schema.organisationMembers.userId, membership.userId)));
    this.logger.info('membership suspension lapsed, access restored', { organisationId: membership.organisationId, userId: membership.userId });
    membership.status = 'ACTIVE';
    return 'ACTIVE';
  }

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

  async softDelete(organisationId: bigint): Promise<void> {
    await this.db.update(schema.organisations).set({ status: 'DELETED', deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.organisations.id, organisationId));
    this.logger.info('soft-deleted organisation', { organisationId });
  }

  async createOrganisation(caller: CallerContext, input: CreateTeamInput): Promise<Organisation> {
    const organisation = await this.createTeam(caller.session.userId, input);
    await this.audit(caller, organisation.id, 'org.created');
    return organisation;
  }

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

  async deleteOrganisation(caller: CallerContext, organisationId: bigint): Promise<void> {
    await this.softDelete(organisationId);
    await this.policyDecisionService.revokeAllForOrganisation(organisationId.toString());
    await this.audit(caller, organisationId, 'org.deleted');
  }

  async listMemberItems(organisationId: bigint): Promise<MemberListItem[]> {
    const members = await this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
    return Promise.all(
      members.map(async member => ({
        userId: member.userId,
        role: member.role,
        status: await this.resolveMemberStatus(member),
        statusReason: member.statusReason ?? undefined,
        statusUntil: member.statusUntil ?? undefined,
        email: (await this.getPrimaryVerifiedEmail(member.userId)) ?? undefined,
        joinedAt: member.joinedAt,
      })),
    );
  }

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

  /**
   * Pauses or bars a member inside one organisation. This is deliberately org-scoped: `users.status` is global, so a
   * tenant administrator setting it could shut an adopted personal account out of its own workspace and every other
   * tenant. The same rank, owner and last-owner protections as removal apply — suspending the only owner would strand
   * the organisation with nobody able to administer it.
   */
  async changeMemberStatus(
    caller: CallerContext,
    callerMembership: Organisation.Member,
    organisationId: bigint,
    targetUserId: bigint,
    status: Organisation.MemberStatus,
    hold: MemberStatusHold = {},
  ): Promise<void> {
    const target = await this.getMembership(targetUserId, organisationId);
    if (!target) throw AppErrorCode.USR_001.create();
    if (target.userId === caller.session.userId) throw AppErrorCode.ORG_007.create();
    if (target.role === 'OWNER' && (callerMembership.role !== 'OWNER' || caller.session.aal !== 'AAL2'))
      throw (callerMembership.role !== 'OWNER' ? AppErrorCode.ORG_007 : AppErrorCode.AUTH_006).create();
    if (callerMembership.role !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[callerMembership.role]) throw AppErrorCode.ORG_007.create();
    if (status !== 'ACTIVE' && target.role === 'OWNER') await this.assertNotLastOwner(organisationId, targetUserId);

    const restored = status === 'ACTIVE';
    await this.db
      .update(schema.organisationMembers)
      .set({
        status,
        statusReason: restored ? null : (hold.reason ?? null),
        statusChangedAt: new Date(),
        statusUntil: restored ? null : (hold.until ?? null),
      })
      .where(and(eq(schema.organisationMembers.organisationId, organisationId), eq(schema.organisationMembers.userId, targetUserId)));

    if (!restored) {
      await this.policyDecisionService.revokeAllForPrincipalInOrganisation({ type: 'USER', id: targetUserId.toString() }, organisationId.toString());
      await this.refreshTokenService.revokeForUserOrganisation(targetUserId, organisationId);
    }
    await this.audit(caller, organisationId, restored ? 'org.member_reinstated' : `org.member_${status.toLowerCase()}`, 'user', targetUserId.toString());
    const email = await this.getPrimaryVerifiedEmail(targetUserId);
    if (email) await this.notificationService.enqueue({ templateKey: MEMBER_STATUS_TEMPLATE, recipients: { email }, payload: { status, reason: hold.reason ?? null } });
  }

  async removeOrganisationMember(caller: CallerContext, callerMembership: Organisation.Member, organisationId: bigint, targetUserId: bigint): Promise<void> {
    const target = await this.getMembership(targetUserId, organisationId);
    if (!target) throw AppErrorCode.USR_001.create();
    if (target.userId === caller.session.userId) throw AppErrorCode.ORG_007.create();
    if (target.role === 'OWNER' && (callerMembership.role !== 'OWNER' || caller.session.aal !== 'AAL2'))
      throw (callerMembership.role !== 'OWNER' ? AppErrorCode.ORG_007 : AppErrorCode.AUTH_006).create();
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

  async listMembers(callerUserId: bigint, organisationId: bigint): Promise<Organisation.Member[]> {
    await this.assertMember(callerUserId, organisationId);
    return this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
  }

  async listMembersDetailed(organisationId: bigint): Promise<MemberDetail[]> {
    const members = await this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.organisationId, organisationId) });
    return Promise.all(members.map(async member => ({ member, email: await this.getPrimaryVerifiedEmail(member.userId) })));
  }

  async listMembershipsForUser(userId: bigint): Promise<Organisation.Member[]> {
    return this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.userId, userId) });
  }

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

  async getPrimaryVerifiedEmail(userId: bigint): Promise<string | null> {
    const emails = await this.db.query.userEmails.findMany({ where: and(eq(schema.userEmails.userId, userId), isNotNull(schema.userEmails.verifiedAt)) });
    const primary = emails.find(email => email.isPrimary) ?? emails[0];
    return primary?.emailId ?? null;
  }

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

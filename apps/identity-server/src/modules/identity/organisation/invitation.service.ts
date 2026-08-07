import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { RateLimiterService } from '@server/modules/infrastructure/security';

export interface InviteInput {
  organisation: Organisation;
  email: string;
  role: Exclude<Organisation.MemberRole, 'OWNER'>;
  invitedBy: bigint;
}

export interface AcceptedInvitation {
  invitation: Organisation.Invitation;
  organisation: Organisation;
}

const INVITATION_TTL_DAYS = 7;
const INVITE_TEMPLATE = 'organisation-invitation';
const INVITE_BUDGET = { bucket: 'org-invite', limit: 20, windowSeconds: 3600 };

@Injectable()
export class InvitationService {
  private readonly logger = Logger.getLogger(APP_NAME, InvitationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly notificationService: NotificationService,
    private readonly rateLimiterService: RateLimiterService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issues (or refreshes) the single live invitation for the address and queues its email. The
   * response never varies with account existence: an invitation row and email are produced either
   * way, and only delivery reveals anything — to the inbox owner alone (D-12).
   */
  async invite(input: InviteInput): Promise<Organisation.Invitation> {
    const organisationId = input.organisation.id;
    const decision = await this.rateLimiterService.consume(INVITE_BUDGET.bucket, organisationId.toString(), INVITE_BUDGET.limit, INVITE_BUDGET.windowSeconds);
    if (!decision.allowed) throw AppErrorCode.SEC_001.create();

    const email = input.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

    const invitation = await this.db.transaction(async tx => {
      await tx
        .update(schema.organisationInvitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.organisationInvitations.organisationId, organisationId), eq(schema.organisationInvitations.email, email), this.pendingCondition()));
      const created = await tx
        .insert(schema.organisationInvitations)
        .values({ organisationId, email, role: input.role, tokenHash: this.hashToken(token), invitedBy: input.invitedBy, expiresAt })
        .returning()
        .then(([row]) => row ?? throwError(AppError.internal('Failed to create invitation')));
      await this.notificationService.enqueue(
        { templateKey: INVITE_TEMPLATE, recipients: { email }, payload: { organisationName: input.organisation.name, role: input.role, token } },
        tx,
      );
      return created;
    });

    this.logger.info('Organisation invitation issued', { organisationId, invitationId: invitation.id });
    return invitation;
  }

  async listPending(organisationId: bigint): Promise<Organisation.Invitation[]> {
    return this.db.query.organisationInvitations.findMany({
      where: and(eq(schema.organisationInvitations.organisationId, organisationId), this.pendingCondition()),
    });
  }

  async revoke(organisationId: bigint, invitationId: bigint): Promise<Organisation.Invitation> {
    const [revoked] = await this.db
      .update(schema.organisationInvitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.organisationInvitations.id, invitationId), eq(schema.organisationInvitations.organisationId, organisationId), this.pendingCondition()))
      .returning();
    if (!revoked) throw AppErrorCode.ORG_005.create();
    return revoked;
  }

  async accept(userId: bigint, token: string): Promise<AcceptedInvitation> {
    const invitation = await this.resolvePending(userId, token);
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, invitation.organisationId) });
    if (!organisation || organisation.status !== 'ACTIVE' || organisation.type !== 'TEAM') throw AppErrorCode.ORG_005.create();

    await this.db.transaction(async tx => {
      await tx.update(schema.organisationInvitations).set({ acceptedAt: new Date() }).where(eq(schema.organisationInvitations.id, invitation.id));
      await tx.insert(schema.organisationMembers).values({ organisationId: invitation.organisationId, userId, role: invitation.role }).onConflictDoNothing();
    });
    this.logger.info('Organisation invitation accepted', { organisationId: invitation.organisationId, invitationId: invitation.id, userId });
    return { invitation, organisation };
  }

  async decline(userId: bigint, token: string): Promise<Organisation.Invitation> {
    const invitation = await this.resolvePending(userId, token);
    await this.db.update(schema.organisationInvitations).set({ declinedAt: new Date() }).where(eq(schema.organisationInvitations.id, invitation.id));
    return invitation;
  }

  private async resolvePending(userId: bigint, token: string): Promise<Organisation.Invitation> {
    const invitation = await this.db.query.organisationInvitations.findFirst({
      where: and(eq(schema.organisationInvitations.tokenHash, this.hashToken(token)), this.pendingCondition()),
    });
    if (!invitation || invitation.expiresAt.getTime() < Date.now()) throw AppErrorCode.ORG_005.create();

    const ownership = await this.db.query.userEmails.findFirst({
      where: and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, invitation.email), isNotNull(schema.userEmails.verifiedAt)),
    });
    if (!ownership) throw AppErrorCode.ORG_005.create();
    return invitation;
  }

  private pendingCondition() {
    return and(isNull(schema.organisationInvitations.acceptedAt), isNull(schema.organisationInvitations.declinedAt), isNull(schema.organisationInvitations.revokedAt));
  }
}

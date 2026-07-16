/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { SQL, and, count, desc, eq, ilike, inArray } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { MfaService, WebauthnService } from '@server/modules/auth/mfa';
import { SessionService } from '@server/modules/auth/session';
import { BackChannelLogoutService, RefreshTokenService } from '@server/modules/auth/token';
import { AuditService } from '@server/modules/infrastructure/audit';
import { AuditEvent, DatabaseService, PrimaryDatabase, User, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface UserSearchFilter {
  email?: string;
  status?: User.Status;
  offset: number;
  limit: number;
  sortOrder?: 'asc' | 'desc';
}

export interface UserSummary {
  id: bigint;
  username: string | null;
  status: User.Status;
  lockMode: User.LockMode;
  primaryEmail: string | null;
  createdAt: Date;
}

export interface UserSearchResult {
  items: UserSummary[];
  total: number;
}

export interface UserMfaStatus {
  totp: boolean;
  webauthn: boolean;
  passkeyCount: number;
}

export interface UserAdminDetail {
  user: User;
  emails: User.Email[];
  phones: User.Phone[];
  mfa: UserMfaStatus;
  activeSessionCount: number;
}

export interface AdminActionContext {
  actorId: string;
  organisationId: string;
}

/**
 * Declaring the constants
 *
 * Account-lifecycle operations for platform administrators (T-602). Every mutation revokes what a
 * hostile session could still use, is attributed to the acting administrator in the audit chain,
 * and never exposes credential material.
 */

@Injectable()
export class AdminUserService {
  private readonly logger = Logger.getLogger(APP_NAME, AdminUserService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly sessionService: SessionService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly backChannelLogoutService: BackChannelLogoutService,
    private readonly auditService: AuditService,
    private readonly mfaService: MfaService,
    private readonly webauthnService: WebauthnService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async search(filter: UserSearchFilter): Promise<UserSearchResult> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(schema.users.status, filter.status));
    if (filter.email) {
      const matches = this.db
        .select({ id: schema.userEmails.userId })
        .from(schema.userEmails)
        .where(ilike(schema.userEmails.emailId, `%${filter.email.toLowerCase()}%`));
      conditions.push(inArray(schema.users.id, matches));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [counted] = await this.db.select({ total: count() }).from(schema.users).where(where);
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(where)
      .orderBy(filter.sortOrder === 'desc' ? desc(schema.users.id) : schema.users.id)
      .limit(filter.limit)
      .offset(filter.offset);

    const userIds = rows.map(row => row.id);
    const emails =
      userIds.length > 0
        ? await this.db
            .select()
            .from(schema.userEmails)
            .where(and(inArray(schema.userEmails.userId, userIds), eq(schema.userEmails.isPrimary, true)))
        : [];
    const primaryByUser = new Map(emails.map(email => [email.userId, email.emailId]));

    return {
      total: counted?.total ?? 0,
      items: rows.map(row => ({
        id: row.id,
        username: row.username,
        status: row.status,
        lockMode: row.lockMode,
        primaryEmail: primaryByUser.get(row.id) ?? null,
        createdAt: row.createdAt,
      })),
    };
  }

  async getDetail(userId: bigint): Promise<UserAdminDetail> {
    const user = await this.requireUser(userId);
    const emails = await this.db.select().from(schema.userEmails).where(eq(schema.userEmails.userId, userId));
    const phones = await this.db.select().from(schema.userPhones).where(eq(schema.userPhones.userId, userId));
    const factors = await this.mfaService.getFactors(userId);
    const passkeys = await this.webauthnService.listForUser(userId);
    const sessions = await this.sessionService.listActiveForUser(userId);
    return { user, emails, phones, mfa: { totp: factors.totp, webauthn: factors.webauthn, passkeyCount: passkeys.length }, activeSessionCount: sessions.length };
  }

  /** A FULL lock also cuts every live credential; OTP_ONLY leaves sessions but blocks passwords. */
  async lock(userId: bigint, mode: Exclude<User.LockMode, 'NONE'>, until: Date | null, context: AdminActionContext): Promise<void> {
    await this.requireUser(userId);
    await this.db.update(schema.users).set({ lockMode: mode, lockedUntil: until, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    if (mode === 'FULL') await this.revokeAllAccess(userId);
    await this.record('admin.user.locked', userId, context, { mode, until });
  }

  async unlock(userId: bigint, context: AdminActionContext): Promise<void> {
    await this.requireUser(userId);
    await this.db.update(schema.users).set({ lockMode: 'NONE', lockedUntil: null, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    await this.record('admin.user.unlocked', userId, context);
  }

  /** Forces recovery at next login: flags the account and revokes everything currently issued. */
  async forcePasswordReset(userId: bigint, context: AdminActionContext): Promise<void> {
    await this.requireUser(userId);
    await this.db.update(schema.users).set({ passwordResetRequired: true, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    await this.revokeAllAccess(userId);
    await this.record('admin.user.password_reset_forced', userId, context);
  }

  async terminateSessions(userId: bigint, context: AdminActionContext): Promise<void> {
    await this.requireUser(userId);
    await this.revokeAllAccess(userId);
    await this.record('admin.user.sessions_terminated', userId, context);
  }

  async setStatus(userId: bigint, status: Extract<User.Status, 'ACTIVE' | 'DISABLED'>, context: AdminActionContext): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.status === 'CLOSED') throw AppErrorCode.USR_001.create();
    await this.db.update(schema.users).set({ status, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    if (status === 'DISABLED') await this.revokeAllAccess(userId);
    await this.record(status === 'DISABLED' ? 'admin.user.deactivated' : 'admin.user.reactivated', userId, context);
  }

  /**
   * Right-to-erasure (T-602): scrubs PII and credentials while keeping the numeric user skeleton so
   * the audit chain and foreign history stay intact. Irreversible by design.
   */
  async softDelete(userId: bigint, context: AdminActionContext): Promise<void> {
    const user = await this.requireUser(userId);
    await this.revokeAllAccess(userId);

    await this.db.transaction(async tx => {
      await tx.delete(schema.userEmails).where(eq(schema.userEmails.userId, userId));
      await tx.delete(schema.userPhones).where(eq(schema.userPhones.userId, userId));
      await tx.delete(schema.userAuthIdentities).where(eq(schema.userAuthIdentities.userId, userId));
      await tx.delete(schema.mfaEnrollments).where(eq(schema.mfaEnrollments.userId, userId));
      await tx.delete(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.userId, userId));
      await tx.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId));
      await tx.delete(schema.passwordHistory).where(eq(schema.passwordHistory.userId, userId));
      await tx
        .update(schema.userProfiles)
        .set({ firstName: null, lastName: null, displayName: null, gender: 'UNSPECIFIED', dateOfBirth: null, avatarUrl: null })
        .where(eq(schema.userProfiles.userId, userId));
      await tx.update(schema.users).set({ username: null, status: 'CLOSED', lockMode: 'FULL', lockedUntil: null, updatedAt: new Date() }).where(eq(schema.users.id, userId));
      if (user.personalOrganisationId) {
        await tx.update(schema.organisations).set({ status: 'DELETED', updatedAt: new Date() }).where(eq(schema.organisations.id, user.personalOrganisationId));
      }
    });
    await this.record('admin.user.deleted', userId, context);
    this.logger.warn('User soft-deleted and anonymised', { userId: userId.toString(), actorId: context.actorId });
  }

  async listAuditEvents(userId: bigint, limit = 50): Promise<AuditEvent[]> {
    await this.requireUser(userId);
    return this.auditService.listForSubject(userId.toString(), limit);
  }

  private async revokeAllAccess(userId: bigint): Promise<void> {
    const sessions = await this.sessionService.listActiveForUser(userId);
    await this.sessionService.terminateAllForUser(userId);
    await this.refreshTokenService.revokeAllForUser(userId);
    for (const session of sessions) await this.backChannelLogoutService.enqueueForSession(session.id, userId);
  }

  private async requireUser(userId: bigint): Promise<User> {
    const user = await this.db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (!user) throw AppErrorCode.USR_001.create();
    return user;
  }

  private async record(action: string, userId: bigint, context: AdminActionContext, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: context.actorId,
      targetType: 'user',
      targetId: userId.toString(),
      detail: detail ?? null,
    });
  }
}

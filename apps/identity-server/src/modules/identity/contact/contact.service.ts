/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { and, eq, isNotNull } from 'drizzle-orm';
import validator from 'validator';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME, ERROR_MESSAGES } from '@server/constants';
import { ChallengeService } from '@server/modules/auth/flow';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

/**
 * Defining types
 */

export interface ContactItem {
  value: string;
  isPrimary: boolean;
  verifiedAt: Date | null;
}

/**
 * Declaring the constants
 */
const EMAIL_VERIFY_TEMPLATE = 'user.email.verification';
const PHONE_VERIFY_TEMPLATE = 'user.phone.verification';
const CONTACT_CHANGED_TEMPLATE = 'user.contact.changed';

/**
 * Manages a user's additional email addresses and phone numbers. Adding an identifier issues an
 * OTP challenge to prove ownership; verified-only uniqueness means responses stay identical
 * whether or not the address belongs to another account (D-12).
 */
@Injectable()
export class ContactService {
  private readonly logger = Logger.getLogger(APP_NAME, ContactService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly challengeService: ChallengeService,
    private readonly userEmailService: UserEmailService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listEmails(userId: bigint): Promise<ContactItem[]> {
    const emails = await this.db.query.userEmails.findMany({ where: eq(schema.userEmails.userId, userId) });
    return emails.map(email => ({ value: email.emailId, isPrimary: email.isPrimary, verifiedAt: email.verifiedAt }));
  }

  async listPhones(userId: bigint): Promise<ContactItem[]> {
    const phones = await this.db.query.userPhones.findMany({ where: eq(schema.userPhones.userId, userId) });
    return phones.map(phone => ({ value: phone.phoneNumber, isPrimary: phone.isPrimary, verifiedAt: phone.verifiedAt }));
  }

  /**
   * Claims an email and issues a verification OTP. When the address is already verified by
   * another account no claim or challenge is created, but the response is indistinguishable —
   * no OTP is ever sent and verification later fails with the same generic error.
   */
  async addEmail(userId: bigint, email: string): Promise<string> {
    if (!validator.isEmail(email)) throw new ValidationError('email', ERROR_MESSAGES.INVALID_EMAIL);
    const emailId = email.toLowerCase();
    const verificationId = `contact_email_${randomUUID()}`;

    const takenElsewhere = await this.userEmailService.isEmailExists(emailId);
    const ownVerified = await this.db.query.userEmails.findFirst({
      where: and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, emailId), isNotNull(schema.userEmails.verifiedAt)),
    });
    if (takenElsewhere || ownVerified) return verificationId;

    await this.db.insert(schema.userEmails).values({ userId, emailId }).onConflictDoNothing();
    await this.challengeService.issue({ flowId: verificationId, type: 'EMAIL_OTP', target: emailId, userId, templateKey: EMAIL_VERIFY_TEMPLATE });
    this.logger.debug('email claim created', { userId });
    return verificationId;
  }

  async addPhone(userId: bigint, phone: string): Promise<string> {
    if (!validator.isMobilePhone(phone, 'any', { strictMode: true })) throw new ValidationError('phone', ERROR_MESSAGES.INVALID_PHONE_NUMBER);
    const verificationId = `contact_phone_${randomUUID()}`;

    const taken = await this.db.query.userPhones.findFirst({ where: and(eq(schema.userPhones.phoneNumber, phone), isNotNull(schema.userPhones.verifiedAt)) });
    if (taken) return verificationId;

    await this.db.insert(schema.userPhones).values({ userId, phoneNumber: phone }).onConflictDoNothing();
    await this.challengeService.issue({ flowId: verificationId, type: 'SMS_OTP', target: phone, userId, templateKey: PHONE_VERIFY_TEMPLATE });
    this.logger.debug('phone claim created', { userId });
    return verificationId;
  }

  /**
   * Confirms ownership via the OTP. The partial unique index is the last line of defence against
   * a concurrent verification of the same address; that race surfaces as the same generic
   * invalid-code error so nothing leaks about other accounts.
   */
  async verifyEmail(userId: bigint, verificationId: string, code: string): Promise<void> {
    const challenge = await this.challengeService.verifyAndGet(verificationId, code);
    if (!challenge || challenge.userId !== userId) throw new ServerError(AppErrorCode.MFA_002);

    const updated = await this.db
      .update(schema.userEmails)
      .set({ verifiedAt: new Date() })
      .where(and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, challenge.target)))
      .returning({ emailId: schema.userEmails.emailId })
      .catch(() => {
        throw new ServerError(AppErrorCode.MFA_002);
      });
    if (updated.length === 0) throw new ServerError(AppErrorCode.MFA_002);
    await this.auditService.record({ action: 'user.email_verified', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    this.logger.info('email verified', { userId });
  }

  async verifyPhone(userId: bigint, verificationId: string, code: string): Promise<void> {
    const challenge = await this.challengeService.verifyAndGet(verificationId, code);
    if (!challenge || challenge.userId !== userId) throw new ServerError(AppErrorCode.MFA_002);

    const updated = await this.db
      .update(schema.userPhones)
      .set({ verifiedAt: new Date() })
      .where(and(eq(schema.userPhones.userId, userId), eq(schema.userPhones.phoneNumber, challenge.target)))
      .returning({ phoneNumber: schema.userPhones.phoneNumber })
      .catch(() => {
        throw new ServerError(AppErrorCode.MFA_002);
      });
    if (updated.length === 0) throw new ServerError(AppErrorCode.MFA_002);
    await this.auditService.record({ action: 'user.phone_verified', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    this.logger.info('phone verified', { userId });
  }

  /** The primary email is the login identifier and notification target; it can never be removed. */
  async removeEmail(userId: bigint, email: string): Promise<void> {
    const emailId = email.toLowerCase();
    const row = await this.db.query.userEmails.findFirst({ where: and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, emailId)) });
    if (!row) throw new ServerError(AppErrorCode.USR_001);
    if (row.isPrimary) throw new ServerError(AppErrorCode.USR_005);

    await this.db.delete(schema.userEmails).where(and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, emailId)));
    await this.auditService.record({ action: 'user.email_removed', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notifyContactChange(userId, { action: 'removed', type: 'email' });
    this.logger.info('email removed', { userId });
  }

  async removePhone(userId: bigint, phone: string): Promise<void> {
    const row = await this.db.query.userPhones.findFirst({ where: and(eq(schema.userPhones.userId, userId), eq(schema.userPhones.phoneNumber, phone)) });
    if (!row) throw new ServerError(AppErrorCode.USR_001);
    if (row.isPrimary) throw new ServerError(AppErrorCode.USR_005);

    await this.db.delete(schema.userPhones).where(and(eq(schema.userPhones.userId, userId), eq(schema.userPhones.phoneNumber, phone)));
    await this.auditService.record({ action: 'user.phone_removed', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notifyContactChange(userId, { action: 'removed', type: 'phone' });
    this.logger.info('phone removed', { userId });
  }

  /** Primary can only move to a verified address so the login identifier is always provable. */
  async setPrimaryEmail(userId: bigint, email: string): Promise<void> {
    const emailId = email.toLowerCase();
    const target = await this.db.query.userEmails.findFirst({
      where: and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, emailId), isNotNull(schema.userEmails.verifiedAt)),
    });
    if (!target) throw new ServerError(AppErrorCode.USR_006);

    await this.db
      .transaction(async tx => {
        await tx
          .update(schema.userEmails)
          .set({ isPrimary: false })
          .where(and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.isPrimary, true)));
        await tx
          .update(schema.userEmails)
          .set({ isPrimary: true })
          .where(and(eq(schema.userEmails.userId, userId), eq(schema.userEmails.emailId, emailId)));
      })
      .catch(error => this.databaseService.translateError(error));
    await this.auditService.record({ action: 'user.primary_email_changed', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notifyContactChange(userId, { action: 'primary-changed', type: 'email' });
    this.logger.info('primary email changed', { userId });
  }

  async setPrimaryPhone(userId: bigint, phone: string): Promise<void> {
    const target = await this.db.query.userPhones.findFirst({
      where: and(eq(schema.userPhones.userId, userId), eq(schema.userPhones.phoneNumber, phone), isNotNull(schema.userPhones.verifiedAt)),
    });
    if (!target) throw new ServerError(AppErrorCode.USR_006);

    await this.db
      .transaction(async tx => {
        await tx
          .update(schema.userPhones)
          .set({ isPrimary: false })
          .where(and(eq(schema.userPhones.userId, userId), eq(schema.userPhones.isPrimary, true)));
        await tx
          .update(schema.userPhones)
          .set({ isPrimary: true })
          .where(and(eq(schema.userPhones.userId, userId), eq(schema.userPhones.phoneNumber, phone)));
      })
      .catch(error => this.databaseService.translateError(error));
    await this.auditService.record({ action: 'user.primary_phone_changed', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notifyContactChange(userId, { action: 'primary-changed', type: 'phone' });
    this.logger.info('primary phone changed', { userId });
  }

  private async notifyContactChange(userId: bigint, payload: { action: string; type: string }): Promise<void> {
    const email = await this.userEmailService.getPrimaryEmail(userId);
    if (email) await this.notificationService.enqueue({ templateKey: CONTACT_CHANGED_TEMPLATE, recipients: { email }, payload });
  }
}

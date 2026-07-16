/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { KeyProvider } from '@server/modules/auth/keys';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, MfaEnrollment, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

import { base32Encode, buildOtpauthUri, verifyTotp } from './totp';

/**
 * Defining types
 */

export interface TotpProvisioning {
  secret: string;
  uri: string;
}

export interface EnrollmentSummary {
  type: MfaEnrollment.Method;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  /** WEBAUTHN entries carry the credential id so self-service removal can target one passkey. */
  credentialId?: string;
}

export interface MfaFactors {
  totp: boolean;
  webauthn: boolean;
}

interface SerializedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Declaring the constants
 */
const TOTP_SECRET_BYTES = 20;
const ENROLLED_TEMPLATE = 'auth.mfa.enrolled';
const DISABLED_TEMPLATE = 'auth.mfa.disabled';

@Injectable()
export class MfaService {
  private readonly logger = Logger.getLogger(APP_NAME, MfaService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly keyProvider: KeyProvider,
    private readonly userEmailService: UserEmailService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /** True when the user holds any verified second factor; drives the login-flow MFA gate. */
  async hasMfa(userId: bigint): Promise<boolean> {
    const factors = await this.getFactors(userId);
    return factors.totp || factors.webauthn;
  }

  /** Which factor kinds the user holds; drives the login flow's MFA step selection. */
  async getFactors(userId: bigint): Promise<MfaFactors> {
    const enrollment = await this.db.query.mfaEnrollments.findFirst({
      where: and(eq(schema.mfaEnrollments.userId, userId), isNotNull(schema.mfaEnrollments.verifiedAt)),
      columns: { id: true },
    });
    const credential = await this.db.query.webauthnCredentials.findFirst({ where: eq(schema.webauthnCredentials.userId, userId), columns: { id: true } });
    return { totp: enrollment !== undefined, webauthn: credential !== undefined };
  }

  async listEnrollments(userId: bigint): Promise<EnrollmentSummary[]> {
    const enrollments = await this.db.query.mfaEnrollments.findMany({
      where: and(eq(schema.mfaEnrollments.userId, userId), isNotNull(schema.mfaEnrollments.verifiedAt)),
    });
    const credentials = await this.db.query.webauthnCredentials.findMany({ where: eq(schema.webauthnCredentials.userId, userId) });
    return [
      ...enrollments.map(enrollment => ({ type: enrollment.type, label: enrollment.label, createdAt: enrollment.createdAt, lastUsedAt: enrollment.lastUsedAt })),
      ...credentials.map(credential => ({
        type: 'WEBAUTHN' as const,
        label: credential.label,
        createdAt: credential.createdAt,
        lastUsedAt: credential.lastUsedAt,
        credentialId: credential.credentialId,
      })),
    ];
  }

  /**
   * Provisions a fresh TOTP seed. The enrollment stays unusable until the user proves possession
   * via `activateTotp`; re-provisioning simply replaces any prior unverified attempt.
   */
  async enrollTotp(userId: bigint): Promise<TotpProvisioning> {
    const active = await this.getTotpEnrollment(userId, 'verified');
    if (active) throw AppErrorCode.MFA_003.create();

    const secret = randomBytes(TOTP_SECRET_BYTES);
    const encrypted = this.keyProvider.encrypt(secret);
    const serialized: SerializedSecret = { ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag };

    await this.db.transaction(async tx => {
      await tx.delete(schema.mfaEnrollments).where(and(eq(schema.mfaEnrollments.userId, userId), eq(schema.mfaEnrollments.type, 'TOTP'), isNull(schema.mfaEnrollments.verifiedAt)));
      await tx.insert(schema.mfaEnrollments).values({ userId, type: 'TOTP', secretCiphertext: JSON.stringify(serialized), kekVersion: encrypted.kekVersion });
    });

    const account = (await this.userEmailService.getPrimaryEmail(userId)) ?? userId.toString();
    const secretBase32 = base32Encode(secret);
    this.logger.debug('totp enrollment provisioned', { userId });
    return { secret: secretBase32, uri: buildOtpauthUri(new URL(this.issuer).hostname, account, secretBase32) };
  }

  /** Activates a pending TOTP enrollment once the user proves possession with a valid code. */
  async activateTotp(userId: bigint, code: string): Promise<void> {
    const pending = await this.getTotpEnrollment(userId, 'pending');
    if (!pending) throw AppErrorCode.MFA_001.create();

    const counter = verifyTotp(this.decryptSecret(pending), code);
    if (counter === null) throw AppErrorCode.MFA_002.create();

    await this.db
      .update(schema.mfaEnrollments)
      .set({ verifiedAt: new Date(), lastUsedAt: new Date(), lastUsedCounter: BigInt(counter) })
      .where(eq(schema.mfaEnrollments.id, pending.id));

    await this.auditService.record({ action: 'auth.mfa.totp_enrolled', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notify(userId, ENROLLED_TEMPLATE, 'TOTP');
    this.logger.info('totp enrolled', { userId });
  }

  /**
   * Verifies a TOTP code against the active enrollment. A code is accepted at most once: the
   * matched time-step must exceed the last accepted one, closing the replay window.
   */
  async verifyTotp(userId: bigint, code: string): Promise<boolean> {
    const enrollment = await this.getTotpEnrollment(userId, 'verified');
    if (!enrollment) return false;

    const counter = verifyTotp(this.decryptSecret(enrollment), code);
    if (counter === null) return false;
    if (enrollment.lastUsedCounter !== null && BigInt(counter) <= enrollment.lastUsedCounter) return false;

    await this.db
      .update(schema.mfaEnrollments)
      .set({ lastUsedAt: new Date(), lastUsedCounter: BigInt(counter) })
      .where(eq(schema.mfaEnrollments.id, enrollment.id));
    return true;
  }

  async disableTotp(userId: bigint): Promise<void> {
    const enrollment = await this.getTotpEnrollment(userId, 'verified');
    if (!enrollment) throw AppErrorCode.MFA_001.create();

    await this.db.delete(schema.mfaEnrollments).where(and(eq(schema.mfaEnrollments.userId, userId), eq(schema.mfaEnrollments.type, 'TOTP')));
    await this.auditService.record({ action: 'auth.mfa.totp_disabled', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notify(userId, DISABLED_TEMPLATE, 'TOTP');
    this.logger.info('totp disabled', { userId });
  }

  private async getTotpEnrollment(userId: bigint, state: 'verified' | 'pending'): Promise<MfaEnrollment | undefined> {
    const verification = state === 'verified' ? isNotNull(schema.mfaEnrollments.verifiedAt) : isNull(schema.mfaEnrollments.verifiedAt);
    return this.db.query.mfaEnrollments.findFirst({
      where: and(eq(schema.mfaEnrollments.userId, userId), eq(schema.mfaEnrollments.type, 'TOTP'), verification),
    });
  }

  private decryptSecret(enrollment: MfaEnrollment): Buffer {
    if (!enrollment.secretCiphertext || enrollment.kekVersion === null) throw AppErrorCode.MFA_001.create();
    const serialized = JSON.parse(enrollment.secretCiphertext) as SerializedSecret;
    return this.keyProvider.decrypt({ ...serialized, kekVersion: enrollment.kekVersion });
  }

  private async notify(userId: bigint, templateKey: string, method: string): Promise<void> {
    const email = await this.userEmailService.getPrimaryEmail(userId);
    if (email) await this.notificationService.enqueue({ templateKey, recipients: { email }, payload: { method } });
  }
}

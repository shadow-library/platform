/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, WebauthnCredential, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

/**
 * Defining types
 */

export interface WebauthnAuthenticationResult {
  userId: bigint;
  credentialId: string;
}

/**
 * Declaring the constants
 */
const CHALLENGE_TTL_SECONDS = 300;
const RP_NAME = 'Shadow Accounts';
const ENROLLED_TEMPLATE = 'auth.mfa.enrolled';
const DISABLED_TEMPLATE = 'auth.mfa.disabled';

@Injectable()
export class WebauthnService {
  private readonly logger = Logger.getLogger(APP_NAME, WebauthnService.name);
  private readonly rpId = Config.get('auth.webauthn.rp-id');
  private readonly origin = Config.get('auth.webauthn.origin');
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(
    databaseService: DatabaseService,
    private readonly userEmailService: UserEmailService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  private registrationKey(userId: bigint): string {
    return `webauthn:reg:${userId}`;
  }

  private authenticationKey(flowKey: string): string {
    return `webauthn:auth:${flowKey}`;
  }

  private parseTransports(credential: WebauthnCredential): AuthenticatorTransportFuture[] | undefined {
    return credential.transports ? (credential.transports.split(',') as AuthenticatorTransportFuture[]) : undefined;
  }

  async listForUser(userId: bigint): Promise<WebauthnCredential[]> {
    return this.db.query.webauthnCredentials.findMany({ where: eq(schema.webauthnCredentials.userId, userId) });
  }

  async hasCredential(userId: bigint): Promise<boolean> {
    const credential = await this.db.query.webauthnCredentials.findFirst({ where: eq(schema.webauthnCredentials.userId, userId), columns: { id: true } });
    return credential !== undefined;
  }

  /** Begins a registration ceremony; the challenge lives server-side only, bound to the user. */
  async startRegistration(userId: bigint): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const email = (await this.userEmailService.getPrimaryEmail(userId)) ?? userId.toString();
    const existing = await this.listForUser(userId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.rpId,
      userName: email,
      attestationType: 'none',
      excludeCredentials: existing.map(credential => ({ id: credential.credentialId, transports: this.parseTransports(credential) })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.redis.set(this.registrationKey(userId), options.challenge, 'EX', CHALLENGE_TTL_SECONDS);
    return options;
  }

  async finishRegistration(userId: bigint, response: RegistrationResponseJSON, label?: string): Promise<WebauthnCredential> {
    const expectedChallenge = await this.redis.getdel(this.registrationKey(userId));
    if (!expectedChallenge) throw new ServerError(AppErrorCode.MFA_002);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    }).catch(() => null);
    if (!verification?.verified || !verification.registrationInfo) throw new ServerError(AppErrorCode.MFA_002);

    const { credential, aaguid, credentialBackedUp } = verification.registrationInfo;
    const [row] = await this.db
      .insert(schema.webauthnCredentials)
      .values({
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        signCount: BigInt(credential.counter),
        transports: credential.transports?.join(',') ?? null,
        aaguid,
        backupEligible: credentialBackedUp,
        label: label ?? 'passkey',
      })
      .returning();
    if (!row) throw new ServerError(AppErrorCode.MFA_002);

    await this.auditService.record({ action: 'auth.mfa.webauthn_registered', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notify(userId, ENROLLED_TEMPLATE);
    this.logger.info('webauthn credential registered', { userId, credentialId: credential.id });
    return row;
  }

  /**
   * Begins an authentication ceremony bound to an opaque flow key. When the flow resolves to no
   * user (enumeration neutrality, D-12) the options simply carry no credential hints — the shape
   * of the response is identical either way.
   */
  async startAuthentication(flowKey: string, userId: bigint | null, firstFactor = false): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = userId ? await this.listForUser(userId) : [];
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: credentials.map(credential => ({ id: credential.credentialId, transports: this.parseTransports(credential) })),
      userVerification: firstFactor ? 'required' : 'preferred',
    });
    await this.redis.set(this.authenticationKey(flowKey), options.challenge, 'EX', CHALLENGE_TTL_SECONDS);
    return options;
  }

  /**
   * Completes an assertion. Returns null (never throws) on any verification failure so callers
   * can route it through their neutral failure paths; a signature-counter regression additionally
   * raises a security audit event because it indicates a cloned authenticator.
   */
  async finishAuthentication(flowKey: string, response: AuthenticationResponseJSON, firstFactor = false): Promise<WebauthnAuthenticationResult | null> {
    const stored = await this.db.query.webauthnCredentials.findFirst({ where: eq(schema.webauthnCredentials.credentialId, response.id) });
    const expectedChallenge = await this.redis.getdel(this.authenticationKey(flowKey));
    if (!stored || !expectedChallenge) return null;

    let verified = false;
    let newCounter = 0;
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        requireUserVerification: firstFactor,
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
          counter: Number(stored.signCount),
          transports: this.parseTransports(stored),
        },
      });
      verified = verification.verified;
      newCounter = verification.authenticationInfo.newCounter;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('counter value')) {
        await this.auditService.record({
          action: 'security.webauthn.counter_regression',
          outcome: 'FAILURE',
          actorType: 'USER',
          actorId: stored.userId.toString(),
          detail: { credentialId: stored.credentialId },
        });
        this.logger.warn('webauthn counter regression detected', { userId: stored.userId, credentialId: stored.credentialId });
      }
      return null;
    }
    if (!verified) return null;

    await this.db
      .update(schema.webauthnCredentials)
      .set({ signCount: BigInt(newCounter), lastUsedAt: new Date() })
      .where(eq(schema.webauthnCredentials.id, stored.id));
    return { userId: stored.userId, credentialId: stored.credentialId };
  }

  async remove(userId: bigint, credentialId: string): Promise<void> {
    const removed = await this.db
      .delete(schema.webauthnCredentials)
      .where(eq(schema.webauthnCredentials.credentialId, credentialId))
      .returning({ userId: schema.webauthnCredentials.userId });
    if (removed.length === 0 || removed[0]?.userId !== userId) throw new ServerError(AppErrorCode.MFA_001);

    await this.auditService.record({ action: 'auth.mfa.webauthn_removed', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    await this.notify(userId, DISABLED_TEMPLATE);
    this.logger.info('webauthn credential removed', { userId, credentialId });
  }

  private async notify(userId: bigint, templateKey: string): Promise<void> {
    const email = await this.userEmailService.getPrimaryEmail(userId);
    if (email) await this.notificationService.enqueue({ templateKey, recipients: { email }, payload: { method: 'WEBAUTHN' } });
  }
}

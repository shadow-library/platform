/**
 * Importing npm packages
 */
import { createHmac, hkdfSync, randomUUID } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config, InternalError, Logger, throwError } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { SessionService, ValidatedSession } from '@server/modules/auth/session';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, SamlServiceProvider, schema } from '@server/modules/infrastructure/datastore';

import { SamlKeyService } from './saml-key.service';
import { AssertionAttribute, buildMetadata, buildSignedResponse, decodeSamlRequest, parseAuthnRequest } from './saml-xml';

/**
 * Defining types
 */

export interface CreateServiceProvider {
  entityId: string;
  name: string;
  acsUrl: string;
  nameIdFormat?: SamlServiceProvider.NameIdFormat;
  releasedAttributes?: string[];
  spCertificatePem?: string;
}

export interface UpdateServiceProvider {
  name?: string;
  acsUrl?: string;
  nameIdFormat?: SamlServiceProvider.NameIdFormat;
  releasedAttributes?: string[];
  spCertificatePem?: string | null;
  isActive?: boolean;
}

export type SsoResult = { kind: 'login'; resumeId: string } | { kind: 'post'; acsUrl: string; samlResponse: string; relayState?: string };

interface PendingSsoRequest {
  serviceProviderId: string;
  requestId: string;
  relayState?: string;
}

/**
 * Declaring the constants
 *
 * The pending-request store is the IdP-side replay guard: an SSO attempt that detours through the
 * hosted login is parked in Redis under a single-use resume id, so a captured resume link cannot
 * mint a second assertion. Assertions themselves live five minutes and carry `InResponseTo`, the
 * registered ACS as `Recipient`, and an `AudienceRestriction` — the SP-side replay anchors.
 */
const PENDING_TTL_SECONDS = 600;
const ASSERTION_VALIDITY_SECONDS = 300;
const RELEASABLE_ATTRIBUTES = ['email', 'first_name', 'last_name', 'display_name'] as const;

@Injectable()
export class SamlService {
  private readonly logger = Logger.getLogger(APP_NAME, SamlService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;
  private readonly pairwiseKey: Buffer;

  constructor(
    databaseService: DatabaseService,
    private readonly samlKeyService: SamlKeyService,
    private readonly sessionService: SessionService,
    private readonly userEmailService: UserEmailService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
    /** Pairwise NameIDs are HMAC(user id, key derived from the master key) — stable, unlinkable across SPs. */
    const masterKey = Config.get('security.master-encryption-key');
    this.pairwiseKey = Buffer.from(hkdfSync('sha256', masterKey, 'shadow-identity', 'saml-pairwise-name-id', 32));
  }

  /* ------------------------------- service provider registry ------------------------------- */

  private assertValidServiceProvider(entityId: string, acsUrl: string, releasedAttributes: string[]): void {
    if (!entityId.trim()) throw new ServerError(AppErrorCode.SML_001);
    let acs: URL;
    try {
      acs = new URL(acsUrl);
    } catch {
      throw new ServerError(AppErrorCode.SML_002);
    }
    if (acs.protocol !== 'https:') throw new ServerError(AppErrorCode.SML_002);
    const invalid = releasedAttributes.filter(attribute => !RELEASABLE_ATTRIBUTES.includes(attribute as (typeof RELEASABLE_ATTRIBUTES)[number]));
    if (invalid.length > 0) throw new ServerError(AppErrorCode.SML_001);
  }

  async createServiceProvider(data: CreateServiceProvider): Promise<SamlServiceProvider> {
    const releasedAttributes = data.releasedAttributes ?? ['email'];
    this.assertValidServiceProvider(data.entityId, data.acsUrl, releasedAttributes);
    const serviceProvider = await this.db
      .insert(schema.samlServiceProviders)
      .values({
        entityId: data.entityId,
        name: data.name,
        acsUrl: data.acsUrl,
        nameIdFormat: data.nameIdFormat ?? 'EMAIL',
        releasedAttributes,
        spCertificatePem: data.spCertificatePem,
      })
      .returning()
      .then(([row]) => row ?? throwError(new InternalError('Service provider creation failed')));
    this.logger.info('saml service provider registered', { id: serviceProvider.id, entityId: data.entityId });
    return serviceProvider;
  }

  async updateServiceProvider(id: string, patch: UpdateServiceProvider): Promise<SamlServiceProvider> {
    const current = await this.getServiceProvider(id);
    const acsUrl = patch.acsUrl ?? current.acsUrl;
    const releasedAttributes = patch.releasedAttributes ?? current.releasedAttributes;
    this.assertValidServiceProvider(current.entityId, acsUrl, releasedAttributes);
    const [updated] = await this.db
      .update(schema.samlServiceProviders)
      .set({ ...patch, acsUrl, releasedAttributes, updatedAt: new Date() })
      .where(eq(schema.samlServiceProviders.id, id))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.SML_004);
    return updated;
  }

  async removeServiceProvider(id: string): Promise<void> {
    const removed = await this.db.delete(schema.samlServiceProviders).where(eq(schema.samlServiceProviders.id, id)).returning({ id: schema.samlServiceProviders.id });
    if (removed.length === 0) throw new ServerError(AppErrorCode.SML_004);
  }

  async getServiceProvider(id: string): Promise<SamlServiceProvider> {
    const serviceProvider = await this.db.query.samlServiceProviders.findFirst({ where: eq(schema.samlServiceProviders.id, id) });
    if (!serviceProvider) throw new ServerError(AppErrorCode.SML_004);
    return serviceProvider;
  }

  async listServiceProviders(): Promise<SamlServiceProvider[]> {
    return this.db.query.samlServiceProviders.findMany({ orderBy: (table, { asc }) => asc(table.createdAt) });
  }

  /* --------------------------------------- sso flow --------------------------------------- */

  getMetadata(): string {
    return buildMetadata(this.issuer, `${this.issuer}/saml2/sso`, this.samlKeyService.getPublishedCertificates());
  }

  /** SP-initiated SSO entry (HTTP-Redirect binding in, HTTP-POST binding out). */
  async handleSsoRequest(samlRequest: string, relayState: string | undefined, sessionSecret: string | undefined): Promise<SsoResult> {
    const xml = decodeSamlRequest(samlRequest);
    const request = xml ? parseAuthnRequest(xml) : null;
    if (!request) throw new ServerError(AppErrorCode.SML_001);

    const serviceProvider = await this.db.query.samlServiceProviders.findFirst({ where: eq(schema.samlServiceProviders.entityId, request.issuer) });
    if (!serviceProvider || !serviceProvider.isActive) throw new ServerError(AppErrorCode.SML_001);
    if (request.acsUrl && request.acsUrl !== serviceProvider.acsUrl) throw new ServerError(AppErrorCode.SML_002);

    const session = sessionSecret ? await this.sessionService.validate(sessionSecret) : null;
    if (!session) {
      const resumeId = randomUUID();
      const pending: PendingSsoRequest = { serviceProviderId: serviceProvider.id, requestId: request.id, relayState };
      await this.redis.set(this.pendingKey(resumeId), JSON.stringify(pending), 'EX', PENDING_TTL_SECONDS);
      return { kind: 'login', resumeId };
    }
    return this.issueResponse(serviceProvider, session, request.id, relayState);
  }

  /** Completes an SSO attempt parked for login; the resume id is single-use. */
  async resume(resumeId: string, sessionSecret: string | undefined): Promise<SsoResult> {
    const session = sessionSecret ? await this.sessionService.validate(sessionSecret) : null;
    if (!session) return { kind: 'login', resumeId };

    const raw = await this.redis.getdel(this.pendingKey(resumeId));
    if (!raw) throw new ServerError(AppErrorCode.SML_003);
    const pending = JSON.parse(raw) as PendingSsoRequest;
    const serviceProvider = await this.getServiceProvider(pending.serviceProviderId);
    if (!serviceProvider.isActive) throw new ServerError(AppErrorCode.SML_001);
    return this.issueResponse(serviceProvider, session, pending.requestId, pending.relayState);
  }

  private pendingKey(resumeId: string): string {
    return `saml_sso:${resumeId}`;
  }

  private pairwiseNameId(userId: bigint, entityId: string): string {
    const digest = createHmac('sha256', this.pairwiseKey).update(`${userId.toString()}:${entityId}`).digest('hex');
    return `sp-${digest}`;
  }

  private async issueResponse(serviceProvider: SamlServiceProvider, session: ValidatedSession, requestId: string, relayState?: string): Promise<SsoResult> {
    const email = await this.userEmailService.getPrimaryEmail(session.userId);
    if (!email) throw new ServerError(AppErrorCode.SML_001);
    const profile = await this.db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, session.userId) });

    const attributeValues: Record<(typeof RELEASABLE_ATTRIBUTES)[number], string | null> = {
      email,
      first_name: profile?.firstName ?? null,
      last_name: profile?.lastName ?? null,
      display_name: profile?.displayName ?? null,
    };
    const attributes: AssertionAttribute[] = serviceProvider.releasedAttributes
      .map(name => ({ name, value: attributeValues[name as (typeof RELEASABLE_ATTRIBUTES)[number]] }))
      .filter((attribute): attribute is AssertionAttribute => attribute.value !== null);

    const signingKey = this.samlKeyService.getActiveKey();
    const samlResponse = buildSignedResponse({
      issuer: this.issuer,
      audience: serviceProvider.entityId,
      acsUrl: serviceProvider.acsUrl,
      inResponseTo: requestId,
      nameId: serviceProvider.nameIdFormat === 'PERSISTENT' ? this.pairwiseNameId(session.userId, serviceProvider.entityId) : email,
      nameIdFormat: serviceProvider.nameIdFormat,
      sessionIndex: session.id.toString(),
      attributes,
      privateKeyPem: signingKey.privateKeyPem,
      certificatePem: signingKey.certificatePem,
      validitySeconds: ASSERTION_VALIDITY_SECONDS,
    });

    await this.auditService.record({
      action: 'saml.sso.issued',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      targetType: 'saml_service_provider',
      targetId: serviceProvider.id,
    });
    return { kind: 'post', acsUrl: serviceProvider.acsUrl, samlResponse: Buffer.from(samlResponse).toString('base64'), relayState };
  }
}

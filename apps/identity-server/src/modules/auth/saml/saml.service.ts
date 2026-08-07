import { createHmac, hkdfSync, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { SessionService, ValidatedSession } from '@server/modules/auth/session';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, SamlServiceProvider, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

import { SamlKeyService } from './saml-key.service';
import { AssertionAttribute, buildMetadata, buildSignedResponse, decodeSamlRequest, parseAuthnRequest } from './saml-xml';

export interface CreateServiceProvider {
  entityId: string;
  name: string;
  acsUrl: string;
  applicationId?: number | null;
  nameIdFormat?: SamlServiceProvider.NameIdFormat;
  releasedAttributes?: string[];
  spCertificatePem?: string;
}

export interface UpdateServiceProvider {
  name?: string;
  acsUrl?: string;
  applicationId?: number | null;
  nameIdFormat?: SamlServiceProvider.NameIdFormat;
  releasedAttributes?: string[];
  spCertificatePem?: string | null;
  isActive?: boolean;
}

export type SsoResult =
  { kind: 'login'; resumeId: string } | { kind: 'post'; acsUrl: string; samlResponse: string; relayState?: string } | { kind: 'denied'; applicationName: string };

interface PendingSsoRequest {
  serviceProviderId: string;
  requestId: string;
  relayState?: string;
}

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
    private readonly applicationService: ApplicationService,
    private readonly applicationAccessService: ApplicationAccessService,
  ) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
    const masterKey = Config.get('security.master-encryption-key');
    this.pairwiseKey = Buffer.from(hkdfSync('sha256', masterKey, 'shadow-identity', 'saml-pairwise-name-id', 32));
  }

  private assertValidServiceProvider(entityId: string, acsUrl: string, releasedAttributes: string[]): void {
    if (!entityId.trim()) throw AppErrorCode.SML_001.create();
    let acs: URL;
    try {
      acs = new URL(acsUrl);
    } catch {
      throw AppErrorCode.SML_002.create();
    }
    if (acs.protocol !== 'https:') throw AppErrorCode.SML_002.create();
    const invalid = releasedAttributes.filter(attribute => !RELEASABLE_ATTRIBUTES.includes(attribute as (typeof RELEASABLE_ATTRIBUTES)[number]));
    if (invalid.length > 0) throw AppErrorCode.SML_001.create();
  }

  private assertApplicationExists(applicationId: number | null | undefined): void {
    if (applicationId !== null && applicationId !== undefined) this.applicationService.getApplicationByIdOrThrow(applicationId);
  }

  async createServiceProvider(data: CreateServiceProvider): Promise<SamlServiceProvider> {
    const releasedAttributes = data.releasedAttributes ?? ['email'];
    this.assertValidServiceProvider(data.entityId, data.acsUrl, releasedAttributes);
    this.assertApplicationExists(data.applicationId);
    const serviceProvider = await this.db
      .insert(schema.samlServiceProviders)
      .values({
        entityId: data.entityId,
        name: data.name,
        acsUrl: data.acsUrl,
        applicationId: data.applicationId ?? null,
        nameIdFormat: data.nameIdFormat ?? 'EMAIL',
        releasedAttributes,
        spCertificatePem: data.spCertificatePem,
      })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('Service provider creation failed')));
    this.logger.info('saml service provider registered', { id: serviceProvider.id, entityId: data.entityId });
    return serviceProvider;
  }

  async updateServiceProvider(id: string, patch: UpdateServiceProvider): Promise<SamlServiceProvider> {
    const current = await this.getServiceProvider(id);
    const acsUrl = patch.acsUrl ?? current.acsUrl;
    const releasedAttributes = patch.releasedAttributes ?? current.releasedAttributes;
    this.assertValidServiceProvider(current.entityId, acsUrl, releasedAttributes);
    if (patch.applicationId !== undefined) this.assertApplicationExists(patch.applicationId);
    const [updated] = await this.db
      .update(schema.samlServiceProviders)
      .set({ ...patch, acsUrl, releasedAttributes, updatedAt: new Date() })
      .where(eq(schema.samlServiceProviders.id, id))
      .returning();
    if (!updated) throw AppErrorCode.SML_004.create();
    return updated;
  }

  async removeServiceProvider(id: string): Promise<void> {
    const removed = await this.db.delete(schema.samlServiceProviders).where(eq(schema.samlServiceProviders.id, id)).returning({ id: schema.samlServiceProviders.id });
    if (removed.length === 0) throw AppErrorCode.SML_004.create();
  }

  async getServiceProvider(id: string): Promise<SamlServiceProvider> {
    const serviceProvider = await this.db.query.samlServiceProviders.findFirst({ where: eq(schema.samlServiceProviders.id, id) });
    if (!serviceProvider) throw AppErrorCode.SML_004.create();
    return serviceProvider;
  }

  async listServiceProviders(): Promise<SamlServiceProvider[]> {
    return this.db.query.samlServiceProviders.findMany({ orderBy: (table, { asc }) => asc(table.createdAt) });
  }

  getMetadata(): string {
    return buildMetadata(this.issuer, `${this.issuer}/saml2/sso`, this.samlKeyService.getPublishedCertificates());
  }

  async handleSsoRequest(samlRequest: string, relayState: string | undefined, sessionSecret: string | undefined): Promise<SsoResult> {
    const xml = decodeSamlRequest(samlRequest);
    const request = xml ? parseAuthnRequest(xml) : null;
    if (!request) throw AppErrorCode.SML_001.create();

    const serviceProvider = await this.db.query.samlServiceProviders.findFirst({ where: eq(schema.samlServiceProviders.entityId, request.issuer) });
    if (!serviceProvider || !serviceProvider.isActive) throw AppErrorCode.SML_001.create();
    if (request.acsUrl && request.acsUrl !== serviceProvider.acsUrl) throw AppErrorCode.SML_002.create();

    const session = sessionSecret ? await this.sessionService.validate(sessionSecret) : null;
    if (!session) {
      const resumeId = randomUUID();
      const pending: PendingSsoRequest = { serviceProviderId: serviceProvider.id, requestId: request.id, relayState };
      await this.redis.set(this.pendingKey(resumeId), JSON.stringify(pending), 'EX', PENDING_TTL_SECONDS);
      return { kind: 'login', resumeId };
    }
    return this.issueResponse(serviceProvider, session, request.id, relayState);
  }

  async resume(resumeId: string, sessionSecret: string | undefined): Promise<SsoResult> {
    const session = sessionSecret ? await this.sessionService.validate(sessionSecret) : null;
    if (!session) return { kind: 'login', resumeId };

    const raw = await this.redis.getdel(this.pendingKey(resumeId));
    if (!raw) throw AppErrorCode.SML_003.create();
    const pending = JSON.parse(raw) as PendingSsoRequest;
    const serviceProvider = await this.getServiceProvider(pending.serviceProviderId);
    if (!serviceProvider.isActive) throw AppErrorCode.SML_001.create();
    return this.issueResponse(serviceProvider, session, pending.requestId, pending.relayState);
  }

  private pendingKey(resumeId: string): string {
    return `saml_sso:${resumeId}`;
  }

  private async assertApplicationAccess(userId: bigint, applicationId: number): Promise<Extract<SsoResult, { kind: 'denied' }> | null> {
    try {
      await this.applicationAccessService.assertUserAccess(userId, applicationId);
      return null;
    } catch (error) {
      if (!AppError.is(error, AppErrorCode.APP_006) && !AppError.is(error, AppErrorCode.APP_007)) throw error;
      const application = this.applicationService.getApplicationById(applicationId);
      this.logger.warn('saml sso denied: the user has no access to the linked application', { securityEvent: 'saml.sso.denied', userId: userId.toString(), applicationId });
      return { kind: 'denied', applicationName: application?.displayName ?? application?.name ?? '' };
    }
  }

  private pairwiseNameId(userId: bigint, entityId: string): string {
    const digest = createHmac('sha256', this.pairwiseKey).update(`${userId.toString()}:${entityId}`).digest('hex');
    return `sp-${digest}`;
  }

  private async issueResponse(serviceProvider: SamlServiceProvider, session: ValidatedSession, requestId: string, relayState?: string): Promise<SsoResult> {
    if (serviceProvider.applicationId !== null) {
      const denied = await this.assertApplicationAccess(session.userId, serviceProvider.applicationId);
      if (denied) return denied;
    }

    const email = await this.userEmailService.getPrimaryEmail(session.userId);
    if (!email) throw AppErrorCode.SML_001.create();
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

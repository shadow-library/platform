import { and, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, oidcDiscoveryUrl } from '@server/constants';
import { KeyProvider } from '@server/modules/auth/keys';
import { type ValidatedSession } from '@server/modules/auth/session';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, IdentityProvider, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { WebhookTargetGuard } from '@server/modules/infrastructure/webhook';

interface DiscoveredEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface CreateIdentityProvider {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
  enforced?: boolean;
}

export interface CreateGlobalIdentityProvider extends CreateIdentityProvider {
  kind: SocialProviderKind;
  allowSignUp?: boolean;
  appleTeamId?: string;
  appleKeyId?: string;
}

export interface UpdateIdentityProvider {
  name?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  enforced?: boolean;
  isActive?: boolean;
}

export interface UpdateGlobalIdentityProvider extends Omit<UpdateIdentityProvider, 'enforced'> {
  allowSignUp?: boolean;
  appleTeamId?: string;
  appleKeyId?: string;
}

export type SocialProviderKind = Exclude<IdentityProvider.Kind, 'OIDC'>;

/** Microsoft's multi-tenant issuers publish `.../{tenantid}/v2.0` verbatim, so neither discovery nor an `iss` claim can ever match one. */
const MICROSOFT_TENANT_ISSUER = /^https:\/\/login\.microsoftonline\.com\/[0-9a-fA-F-]{36}\/v2\.0$/;

interface DiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
}

const DISCOVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class IdentityProviderService {
  private readonly logger = Logger.getLogger(APP_NAME, IdentityProviderService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly keyProvider: KeyProvider,
    private readonly targetGuard: WebhookTargetGuard,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private async audit(session: ValidatedSession, organisationId: bigint, action: string, targetId: string): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId: organisationId.toString(),
      targetType: 'identity_provider',
      targetId,
    });
  }

  async registerIdentityProvider(session: ValidatedSession, organisationId: bigint, input: CreateIdentityProvider): Promise<IdentityProvider> {
    const provider = await this.create(organisationId, input);
    await this.audit(session, organisationId, 'org.idp.configured', provider.id);
    return provider;
  }

  async updateIdentityProviderConfig(session: ValidatedSession, organisationId: bigint, id: string, patch: UpdateIdentityProvider): Promise<IdentityProvider> {
    const provider = await this.update(organisationId, id, patch);
    await this.audit(session, organisationId, 'org.idp.updated', provider.id);
    return provider;
  }

  async removeIdentityProviderConfig(session: ValidatedSession, organisationId: bigint, id: string): Promise<void> {
    await this.remove(organisationId, id);
    await this.audit(session, organisationId, 'org.idp.removed', id);
  }

  private async discover(issuer: string): Promise<DiscoveredEndpoints> {
    this.targetGuard.assertAcceptableUrl(issuer);
    const url = oidcDiscoveryUrl(issuer);
    let document: DiscoveryDocument;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
      if (!response.ok) throw AppError.internal(`discovery answered ${response.status}`);
      document = (await response.json()) as DiscoveryDocument;
    } catch (error) {
      this.logger.warn('identity provider discovery failed', { issuer, error: error instanceof Error ? error.message : String(error) });
      throw AppErrorCode.FED_001.create();
    }

    if (document.issuer !== issuer && document.issuer !== issuer.replace(/\/$/, '')) throw AppErrorCode.FED_001.create();
    if (!document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) throw AppErrorCode.FED_001.create();
    for (const endpoint of [document.authorization_endpoint, document.token_endpoint, document.jwks_uri]) this.targetGuard.assertAcceptableUrl(endpoint);
    return { authorizationEndpoint: document.authorization_endpoint, tokenEndpoint: document.token_endpoint, jwksUri: document.jwks_uri };
  }

  async create(organisationId: bigint, input: CreateIdentityProvider): Promise<IdentityProvider> {
    const existing = await this.db.query.identityProviders.findFirst({ where: eq(schema.identityProviders.organisationId, organisationId) });
    if (existing) throw AppErrorCode.FED_003.create();

    const provider = await this.insert({ organisationId, kind: 'OIDC', enforced: input.enforced ?? false }, input);
    this.logger.info('identity provider configured', { organisationId: organisationId.toString(), issuer: provider.issuer });
    return provider;
  }

  async createGlobal(input: CreateGlobalIdentityProvider): Promise<IdentityProvider> {
    if (input.kind === 'MICROSOFT' && !MICROSOFT_TENANT_ISSUER.test(input.issuer.replace(/\/$/, ''))) throw AppErrorCode.FED_005.create();
    if (input.kind === 'APPLE' && (!input.appleTeamId || !input.appleKeyId)) throw AppErrorCode.FED_007.create();

    const provider = await this.insert(
      { organisationId: null, kind: input.kind, allowSignUp: input.allowSignUp ?? true, appleTeamId: input.appleTeamId, appleKeyId: input.appleKeyId },
      input,
    );
    this.logger.info('social identity provider configured', { kind: provider.kind, issuer: provider.issuer });
    return provider;
  }

  private async insert(
    scope: Pick<typeof schema.identityProviders.$inferInsert, 'organisationId' | 'kind' | 'enforced' | 'allowSignUp' | 'appleTeamId' | 'appleKeyId'>,
    input: CreateIdentityProvider,
  ): Promise<IdentityProvider> {
    const endpoints = await this.discover(input.issuer);
    const secret = this.keyProvider.encrypt(Buffer.from(input.clientSecret));
    return this.db
      .insert(schema.identityProviders)
      .values({
        ...scope,
        name: input.name,
        issuer: input.issuer.replace(/\/$/, ''),
        clientId: input.clientId,
        clientSecretCiphertext: secret.ciphertext,
        clientSecretIv: secret.iv,
        clientSecretAuthTag: secret.authTag,
        kekVersion: secret.kekVersion,
        scopes: input.scopes ?? 'openid email profile',
        ...endpoints,
      })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('Identity provider creation failed')))
      .catch(error => this.databaseService.translateError(error));
  }

  async update(organisationId: bigint, id: string, patch: UpdateIdentityProvider): Promise<IdentityProvider> {
    await this.requireForOrganisation(organisationId, id);
    const secret = patch.clientSecret === undefined ? {} : this.toSecretColumns(patch.clientSecret);
    const [updated] = await this.db
      .update(schema.identityProviders)
      .set({ name: patch.name, clientId: patch.clientId, scopes: patch.scopes, enforced: patch.enforced, isActive: patch.isActive, ...secret, updatedAt: new Date() })
      .where(and(eq(schema.identityProviders.id, id), eq(schema.identityProviders.organisationId, organisationId)))
      .returning();
    if (!updated) throw AppErrorCode.FED_002.create();
    return updated;
  }

  private toSecretColumns(clientSecret: string): Partial<IdentityProvider> {
    const secret = this.keyProvider.encrypt(Buffer.from(clientSecret));
    return { clientSecretCiphertext: secret.ciphertext, clientSecretIv: secret.iv, clientSecretAuthTag: secret.authTag, kekVersion: secret.kekVersion };
  }

  async remove(organisationId: bigint, id: string): Promise<void> {
    const removed = await this.db
      .delete(schema.identityProviders)
      .where(and(eq(schema.identityProviders.id, id), eq(schema.identityProviders.organisationId, organisationId)))
      .returning({ id: schema.identityProviders.id });
    if (removed.length === 0) throw AppErrorCode.FED_002.create();
  }

  async updateGlobal(id: string, patch: UpdateGlobalIdentityProvider): Promise<IdentityProvider> {
    const secret = patch.clientSecret === undefined ? {} : this.toSecretColumns(patch.clientSecret);
    const [updated] = await this.db
      .update(schema.identityProviders)
      .set({
        name: patch.name,
        clientId: patch.clientId,
        scopes: patch.scopes,
        allowSignUp: patch.allowSignUp,
        isActive: patch.isActive,
        appleTeamId: patch.appleTeamId,
        appleKeyId: patch.appleKeyId,
        ...secret,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.identityProviders.id, id), isNull(schema.identityProviders.organisationId)))
      .returning();
    if (!updated) throw AppErrorCode.FED_002.create();
    return updated;
  }

  async removeGlobal(id: string): Promise<void> {
    const removed = await this.db
      .delete(schema.identityProviders)
      .where(and(eq(schema.identityProviders.id, id), isNull(schema.identityProviders.organisationId)))
      .returning({ id: schema.identityProviders.id });
    if (removed.length === 0) throw AppErrorCode.FED_002.create();
  }

  listGlobal(): Promise<IdentityProvider[]> {
    return this.db.query.identityProviders.findMany({ where: isNull(schema.identityProviders.organisationId) });
  }

  async getGlobal(kind: SocialProviderKind): Promise<IdentityProvider | null> {
    const provider = await this.db.query.identityProviders.findFirst({
      where: and(isNull(schema.identityProviders.organisationId), eq(schema.identityProviders.kind, kind)),
    });
    return provider ?? null;
  }

  async getForOrganisation(organisationId: bigint): Promise<IdentityProvider | null> {
    const provider = await this.db.query.identityProviders.findFirst({ where: eq(schema.identityProviders.organisationId, organisationId) });
    return provider ?? null;
  }

  async requireForOrganisation(organisationId: bigint, id: string): Promise<IdentityProvider> {
    const provider = await this.db.query.identityProviders.findFirst({
      where: and(eq(schema.identityProviders.id, id), eq(schema.identityProviders.organisationId, organisationId)),
    });
    if (!provider) throw AppErrorCode.FED_002.create();
    return provider;
  }

  async getById(id: string): Promise<IdentityProvider | null> {
    const provider = await this.db.query.identityProviders.findFirst({ where: eq(schema.identityProviders.id, id) });
    return provider ?? null;
  }

  async routeForEmail(email: string): Promise<IdentityProvider | null> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;
    const verified = await this.db.query.organisationDomains.findFirst({
      where: and(eq(schema.organisationDomains.domain, domain), eq(schema.organisationDomains.status, 'VERIFIED')),
    });
    if (!verified) return null;
    const provider = await this.getForOrganisation(verified.organisationId);
    return provider?.isActive ? provider : null;
  }

  decryptClientSecret(provider: IdentityProvider): string {
    return this.keyProvider
      .decrypt({ ciphertext: provider.clientSecretCiphertext, iv: provider.clientSecretIv, authTag: provider.clientSecretAuthTag, kekVersion: provider.kekVersion })
      .toString();
  }
}

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { InternalError, Logger, throwError } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { KeyProvider } from '@server/modules/auth/keys';
import { DatabaseService, IdentityProvider, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { WebhookTargetGuard } from '@server/modules/infrastructure/webhook';

/**
 * Defining types
 */

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

export interface UpdateIdentityProvider {
  name?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  enforced?: boolean;
  isActive?: boolean;
}

interface DiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
}

/**
 * Declaring the constants
 *
 * The upstream issuer passes the same SSRF guard as webhook targets (public https, no
 * credentials/private hosts; relaxed only under the test flag), and every endpoint is taken from
 * the issuer's own discovery document — never from caller input — with the RFC 8414 issuer-match
 * check so a document can't claim someone else's identity.
 */
const DISCOVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class IdentityProviderService {
  private readonly logger = Logger.getLogger(APP_NAME, IdentityProviderService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly keyProvider: KeyProvider,
    private readonly targetGuard: WebhookTargetGuard,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /** Raw fetch, not APIRequest: admin-supplied issuers need a hard timeout, which APIRequest does not expose. */
  private async discover(issuer: string): Promise<DiscoveredEndpoints> {
    this.targetGuard.assertAcceptableUrl(issuer);
    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    let document: DiscoveryDocument;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
      if (!response.ok) throw new InternalError(`discovery answered ${response.status}`);
      document = (await response.json()) as DiscoveryDocument;
    } catch (error) {
      this.logger.warn('identity provider discovery failed', { issuer, error: error instanceof Error ? error.message : String(error) });
      throw new ServerError(AppErrorCode.FED_001);
    }

    if (document.issuer !== issuer && document.issuer !== issuer.replace(/\/$/, '')) throw new ServerError(AppErrorCode.FED_001);
    if (!document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) throw new ServerError(AppErrorCode.FED_001);
    for (const endpoint of [document.authorization_endpoint, document.token_endpoint, document.jwks_uri]) this.targetGuard.assertAcceptableUrl(endpoint);
    return { authorizationEndpoint: document.authorization_endpoint, tokenEndpoint: document.token_endpoint, jwksUri: document.jwks_uri };
  }

  async create(organisationId: bigint, input: CreateIdentityProvider): Promise<IdentityProvider> {
    const existing = await this.db.query.identityProviders.findFirst({ where: eq(schema.identityProviders.organisationId, organisationId) });
    if (existing) throw new ServerError(AppErrorCode.FED_003);

    const endpoints = await this.discover(input.issuer);
    const secret = this.keyProvider.encrypt(Buffer.from(input.clientSecret));
    const provider = await this.db
      .insert(schema.identityProviders)
      .values({
        organisationId,
        name: input.name,
        issuer: input.issuer.replace(/\/$/, ''),
        clientId: input.clientId,
        clientSecretCiphertext: secret.ciphertext,
        clientSecretIv: secret.iv,
        clientSecretAuthTag: secret.authTag,
        kekVersion: secret.kekVersion,
        scopes: input.scopes ?? 'openid email profile',
        enforced: input.enforced ?? false,
        ...endpoints,
      })
      .returning()
      .then(([row]) => row ?? throwError(new InternalError('Identity provider creation failed')));
    this.logger.info('identity provider configured', { organisationId: organisationId.toString(), issuer: provider.issuer });
    return provider;
  }

  async update(organisationId: bigint, id: string, patch: UpdateIdentityProvider): Promise<IdentityProvider> {
    await this.requireForOrganisation(organisationId, id);
    const secret = patch.clientSecret === undefined ? {} : this.toSecretColumns(patch.clientSecret);
    const [updated] = await this.db
      .update(schema.identityProviders)
      .set({ name: patch.name, clientId: patch.clientId, scopes: patch.scopes, enforced: patch.enforced, isActive: patch.isActive, ...secret, updatedAt: new Date() })
      .where(and(eq(schema.identityProviders.id, id), eq(schema.identityProviders.organisationId, organisationId)))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.FED_002);
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
    if (removed.length === 0) throw new ServerError(AppErrorCode.FED_002);
  }

  async getForOrganisation(organisationId: bigint): Promise<IdentityProvider | null> {
    const provider = await this.db.query.identityProviders.findFirst({ where: eq(schema.identityProviders.organisationId, organisationId) });
    return provider ?? null;
  }

  async requireForOrganisation(organisationId: bigint, id: string): Promise<IdentityProvider> {
    const provider = await this.db.query.identityProviders.findFirst({
      where: and(eq(schema.identityProviders.id, id), eq(schema.identityProviders.organisationId, organisationId)),
    });
    if (!provider) throw new ServerError(AppErrorCode.FED_002);
    return provider;
  }

  async getById(id: string): Promise<IdentityProvider | null> {
    const provider = await this.db.query.identityProviders.findFirst({ where: eq(schema.identityProviders.id, id) });
    return provider ?? null;
  }

  /** Home-realm discovery: an email under an org's VERIFIED domain routes to that org's active IdP. */
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

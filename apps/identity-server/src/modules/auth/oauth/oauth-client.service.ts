/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { InternalError, Logger, throwError } from '@shadow-library/common';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { ApiResource, DatabaseService, OAuthClient, PrimaryDatabase, Scope, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface RegisterClient {
  applicationId: number;
  name: string;
  kind: OAuthClient.Kind;
  isFirstParty?: boolean;
  redirectUris?: string[];
  grantTypes: string[];
  scopeIds?: string[];
  organisationId?: bigint | null;
  accessTokenTtl?: number;
  backchannelLogoutUri?: string;
  /** k8s SA subject allowed to authenticate this client with a projected token (D-16) */
  workloadSubject?: string;
}

export interface RegisteredClient {
  clientId: string;
  secret?: string;
}

export interface UpdateClient {
  name?: string;
  isActive?: boolean;
  redirectUris?: string[];
  backchannelLogoutUri?: string | null;
  workloadSubject?: string | null;
}

export interface RotatedSecret {
  secret: string;
  previousSecretsExpireAt: Date;
}

/**
 * Declaring the constants
 */
const ARGON2_OPTIONS = { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 } as const;
const PUBLIC_KINDS: OAuthClient.Kind[] = ['SPA_PUBLIC', 'NATIVE_PUBLIC'];
const DUMMY_SECRET_HASH = '$argon2id$v=19$m=65536,t=3,p=1$NCJqmYBSCaQHCbd96KVjeycfea/Op9Qf6OqrtzsUMkw$YNaWD8v4qxMkTfyuv7T0n+3PYqGqYo+6ixhN31TqX6E';

@Injectable()
export class OAuthClientService {
  private readonly logger = Logger.getLogger(APP_NAME, OAuthClientService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async register(input: RegisterClient): Promise<RegisteredClient> {
    const isPublic = PUBLIC_KINDS.includes(input.kind);
    const authMethod: OAuthClient.AuthMethod = isPublic ? 'none' : 'client_secret_basic';

    const clientId = await this.db.transaction(async tx => {
      const client = await tx
        .insert(schema.oauthClients)
        .values({
          applicationId: input.applicationId,
          name: input.name,
          kind: input.kind,
          isFirstParty: input.isFirstParty ?? false,
          tokenEndpointAuthMethod: authMethod,
          grantTypes: input.grantTypes,
          requirePkce: true,
          accessTokenTtl: input.accessTokenTtl ?? 3600,
          organisationId: input.organisationId ?? null,
          backchannelLogoutUri: input.backchannelLogoutUri ?? null,
          workloadSubject: input.workloadSubject ?? null,
        })
        .returning({ id: schema.oauthClients.id })
        .then(([row]) => row ?? throwError(new InternalError('Failed to create OAuth client')));

      for (const uri of input.redirectUris ?? []) await tx.insert(schema.oauthClientRedirectUris).values({ clientId: client.id, uri });
      for (const scopeId of input.scopeIds ?? []) await tx.insert(schema.oauthClientScopeGrants).values({ clientId: client.id, scopeId });
      return client.id;
    });

    let secret: string | undefined;
    if (!isPublic) secret = await this.createSecret(clientId);
    this.logger.info('Registered OAuth client', { clientId, kind: input.kind });
    return { clientId, secret };
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    if (!this.isUuid(clientId)) return null;
    const client = await this.db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, clientId) });
    return client ?? null;
  }

  /** Resolves the client bound to a verified k8s workload subject (D-16) */
  async getClientByWorkloadSubject(subject: string): Promise<OAuthClient | null> {
    const client = await this.db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.workloadSubject, subject) });
    return client ?? null;
  }

  /** Exact-string redirect-URI match — no wildcards or substring logic (C-5). */
  async isRedirectUriAllowed(clientId: string, uri: string): Promise<boolean> {
    if (!this.isUuid(clientId)) return false;
    const match = await this.db.query.oauthClientRedirectUris.findFirst({
      where: and(eq(schema.oauthClientRedirectUris.clientId, clientId), eq(schema.oauthClientRedirectUris.uri, uri)),
    });
    return Boolean(match);
  }

  /** Idempotently provisions an API resource and one of its scopes, returning the scope id. */
  async ensureScope(applicationId: number, resourceIdentifier: string, scopeName: string): Promise<string> {
    await this.db.insert(schema.apiResources).values({ applicationId, identifier: resourceIdentifier }).onConflictDoNothing();
    const resource =
      (await this.db.query.apiResources.findFirst({ where: eq(schema.apiResources.identifier, resourceIdentifier) })) ??
      throwError(new InternalError(`API resource '${resourceIdentifier}' could not be provisioned`));

    await this.db.insert(schema.scopes).values({ apiResourceId: resource.id, name: scopeName }).onConflictDoNothing();
    const scope =
      (await this.db.query.scopes.findFirst({ where: and(eq(schema.scopes.apiResourceId, resource.id), eq(schema.scopes.name, scopeName)) })) ??
      throwError(new InternalError(`Scope '${scopeName}' could not be provisioned`));
    return scope.id;
  }

  /** Grants an already-provisioned scope to a client, tolerating re-grants. */
  async grantScope(clientId: string, scopeId: string): Promise<void> {
    await this.db.insert(schema.oauthClientScopeGrants).values({ clientId, scopeId }).onConflictDoNothing();
  }

  async getGrantedScopeNames(clientId: string): Promise<string[]> {
    const grants = await this.db
      .select({ name: schema.scopes.name })
      .from(schema.oauthClientScopeGrants)
      .innerJoin(schema.scopes, eq(schema.oauthClientScopeGrants.scopeId, schema.scopes.id))
      .where(eq(schema.oauthClientScopeGrants.clientId, clientId));
    return grants.map(grant => grant.name);
  }

  async rotateSecret(clientId: string): Promise<string> {
    return this.createSecret(clientId);
  }

  /**
   * Dual-secret rotation (T-201): the new secret is live immediately while previous secrets stay
   * valid for the overlap window, so running consumers can re-configure without an outage.
   */
  async rotateSecretWithOverlap(clientId: string, overlapHours = 24): Promise<RotatedSecret> {
    const previousSecretsExpireAt = new Date(Date.now() + overlapHours * 3_600_000);
    await this.db
      .update(schema.oauthClientSecrets)
      .set({ expiresAt: previousSecretsExpireAt })
      .where(and(eq(schema.oauthClientSecrets.clientId, clientId), isNull(schema.oauthClientSecrets.revokedAt)));
    const secret = await this.createSecret(clientId);
    return { secret, previousSecretsExpireAt };
  }

  async revokeScope(clientId: string, scopeId: string): Promise<void> {
    await this.db.delete(schema.oauthClientScopeGrants).where(and(eq(schema.oauthClientScopeGrants.clientId, clientId), eq(schema.oauthClientScopeGrants.scopeId, scopeId)));
  }

  async listClients(): Promise<OAuthClient[]> {
    return this.db.query.oauthClients.findMany();
  }

  async getClientDetail(clientId: string): Promise<(OAuthClient & { redirectUris: string[]; scopes: string[] }) | null> {
    const client = await this.getClient(clientId);
    if (!client) return null;
    const redirects = await this.db.query.oauthClientRedirectUris.findMany({ where: eq(schema.oauthClientRedirectUris.clientId, clientId) });
    const scopes = await this.getGrantedScopeNames(clientId);
    return { ...client, redirectUris: redirects.map(redirect => redirect.uri), scopes };
  }

  /** Replaces the redirect-URI set atomically; partial updates would risk a dangling old URI. */
  async updateClient(clientId: string, update: UpdateClient): Promise<void> {
    await this.db.transaction(async tx => {
      if (update.name !== undefined || update.isActive !== undefined || update.backchannelLogoutUri !== undefined || update.workloadSubject !== undefined) {
        await tx
          .update(schema.oauthClients)
          .set({
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.isActive !== undefined ? { isActive: update.isActive } : {}),
            ...(update.backchannelLogoutUri !== undefined ? { backchannelLogoutUri: update.backchannelLogoutUri } : {}),
            ...(update.workloadSubject !== undefined ? { workloadSubject: update.workloadSubject } : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.oauthClients.id, clientId));
      }
      if (update.redirectUris) {
        await tx.delete(schema.oauthClientRedirectUris).where(eq(schema.oauthClientRedirectUris.clientId, clientId));
        for (const uri of update.redirectUris) await tx.insert(schema.oauthClientRedirectUris).values({ clientId, uri });
      }
    });
  }

  async listResources(): Promise<(ApiResource & { scopes: Scope[] })[]> {
    const resources = await this.db.query.apiResources.findMany({ with: { scopes: true } });
    return resources;
  }

  async createScope(apiResourceId: string, name: string, description?: string, isSensitive?: boolean): Promise<string> {
    await this.db
      .insert(schema.scopes)
      .values({ apiResourceId, name, description, isSensitive: isSensitive ?? false })
      .onConflictDoNothing();
    const scope =
      (await this.db.query.scopes.findFirst({ where: and(eq(schema.scopes.apiResourceId, apiResourceId), eq(schema.scopes.name, name)) })) ??
      throwError(new InternalError(`Scope '${name}' could not be provisioned`));
    return scope.id;
  }

  async ensureResource(applicationId: number, identifier: string, displayName?: string): Promise<ApiResource> {
    await this.db.insert(schema.apiResources).values({ applicationId, identifier, displayName }).onConflictDoNothing();
    const resource =
      (await this.db.query.apiResources.findFirst({ where: eq(schema.apiResources.identifier, identifier) })) ??
      throwError(new InternalError(`API resource '${identifier}' could not be provisioned`));
    return resource;
  }

  /** Verifies a client secret against its active (unexpired, unrevoked) secrets, in constant work. */
  async verifySecret(clientId: string, secret: string): Promise<boolean> {
    const active = this.isUuid(clientId)
      ? await this.db
          .select({ secretHash: schema.oauthClientSecrets.secretHash })
          .from(schema.oauthClientSecrets)
          .where(
            and(
              eq(schema.oauthClientSecrets.clientId, clientId),
              isNull(schema.oauthClientSecrets.revokedAt),
              or(isNull(schema.oauthClientSecrets.expiresAt), gt(schema.oauthClientSecrets.expiresAt, new Date())),
            ),
          )
      : [];
    if (active.length === 0) {
      await Bun.password.verify(secret, DUMMY_SECRET_HASH).catch(() => false);
      return false;
    }
    for (const row of active) {
      if (await Bun.password.verify(secret, row.secretHash)) return true;
    }
    return false;
  }

  private async createSecret(clientId: string): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const secretHash = await Bun.password.hash(secret, ARGON2_OPTIONS);
    await this.db.insert(schema.oauthClientSecrets).values({ clientId, secretHash });
    return secret;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}

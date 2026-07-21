/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { ApiResource, DatabaseService, OAuthClient, PrimaryDatabase, schema, Scope } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface RegisterClient {
  /** Fixed client id (UUID) for seed-provisioned clients; omitted ids are database-generated */
  id?: string;
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
  /**
   * Confidential-client authentication method. `client_secret` mints a rotatable secret;
   * `workload_identity` binds a k8s SA subject and mints no secret (D-16). Ignored for public
   * clients, which always use PKCE (`none`). Defaults to `client_secret`.
   */
  authMethod?: ClientAuthMethod;
}

export type ClientAuthMethod = 'client_secret' | 'workload_identity';

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
/** An application may not hold more than this many OAuth clients (first-party clients included). */
const MAX_CLIENTS_PER_APPLICATION = 10;
const DUMMY_SECRET_HASH = '$argon2id$v=19$m=65536,t=3,p=1$NCJqmYBSCaQHCbd96KVjeycfea/Op9Qf6OqrtzsUMkw$YNaWD8v4qxMkTfyuv7T0n+3PYqGqYo+6ixhN31TqX6E';

@Injectable()
export class OAuthClientService {
  private readonly logger = Logger.getLogger(APP_NAME, OAuthClientService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async register(input: RegisterClient): Promise<RegisteredClient> {
    if (input.redirectUris) this.assertValidRedirectUris(input.redirectUris);
    const isPublic = PUBLIC_KINDS.includes(input.kind);
    /**
     * Auth method is exclusive: a workload-identity client authenticates only with its projected
     * SA-token assertion (`private_key_jwt`) and holds no secret; a secret client uses
     * `client_secret_basic`; public clients use PKCE (`none`). A caller signals workload identity
     * explicitly via `authMethod`, or implicitly by supplying a `workloadSubject` with no method —
     * the long-standing seed/admin shape (D-16).
     */
    const isWorkload = !isPublic && (input.authMethod === 'workload_identity' || (input.authMethod === undefined && input.workloadSubject != null));
    if (isWorkload && !input.workloadSubject) throw AppErrorCode.ADM_005.create();
    const authMethod: OAuthClient.AuthMethod = isPublic ? 'none' : isWorkload ? 'private_key_jwt' : 'client_secret_basic';

    const clientId = await this.db.transaction(async tx => {
      const existing = await tx.$count(schema.oauthClients, eq(schema.oauthClients.applicationId, input.applicationId));
      if (existing >= MAX_CLIENTS_PER_APPLICATION) throw AppErrorCode.ADM_004.create();

      const client = await tx
        .insert(schema.oauthClients)
        .values({
          ...(input.id ? { id: input.id } : {}),
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
          workloadSubject: isWorkload ? input.workloadSubject : null,
        })
        .returning({ id: schema.oauthClients.id })
        .then(([row]) => row ?? throwError(AppError.internal('Failed to create OAuth client')));

      for (const uri of input.redirectUris ?? []) await tx.insert(schema.oauthClientRedirectUris).values({ clientId: client.id, uri });
      for (const scopeId of input.scopeIds ?? []) await tx.insert(schema.oauthClientScopeGrants).values({ clientId: client.id, scopeId });
      return client.id;
    });

    /** Only secret clients receive a secret; workload and public clients never hold one. */
    const secret = authMethod === 'client_secret_basic' ? await this.createSecret(clientId) : undefined;
    this.logger.info('Registered OAuth client', { clientId, kind: input.kind, authMethod });
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
      throwError(AppError.internal(`API resource '${resourceIdentifier}' could not be provisioned`));

    await this.db.insert(schema.scopes).values({ apiResourceId: resource.id, name: scopeName }).onConflictDoNothing();
    const scope =
      (await this.db.query.scopes.findFirst({ where: and(eq(schema.scopes.apiResourceId, resource.id), eq(schema.scopes.name, scopeName)) })) ??
      throwError(AppError.internal(`Scope '${scopeName}' could not be provisioned`));
    return scope.id;
  }

  /** Grants an already-provisioned scope to a client, tolerating re-grants. */
  async grantScope(clientId: string, scopeId: string): Promise<void> {
    await this.db.insert(schema.oauthClientScopeGrants).values({ clientId, scopeId }).onConflictDoNothing();
  }

  /**
   * Removes scopes the given principal kind may not hold: a user flow drops `SERVICE`-only scopes, a
   * service flow drops `USER`-only scopes. Names absent from the catalog (OIDC protocol scopes such as
   * `openid`/`profile`/`email`) pass through untouched, so a user token still carries them.
   */
  async filterScopesForPrincipal(scopeNames: string[], kind: 'user' | 'service'): Promise<string[]> {
    if (scopeNames.length === 0) return scopeNames;
    const rows = await this.db.query.scopes.findMany({ where: inArray(schema.scopes.name, scopeNames), columns: { name: true, principalType: true } });
    const disallowed = kind === 'user' ? 'SERVICE' : 'USER';
    const disallowedNames = new Set(rows.filter(row => row.principalType === disallowed).map(row => row.name));
    return scopeNames.filter(name => !disallowedNames.has(name));
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
   * Installs an externally provided secret as the client's only active secret, revoking every other
   * one. Backs env-driven credential rotation (ecosystem seed): the environment is the source of
   * truth, so no overlap window applies. The secret value itself is never logged.
   */
  async setSecret(clientId: string, secret: string): Promise<void> {
    const secretHash = await Bun.password.hash(secret, ARGON2_OPTIONS);
    await this.db.transaction(async tx => {
      await tx
        .update(schema.oauthClientSecrets)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.oauthClientSecrets.clientId, clientId), isNull(schema.oauthClientSecrets.revokedAt)));
      await tx.insert(schema.oauthClientSecrets).values({ clientId, secretHash });
    });
    this.logger.info('Installed externally provided client secret', { clientId });
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

  async listClients(applicationId?: number): Promise<OAuthClient[]> {
    return this.db.query.oauthClients.findMany({
      ...(applicationId !== undefined ? { where: eq(schema.oauthClients.applicationId, applicationId) } : {}),
    });
  }

  /** Maps the stored token-endpoint auth method to the public auth-method the console renders. */
  static toAuthMethod(method: OAuthClient.AuthMethod): 'none' | 'client_secret' | 'workload_identity' {
    if (method === 'none') return 'none';
    if (method === 'private_key_jwt') return 'workload_identity';
    return 'client_secret';
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
    if (update.redirectUris) this.assertValidRedirectUris(update.redirectUris);
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

  /**
   * Permanently removes a client. FK-cascade children (secrets, redirect URIs, scope grants, logout
   * deliveries, and the M2M route allowlist) are dropped by the database; consents and refresh-token
   * families reference the client by a plain id with no cascade, so they are cleared explicitly to
   * avoid dangling rows. Already-issued stateless access tokens are not stored and survive until they
   * expire (bounded by the client's short access-token TTL).
   */
  async deleteClient(clientId: string): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.delete(schema.consents).where(eq(schema.consents.clientId, clientId));
      await tx.delete(schema.refreshTokenFamilies).where(eq(schema.refreshTokenFamilies.clientId, clientId));
      await tx.delete(schema.oauthClients).where(eq(schema.oauthClients.id, clientId));
    });
    this.logger.info('Deleted OAuth client', { clientId });
  }

  /**
   * Rejects redirect URIs that are not absolute URLs or that carry a fragment. A registered target
   * must be an exact absolute URI (C-5); RFC 6749 §3.1.2 forbids a fragment component.
   */
  private assertValidRedirectUris(uris: string[]): void {
    for (const uri of uris) {
      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw AppErrorCode.ADM_003.create();
      }
      if (parsed.hash) throw AppErrorCode.ADM_003.create();
    }
  }

  async listResources(): Promise<(ApiResource & { scopes: Scope[] })[]> {
    const resources = await this.db.query.apiResources.findMany({ with: { scopes: true } });
    return resources;
  }

  async createScope(apiResourceId: string, name: string, description?: string, isSensitive?: boolean, principalType?: 'USER' | 'SERVICE' | 'BOTH'): Promise<string> {
    await this.db
      .insert(schema.scopes)
      .values({ apiResourceId, name, description, isSensitive: isSensitive ?? false, principalType: principalType ?? 'BOTH' })
      .onConflictDoNothing();
    const scope =
      (await this.db.query.scopes.findFirst({ where: and(eq(schema.scopes.apiResourceId, apiResourceId), eq(schema.scopes.name, name)) })) ??
      throwError(AppError.internal(`Scope '${name}' could not be provisioned`));
    return scope.id;
  }

  async ensureResource(applicationId: number, identifier: string, displayName?: string): Promise<ApiResource> {
    await this.db.insert(schema.apiResources).values({ applicationId, identifier, displayName }).onConflictDoNothing();
    const resource =
      (await this.db.query.apiResources.findFirst({ where: eq(schema.apiResources.identifier, identifier) })) ??
      throwError(AppError.internal(`API resource '${identifier}' could not be provisioned`));
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

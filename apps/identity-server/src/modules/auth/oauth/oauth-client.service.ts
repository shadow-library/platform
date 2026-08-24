import { randomBytes, randomUUID } from 'node:crypto';

import { and, arrayContains, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, OIDC_PROTOCOL_SCOPES } from '@server/constants';
import { type ElevationIntent } from '@server/modules/auth/session';
import { ApiResource, DatabaseService, OAuthClient, PrimaryDatabase, schema, Scope } from '@server/modules/infrastructure/datastore';

import { applicationAudience, DEFAULT_AUDIENCE, OAUTH_CALLBACK_PATH, TOKEN_EXCHANGE_GRANT } from './oauth.constants';
import { assertValidWorkloadBinding, isWorkloadPattern, matchesWorkloadBinding } from './workload-subject.util';

export interface RegisterClient {
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
  workloadSubjects?: string[];
  authMethod?: ClientAuthMethod;
}

export type ClientAuthMethod = 'client_secret' | 'workload_identity';

export interface ProvisionedApplication {
  clientId: string;
  secret?: string;
  audience: string;
  created: boolean;
}

export interface ApplicationDescription {
  appId: string;
  name?: string;
  isFirstParty: boolean;
  audience: string | null;
  redirectUris: string[];
  scopes: string[];
  sensitiveScopes: string[];
  grants: { audience: string; scopes: string[] }[];
  accessTokenTtl: number;
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
  workloadSubjects?: string[] | null;
}

export interface RotatedSecret {
  secret: string;
  previousSecretsExpireAt: Date;
}

export interface GrantedScope {
  name: string;
  resourceIdentifier: string;
  isSensitive: boolean;
}

type PrimaryTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

const ARGON2_OPTIONS = { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 } as const;
const PUBLIC_KINDS: OAuthClient.Kind[] = ['SPA_PUBLIC', 'NATIVE_PUBLIC'];
const MAX_CLIENTS_PER_APPLICATION = 10;
const CLIENT_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/;
const RESERVED_CLIENT_IDS = new Set(['shadow-identity']);
const DUMMY_SECRET_HASH = '$argon2id$v=19$m=65536,t=3,p=1$NCJqmYBSCaQHCbd96KVjeycfea/Op9Qf6OqrtzsUMkw$YNaWD8v4qxMkTfyuv7T0n+3PYqGqYo+6ixhN31TqX6E';
const SCOPE_NAMES_TTL_SECONDS = 300;

@Injectable()
export class OAuthClientService {
  private readonly logger = Logger.getLogger(APP_NAME, OAuthClientService.name);
  private readonly db: PrimaryDatabase;

  private activeScopeNames: string[] | null = null;
  private activeScopeNamesAt = 0;
  private activeScopeNamesInflight: Promise<string[]> | null = null;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async register(input: RegisterClient): Promise<RegisteredClient> {
    if (input.redirectUris) this.assertValidRedirectUris(input.redirectUris);
    if (input.id !== undefined) this.assertValidClientId(input.id);
    const isPublic = PUBLIC_KINDS.includes(input.kind);
    const workloadSubjects = input.workloadSubjects ?? [];
    const isWorkload = !isPublic && (input.authMethod === 'workload_identity' || (input.authMethod === undefined && workloadSubjects.length > 0));
    if (isWorkload && workloadSubjects.length === 0) throw AppErrorCode.ADM_005.create();
    for (const subject of workloadSubjects) assertValidWorkloadBinding(subject);
    const authMethod: OAuthClient.AuthMethod = isPublic ? 'none' : isWorkload ? 'private_key_jwt' : 'client_secret_basic';
    const clientId = input.id ?? randomUUID();

    await this.db.transaction(async tx => {
      const existing = await tx.$count(schema.oauthClients, eq(schema.oauthClients.applicationId, input.applicationId));
      if (existing >= MAX_CLIENTS_PER_APPLICATION) throw AppErrorCode.ADM_004.create();
      if (isWorkload) await this.assertExactSubjectsUnclaimed(tx, clientId, workloadSubjects);

      await tx.insert(schema.oauthClients).values({
        id: clientId,
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
        workloadSubjects: isWorkload ? workloadSubjects : null,
      });

      for (const uri of input.redirectUris ?? []) await tx.insert(schema.oauthClientRedirectUris).values({ clientId, uri });
      for (const scopeId of input.scopeIds ?? []) await tx.insert(schema.oauthClientScopeGrants).values({ clientId, scopeId });
    });

    const secret = authMethod === 'client_secret_basic' ? await this.createSecret(clientId) : undefined;
    this.logger.info('Registered OAuth client', { clientId, kind: input.kind, authMethod });
    return { clientId, secret };
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    if (!this.isValidClientId(clientId)) return null;
    const client = await this.db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, clientId) });
    return client ?? null;
  }

  async resolveClientBySubject(subject: string): Promise<OAuthClient | null> {
    const client = await this.db.query.oauthClients.findFirst({ where: arrayContains(schema.oauthClients.workloadSubjects, [subject]) });
    return client ?? null;
  }

  subjectMatchesClient(client: OAuthClient, subject: string): boolean {
    return (client.workloadSubjects ?? []).some(binding => matchesWorkloadBinding(binding, subject));
  }

  async isRedirectUriAllowed(clientId: string, uri: string): Promise<boolean> {
    if (!this.isValidClientId(clientId)) return false;
    const match = await this.db.query.oauthClientRedirectUris.findFirst({
      where: and(eq(schema.oauthClientRedirectUris.clientId, clientId), eq(schema.oauthClientRedirectUris.uri, uri)),
    });
    return Boolean(match);
  }

  async ensureScope(applicationId: number, resourceIdentifier: string, scopeName: string, principalType?: 'USER' | 'SERVICE' | 'BOTH'): Promise<string> {
    await this.db.insert(schema.apiResources).values({ applicationId, identifier: resourceIdentifier }).onConflictDoNothing();
    const resource =
      (await this.db.query.apiResources.findFirst({ where: eq(schema.apiResources.identifier, resourceIdentifier) })) ??
      throwError(AppError.internal(`API resource '${resourceIdentifier}' could not be provisioned`));

    await this.db
      .insert(schema.scopes)
      .values({ apiResourceId: resource.id, name: scopeName, principalType: principalType ?? 'BOTH' })
      .onConflictDoNothing();
    const scope =
      (await this.db.query.scopes.findFirst({ where: and(eq(schema.scopes.apiResourceId, resource.id), eq(schema.scopes.name, scopeName)) })) ??
      throwError(AppError.internal(`Scope '${scopeName}' could not be provisioned`));
    return scope.id;
  }

  async ensureRedirectUris(clientId: string, uris: string[]): Promise<void> {
    this.assertValidRedirectUris(uris);
    for (const uri of uris) await this.db.insert(schema.oauthClientRedirectUris).values({ clientId, uri }).onConflictDoNothing();
  }

  async removeRedirectUri(clientId: string, uri: string): Promise<void> {
    await this.db.delete(schema.oauthClientRedirectUris).where(and(eq(schema.oauthClientRedirectUris.clientId, clientId), eq(schema.oauthClientRedirectUris.uri, uri)));
  }

  async grantScope(clientId: string, scopeId: string): Promise<void> {
    await this.db.insert(schema.oauthClientScopeGrants).values({ clientId, scopeId }).onConflictDoNothing();
  }

  async filterScopesForPrincipal(scopeNames: string[], kind: 'user' | 'service'): Promise<string[]> {
    if (scopeNames.length === 0) return scopeNames;
    const rows = await this.db.query.scopes.findMany({ where: inArray(schema.scopes.name, scopeNames), columns: { name: true, principalType: true } });
    const disallowed = kind === 'user' ? 'SERVICE' : 'USER';
    const disallowedNames = new Set(rows.filter(row => row.principalType === disallowed).map(row => row.name));
    return scopeNames.filter(name => !disallowedNames.has(name));
  }

  async resolveElevationIntent(clientId?: string, resource?: string): Promise<ElevationIntent | null> {
    if (!clientId) return null;
    const client = await this.getClient(clientId);
    if (!client || !client.isActive) throw AppErrorCode.OAU_002.create();
    return { clientId: client.id, resource: resource ?? DEFAULT_AUDIENCE };
  }

  async resolveApplicationLabel(clientId: string): Promise<string | null> {
    const client = await this.getClient(clientId);
    if (!client || !client.isActive) return null;
    const application = await this.db.query.applications.findFirst({ where: eq(schema.applications.id, client.applicationId), columns: { name: true, displayName: true } });
    if (!application) return null;
    return application.displayName ?? application.name;
  }

  async provisionApplicationIdentity(input: { applicationId: number; name: string; publicUrls?: string[]; isFirstParty?: boolean }): Promise<ProvisionedApplication> {
    const audience = applicationAudience(input.name);
    await this.ensureResource(input.applicationId, audience, `${input.name} API`);

    const existing = await this.getClient(input.name);
    if (existing) return { clientId: existing.id, audience, created: false };

    const registered = await this.register({
      id: input.name,
      applicationId: input.applicationId,
      name: input.name,
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: input.isFirstParty ?? true,
      grantTypes: ['authorization_code', 'client_credentials', TOKEN_EXCHANGE_GRANT],
      redirectUris: (input.publicUrls ?? []).map(origin => `${origin}${OAUTH_CALLBACK_PATH}`),
    });
    return { clientId: registered.clientId, secret: registered.secret, audience, created: true };
  }

  async describeApplication(clientId: string): Promise<ApplicationDescription | null> {
    const client = await this.getClient(clientId);
    if (!client || !client.isActive) return null;

    const application = await this.db.query.applications.findFirst({ where: eq(schema.applications.id, client.applicationId), columns: { name: true, displayName: true } });
    if (!application) return null;

    const owned = await this.db
      .select({ identifier: schema.apiResources.identifier, scope: schema.scopes.name, isSensitive: schema.scopes.isSensitive })
      .from(schema.apiResources)
      .leftJoin(schema.scopes, eq(schema.scopes.apiResourceId, schema.apiResources.id))
      .where(and(eq(schema.apiResources.applicationId, client.applicationId), eq(schema.apiResources.isActive, true)));

    const redirectUris = await this.db
      .select({ uri: schema.oauthClientRedirectUris.uri })
      .from(schema.oauthClientRedirectUris)
      .where(eq(schema.oauthClientRedirectUris.clientId, client.id));

    const ownIdentifiers = new Set(owned.map(row => row.identifier));
    const foreign = (await this.getGrantedScopes(client.id)).filter(scope => !ownIdentifiers.has(scope.resourceIdentifier));
    const byAudience = new Map<string, string[]>();
    for (const scope of foreign) byAudience.set(scope.resourceIdentifier, [...(byAudience.get(scope.resourceIdentifier) ?? []), scope.name]);

    return {
      appId: application.name,
      name: application.displayName ?? undefined,
      isFirstParty: client.isFirstParty,
      audience: owned.find(row => row.identifier === applicationAudience(application.name))?.identifier ?? owned[0]?.identifier ?? null,
      redirectUris: redirectUris.map(row => row.uri),
      scopes: owned.filter(row => row.scope && !row.isSensitive).map(row => row.scope as string),
      sensitiveScopes: owned.filter(row => row.scope && row.isSensitive).map(row => row.scope as string),
      grants: [...byAudience].map(([audience, scopes]) => ({ audience, scopes })),
      accessTokenTtl: client.accessTokenTtl,
    };
  }

  async getResourceOwner(identifier: string): Promise<number | null> {
    const resource = await this.db.query.apiResources.findFirst({
      where: and(eq(schema.apiResources.identifier, identifier), eq(schema.apiResources.isActive, true)),
      columns: { applicationId: true },
    });
    return resource?.applicationId ?? null;
  }

  async isOwnAudience(client: OAuthClient, identifier: string): Promise<boolean> {
    const ownerApplicationId = await this.getResourceOwner(identifier);
    if (ownerApplicationId === null || ownerApplicationId !== client.applicationId) return false;
    const application = await this.db.query.applications.findFirst({ where: eq(schema.applications.id, client.applicationId), columns: { name: true } });
    return application !== undefined && applicationAudience(application.name) === identifier;
  }

  async isRegisteredResource(identifier: string): Promise<boolean> {
    const resource = await this.db.query.apiResources.findFirst({
      where: and(eq(schema.apiResources.identifier, identifier), eq(schema.apiResources.isActive, true)),
      columns: { id: true },
    });
    return resource !== undefined;
  }

  async getGrantedScopes(clientId: string): Promise<GrantedScope[]> {
    if (!this.isValidClientId(clientId)) return [];
    return this.db
      .select({ name: schema.scopes.name, resourceIdentifier: schema.apiResources.identifier, isSensitive: schema.scopes.isSensitive })
      .from(schema.oauthClientScopeGrants)
      .innerJoin(schema.scopes, eq(schema.oauthClientScopeGrants.scopeId, schema.scopes.id))
      .innerJoin(schema.apiResources, eq(schema.scopes.apiResourceId, schema.apiResources.id))
      .where(and(eq(schema.oauthClientScopeGrants.clientId, clientId), eq(schema.apiResources.isActive, true)));
  }

  /** A client reaches a scope on an audience either through an explicit cross-resource grant or, on its own application's canonical audience, by declaring it. */
  async getAvailableScopes(client: OAuthClient, audience: string): Promise<Map<string, GrantedScope>> {
    const granted = (await this.getGrantedScopes(client.id)).filter(scope => scope.resourceIdentifier === audience);
    const owned = (await this.isOwnAudience(client, audience)) ? await this.listResourceScopes(audience) : [];
    return new Map([...granted, ...owned].map(scope => [scope.name, scope]));
  }

  private async listResourceScopes(identifier: string): Promise<GrantedScope[]> {
    return this.db
      .select({ name: schema.scopes.name, resourceIdentifier: schema.apiResources.identifier, isSensitive: schema.scopes.isSensitive })
      .from(schema.apiResources)
      .innerJoin(schema.scopes, eq(schema.scopes.apiResourceId, schema.apiResources.id))
      .where(and(eq(schema.apiResources.identifier, identifier), eq(schema.apiResources.isActive, true)));
  }

  async getGrantedScopeNames(clientId: string): Promise<string[]> {
    const granted = await this.getGrantedScopes(clientId);
    return granted.map(scope => scope.name);
  }

  async listActiveScopeNames(): Promise<string[]> {
    const cached = this.activeScopeNames;
    if (cached && Date.now() - this.activeScopeNamesAt < SCOPE_NAMES_TTL_SECONDS * 1000) return cached;

    this.activeScopeNamesInflight ??= this.queryActiveScopeNames().finally(() => (this.activeScopeNamesInflight = null));
    return this.activeScopeNamesInflight;
  }

  private async queryActiveScopeNames(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: schema.scopes.name })
      .from(schema.scopes)
      .innerJoin(schema.apiResources, eq(schema.scopes.apiResourceId, schema.apiResources.id))
      .where(eq(schema.apiResources.isActive, true));
    const names = [...new Set([...OIDC_PROTOCOL_SCOPES, ...rows.map(row => row.name)])].sort();

    this.activeScopeNames = names;
    this.activeScopeNamesAt = Date.now();
    return names;
  }

  async rotateSecret(clientId: string): Promise<string> {
    return this.createSecret(clientId);
  }

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

  async updateClient(clientId: string, update: UpdateClient): Promise<void> {
    if (update.redirectUris) this.assertValidRedirectUris(update.redirectUris);
    const workloadSubjects = update.workloadSubjects === undefined ? undefined : (update.workloadSubjects ?? []);
    if (workloadSubjects) for (const subject of workloadSubjects) assertValidWorkloadBinding(subject);
    await this.db.transaction(async tx => {
      if (workloadSubjects) await this.assertExactSubjectsUnclaimed(tx, clientId, workloadSubjects);
      if (update.name !== undefined || update.isActive !== undefined || update.backchannelLogoutUri !== undefined || workloadSubjects !== undefined) {
        await tx
          .update(schema.oauthClients)
          .set({
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.isActive !== undefined ? { isActive: update.isActive } : {}),
            ...(update.backchannelLogoutUri !== undefined ? { backchannelLogoutUri: update.backchannelLogoutUri } : {}),
            ...(workloadSubjects !== undefined ? { workloadSubjects: workloadSubjects.length > 0 ? workloadSubjects : null } : {}),
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

  async deleteClient(clientId: string): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.delete(schema.consents).where(eq(schema.consents.clientId, clientId));
      await tx.delete(schema.refreshTokenFamilies).where(eq(schema.refreshTokenFamilies.clientId, clientId));
      await tx.delete(schema.oauthClients).where(eq(schema.oauthClients.id, clientId));
    });
    this.logger.info('Deleted OAuth client', { clientId });
  }

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

  async verifySecret(clientId: string, secret: string): Promise<boolean> {
    const active = this.isValidClientId(clientId)
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

  private isValidClientId(value: string): boolean {
    return CLIENT_ID_PATTERN.test(value);
  }

  private assertValidClientId(id: string): void {
    if (!CLIENT_ID_PATTERN.test(id) || RESERVED_CLIENT_IDS.has(id)) throw AppErrorCode.ADM_006.create();
  }

  private async assertExactSubjectsUnclaimed(tx: PrimaryTransaction, clientId: string, subjects: string[]): Promise<void> {
    for (const subject of subjects.filter(value => !isWorkloadPattern(value))) {
      const conflict = await tx.query.oauthClients.findFirst({
        where: and(arrayContains(schema.oauthClients.workloadSubjects, [subject]), ne(schema.oauthClients.id, clientId)),
        columns: { id: true },
      });
      if (conflict) throw AppErrorCode.ADM_007.create();
    }
  }
}

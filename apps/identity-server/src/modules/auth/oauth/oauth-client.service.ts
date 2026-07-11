/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, OAuthClient, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

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
}

export interface RegisteredClient {
  clientId: string;
  secret?: string;
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
      const [client] = await tx
        .insert(schema.oauthClients)
        .values({
          applicationId: input.applicationId,
          name: input.name,
          kind: input.kind,
          isFirstParty: input.isFirstParty ?? false,
          tokenEndpointAuthMethod: authMethod,
          grantTypes: input.grantTypes,
          requirePkce: true,
          accessTokenTtl: input.accessTokenTtl ?? 600,
          organisationId: input.organisationId ?? null,
        })
        .returning({ id: schema.oauthClients.id });
      if (!client) throw new Error('Failed to create OAuth client');

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

  /** Exact-string redirect-URI match — no wildcards or substring logic (C-5). */
  async isRedirectUriAllowed(clientId: string, uri: string): Promise<boolean> {
    if (!this.isUuid(clientId)) return false;
    const match = await this.db.query.oauthClientRedirectUris.findFirst({
      where: and(eq(schema.oauthClientRedirectUris.clientId, clientId), eq(schema.oauthClientRedirectUris.uri, uri)),
    });
    return Boolean(match);
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

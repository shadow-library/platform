import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { KeyService } from '@server/modules/auth/keys';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** The outbound M2M client identity is looked up by this exact name, so it must stay `identity-server`. */
export const OUTBOUND_SERVICE_CLIENT_NAME = 'identity-server';

const REFRESH_SKEW_MS = 30_000;

/**
 * Mints identity's own outbound M2M tokens. Identity is the issuer, so it signs the token directly
 * rather than running a client-credentials round trip against itself; the grant is still proven from
 * `oauth_client_scope_grants`, so an unprovisioned scope fails here rather than at the callee.
 */
@Injectable()
export class ServiceTokenService {
  private readonly logger = Logger.getLogger(APP_NAME, ServiceTokenService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly db: PrimaryDatabase;
  private readonly cache = new Map<string, CachedToken>();

  constructor(
    databaseService: DatabaseService,
    private readonly keyService: KeyService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async getToken(audience: string, scope: string): Promise<string> {
    const cacheKey = `${audience}|${scope}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt - REFRESH_SKEW_MS > Date.now()) return cached.token;

    const minted = await this.mint(audience, scope);
    this.cache.set(cacheKey, minted);
    return minted.token;
  }

  /** Both halves are required: the cache is shared across callers, so a partially-specified drop would evict another caller's token. */
  invalidate(audience: string, scope: string): void {
    this.cache.delete(`${audience}|${scope}`);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private async mint(audience: string, scope: string): Promise<CachedToken> {
    const [client] = await this.db
      .select({ id: schema.oauthClients.id, accessTokenTtl: schema.oauthClients.accessTokenTtl })
      .from(schema.oauthClients)
      .innerJoin(schema.applications, eq(schema.oauthClients.applicationId, schema.applications.id))
      .where(
        and(
          eq(schema.applications.name, APP_NAME),
          eq(schema.oauthClients.name, OUTBOUND_SERVICE_CLIENT_NAME),
          eq(schema.oauthClients.kind, 'SERVICE'),
          eq(schema.oauthClients.isActive, true),
        ),
      );
    if (!client) throw AppError.internal(`Service client '${OUTBOUND_SERVICE_CLIENT_NAME}' is not provisioned`);

    const grants = await this.db
      .select({ name: schema.scopes.name })
      .from(schema.oauthClientScopeGrants)
      .innerJoin(schema.scopes, eq(schema.oauthClientScopeGrants.scopeId, schema.scopes.id))
      .where(and(eq(schema.oauthClientScopeGrants.clientId, client.id), eq(schema.scopes.name, scope)));
    if (grants.length === 0) throw AppError.internal(`Scope '${scope}' is not granted to service client '${OUTBOUND_SERVICE_CLIENT_NAME}'`);

    const iat = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.issuer,
      sub: client.id,
      aud: audience,
      client_id: client.id,
      scope,
      token_type: 'service',
      iat,
      exp: iat + client.accessTokenTtl,
      jti: randomUUID(),
    };
    const { token } = this.keyService.sign(claims);
    this.logger.debug('minted outbound service token', { clientId: client.id, audience, scope, expiresAt: claims.exp });
    return { token, expiresAt: claims.exp * 1000 };
  }
}

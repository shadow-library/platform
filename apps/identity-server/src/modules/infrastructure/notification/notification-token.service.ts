/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { KeyService } from '@server/modules/auth/keys';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Declaring the constants
 */
const SERVICE_CLIENT_NAME = 'identity-server';
const NOTIFICATIONS_SEND_SCOPE = 'notifications:send';
/** Refresh this long before `exp` so an in-flight dispatch never presents an already-expired token. */
const REFRESH_SKEW_MS = 30_000;

/**
 * Mints the M2M service token identity attaches to its pulse-server notification calls. Identity
 * is the issuer itself and never persists its own client secret in plaintext, so instead of
 * round-tripping through its own `/oauth2/token` endpoint it signs the token in-process with the
 * active OIDC key (mirroring {@link BackChannelLogoutService}), replicating the exact claim shape
 * of the `client_credentials` grant — verifiers cannot tell the difference. The scope grant is
 * still checked against the database so seed drift surfaces here as an explicit error instead of
 * an opaque 403 from pulse. Tokens are cached until shortly before expiry.
 */
@Injectable()
export class NotificationTokenService {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationTokenService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly audience = Config.get('notification.audience');
  private readonly db: PrimaryDatabase;
  private cached: CachedToken | null = null;

  constructor(
    databaseService: DatabaseService,
    private readonly keyService: KeyService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - REFRESH_SKEW_MS > Date.now()) return this.cached.token;
    this.cached = await this.mint();
    return this.cached.token;
  }

  /** Drops the cached token so the next dispatch mints a fresh one; called when pulse rejects it. */
  invalidate(): void {
    this.cached = null;
  }

  private async mint(): Promise<CachedToken> {
    const [client] = await this.db
      .select({ id: schema.oauthClients.id, accessTokenTtl: schema.oauthClients.accessTokenTtl })
      .from(schema.oauthClients)
      .innerJoin(schema.applications, eq(schema.oauthClients.applicationId, schema.applications.id))
      .where(and(eq(schema.applications.name, APP_NAME), eq(schema.oauthClients.name, SERVICE_CLIENT_NAME), eq(schema.oauthClients.kind, 'SERVICE'), eq(schema.oauthClients.isActive, true)));
    if (!client) throw AppError.internal(`Service client '${SERVICE_CLIENT_NAME}' is not provisioned`);

    const grants = await this.db
      .select({ name: schema.scopes.name })
      .from(schema.oauthClientScopeGrants)
      .innerJoin(schema.scopes, eq(schema.oauthClientScopeGrants.scopeId, schema.scopes.id))
      .where(and(eq(schema.oauthClientScopeGrants.clientId, client.id), eq(schema.scopes.name, NOTIFICATIONS_SEND_SCOPE)));
    if (grants.length === 0) throw AppError.internal(`Scope '${NOTIFICATIONS_SEND_SCOPE}' is not granted to service client '${SERVICE_CLIENT_NAME}'`);

    /** Claim order and shape mirror `AccessTokenService.mintAccessToken` for the `client_credentials` grant. */
    const iat = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.issuer,
      sub: client.id,
      aud: this.audience,
      client_id: client.id,
      scope: NOTIFICATIONS_SEND_SCOPE,
      token_type: 'service',
      iat,
      exp: iat + client.accessTokenTtl,
      jti: randomUUID(),
    };
    const { token } = this.keyService.sign(claims);
    this.logger.debug('minted service token for pulse dispatch', { clientId: client.id, audience: this.audience, expiresAt: claims.exp });
    return { token, expiresAt: claims.exp * 1000 };
  }
}

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

const SERVICE_CLIENT_NAME = 'identity-server';
const NOTIFICATIONS_SEND_SCOPE = 'notifications:send';
const REFRESH_SKEW_MS = 30_000;

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

  invalidate(): void {
    this.cached = null;
  }

  private async mint(): Promise<CachedToken> {
    const [client] = await this.db
      .select({ id: schema.oauthClients.id, accessTokenTtl: schema.oauthClients.accessTokenTtl })
      .from(schema.oauthClients)
      .innerJoin(schema.applications, eq(schema.oauthClients.applicationId, schema.applications.id))
      .where(
        and(
          eq(schema.applications.name, APP_NAME),
          eq(schema.oauthClients.name, SERVICE_CLIENT_NAME),
          eq(schema.oauthClients.kind, 'SERVICE'),
          eq(schema.oauthClients.isActive, true),
        ),
      );
    if (!client) throw AppError.internal(`Service client '${SERVICE_CLIENT_NAME}' is not provisioned`);

    const grants = await this.db
      .select({ name: schema.scopes.name })
      .from(schema.oauthClientScopeGrants)
      .innerJoin(schema.scopes, eq(schema.oauthClientScopeGrants.scopeId, schema.scopes.id))
      .where(and(eq(schema.oauthClientScopeGrants.clientId, client.id), eq(schema.scopes.name, NOTIFICATIONS_SEND_SCOPE)));
    if (grants.length === 0) throw AppError.internal(`Scope '${NOTIFICATIONS_SEND_SCOPE}' is not granted to service client '${SERVICE_CLIENT_NAME}'`);

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

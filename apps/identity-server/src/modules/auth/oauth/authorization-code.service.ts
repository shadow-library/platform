import { createHash, randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { RefreshTokenService } from '@server/modules/auth/token';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

export interface AuthorizationCodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  nonce?: string;
  resource?: string;
  userId: string;
  sessionId: string;
  organisationId?: string;
}

type SpentCode = Pick<AuthorizationCodePayload, 'clientId' | 'userId' | 'sessionId'>;

const CODE_TTL_SECONDS = 60;
const SPENT_CODE_TTL_SECONDS = 3600;

@Injectable()
export class AuthorizationCodeService {
  private readonly logger = Logger.getLogger(APP_NAME, AuthorizationCodeService.name);
  private readonly redis: Redis;
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
  ) {
    this.redis = databaseService.getRedisClient();
    this.db = databaseService.getPostgresClient();
  }

  private key(code: string): string {
    return `authz_code:${createHash('sha256').update(code).digest('hex')}`;
  }

  private spentKey(code: string): string {
    return `authz_code_spent:${createHash('sha256').update(code).digest('hex')}`;
  }

  async issue(payload: AuthorizationCodePayload): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(this.key(code), JSON.stringify(payload), 'EX', CODE_TTL_SECONDS);
    this.logger.debug('issued authorization code', { clientId: payload.clientId, userId: payload.userId, sessionId: payload.sessionId, ttlSeconds: CODE_TTL_SECONDS });
    return code;
  }

  async consume(code: string): Promise<AuthorizationCodePayload | null> {
    const raw = await this.redis.getdel(this.key(code));
    if (!raw) {
      await this.revokeIfReplayed(code);
      return null;
    }
    const payload = JSON.parse(raw) as AuthorizationCodePayload;
    const spent: SpentCode = { clientId: payload.clientId, userId: payload.userId, sessionId: payload.sessionId };
    await this.redis.set(this.spentKey(code), JSON.stringify(spent), 'EX', SPENT_CODE_TTL_SECONDS);
    this.logger.debug('consumed authorization code', { clientId: payload.clientId, userId: payload.userId });
    return payload;
  }

  /**
   * RFC 6749 §4.1.2: a code presented twice means it leaked, so whatever its first redemption minted — the refresh
   * family or the app session for that client under that identity session — is revoked, whichever path either came through.
   */
  private async revokeIfReplayed(code: string): Promise<void> {
    const raw = await this.redis.get(this.spentKey(code));
    if (!raw) {
      this.logger.debug('authorization code consume miss: unknown or expired');
      return;
    }

    const spent = JSON.parse(raw) as SpentCode;
    const sessionId = BigInt(spent.sessionId);
    await this.refreshTokenService.revokeForSessionClient(sessionId, spent.clientId);
    await this.db
      .update(schema.appSessions)
      .set({ status: 'REVOKED', terminatedAt: new Date() })
      .where(and(eq(schema.appSessions.identitySessionId, sessionId), eq(schema.appSessions.clientId, spent.clientId), eq(schema.appSessions.status, 'ACTIVE')));
    await this.auditService.record({
      action: 'security.authorization_code_replayed',
      outcome: 'FAILURE',
      actorType: 'USER',
      actorId: spent.userId,
      targetType: 'oauth_client',
      targetId: spent.clientId,
    });
    this.logger.warn('authorization code replayed; the grants redeemed from it are revoked', { securityEvent: 'oauth.code_replayed', clientId: spent.clientId });
  }
}

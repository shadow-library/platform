import { createHash, randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
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

type CodeOwner = Pick<AuthorizationCodePayload, 'clientId' | 'userId' | 'sessionId'>;

const CODE_TTL_SECONDS = 60;
const SPENT_CODE_TTL_SECONDS = 3600;
const SPENT = 'spent';

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

  private key(code: string, kind: 'code' | 'owner' | 'replayed' = 'code'): string {
    const prefix = kind === 'code' ? 'authz_code' : `authz_code_${kind}`;
    return `${prefix}:${createHash('sha256').update(code).digest('hex')}`;
  }

  async issue(payload: AuthorizationCodePayload): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const owner: CodeOwner = { clientId: payload.clientId, userId: payload.userId, sessionId: payload.sessionId };
    await this.redis.set(this.key(code, 'owner'), JSON.stringify(owner), 'EX', SPENT_CODE_TTL_SECONDS);
    await this.redis.set(this.key(code), JSON.stringify(payload), 'EX', CODE_TTL_SECONDS);
    this.logger.debug('issued authorization code', { clientId: payload.clientId, userId: payload.userId, sessionId: payload.sessionId, ttlSeconds: CODE_TTL_SECONDS });
    return code;
  }

  /** Reading the code and marking it spent is one transaction, so no presentation can slip between a redemption and its marker. */
  async consume(code: string): Promise<AuthorizationCodePayload | null> {
    const results =
      (await this.redis.multi().call('GET', this.key(code)).call('SET', this.key(code), SPENT, 'XX', 'EX', SPENT_CODE_TTL_SECONDS).exec()) ??
      throwError(AppError.internal('Authorization code transaction aborted'));
    const [read, marked] = results;
    const failure = read?.[0] ?? marked?.[0];
    if (failure) throw failure;

    const previous = read?.[1];
    if (previous === SPENT) {
      await this.redis.set(this.key(code, 'replayed'), '1', 'EX', SPENT_CODE_TTL_SECONDS);
      await this.revokeGrantsOf(code);
      return null;
    }
    if (typeof previous !== 'string') {
      this.logger.debug('authorization code consume miss: unknown or expired');
      return null;
    }

    const payload = JSON.parse(previous) as AuthorizationCodePayload;
    this.logger.debug('consumed authorization code', { clientId: payload.clientId, userId: payload.userId });
    return payload;
  }

  /** A replay that arrived while the redeemer was still minting found nothing to revoke yet, so the redeemer asks once its grants exist. */
  async assertNotReplayed(code: string): Promise<void> {
    if (!(await this.redis.get(this.key(code, 'replayed')))) return;
    await this.revokeGrantsOf(code);
    throw AppErrorCode.OAU_003.create();
  }

  /**
   * RFC 6749 §4.1.2: a code presented twice means it leaked, so whatever its first redemption minted — the refresh family or the
   * app session for that client under that identity session — is revoked, whichever path either came through. The replay is
   * refused either way, so a failure here is logged rather than turned into a server error.
   */
  private async revokeGrantsOf(code: string): Promise<void> {
    try {
      const raw = await this.redis.get(this.key(code, 'owner'));
      if (!raw) return;
      const owner = JSON.parse(raw) as CodeOwner;
      const sessionId = BigInt(owner.sessionId);
      await this.refreshTokenService.revokeForSessionClient(sessionId, owner.clientId);
      await this.db
        .update(schema.appSessions)
        .set({ status: 'REVOKED', terminatedAt: new Date() })
        .where(and(eq(schema.appSessions.identitySessionId, sessionId), eq(schema.appSessions.clientId, owner.clientId), eq(schema.appSessions.status, 'ACTIVE')));
      await this.auditService.record({
        action: 'security.authorization_code_replayed',
        outcome: 'FAILURE',
        actorType: 'USER',
        actorId: owner.userId,
        targetType: 'oauth_client',
        targetId: owner.clientId,
      });
      this.logger.warn('authorization code replayed; the grants redeemed from it are revoked', { securityEvent: 'oauth.code_replayed', clientId: owner.clientId });
    } catch (error) {
      this.logger.error('authorization code replayed but its grants could not be revoked', { securityEvent: 'oauth.code_replayed', error });
    }
  }
}

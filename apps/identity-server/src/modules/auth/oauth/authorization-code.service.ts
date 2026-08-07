import { createHash, randomBytes } from 'node:crypto';

import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { DatabaseService } from '@server/modules/infrastructure/datastore';

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

const CODE_TTL_SECONDS = 60;

@Injectable()
export class AuthorizationCodeService {
  private readonly logger = Logger.getLogger(APP_NAME, AuthorizationCodeService.name);
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.redis = databaseService.getRedisClient();
  }

  private key(code: string): string {
    return `authz_code:${createHash('sha256').update(code).digest('hex')}`;
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
      this.logger.debug('authorization code consume miss: unknown, expired, or already used');
      return null;
    }
    const payload = JSON.parse(raw) as AuthorizationCodePayload;
    this.logger.debug('consumed authorization code', { clientId: payload.clientId, userId: payload.userId });
    return payload;
  }
}

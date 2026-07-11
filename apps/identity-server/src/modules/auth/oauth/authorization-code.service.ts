/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { DatabaseService } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

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

/**
 * Declaring the constants
 *
 * Authorization codes are single-use and short-lived; they live only in Redis, keyed by a hash of
 * the code so the plaintext is never persisted.
 */
const CODE_TTL_SECONDS = 60;

@Injectable()
export class AuthorizationCodeService {
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
    return code;
  }

  /** Atomically fetches and deletes a code, enforcing single use. */
  async consume(code: string): Promise<AuthorizationCodePayload | null> {
    const raw = await this.redis.getdel(this.key(code));
    return raw ? (JSON.parse(raw) as AuthorizationCodePayload) : null;
  }
}

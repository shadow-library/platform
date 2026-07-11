/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { JwtClaims, KeyService } from '@server/modules/auth/keys';

/**
 * Defining types
 */

export interface AccessTokenInput {
  subject: string;
  audience: string;
  scope: string;
  clientId: string;
  organisationId?: string;
  sessionId?: string;
  ttlSeconds: number;
  actorType: 'user' | 'service';
}

export interface IdTokenInput {
  subject: string;
  clientId: string;
  nonce?: string;
  ttlSeconds: number;
  claims?: JwtClaims;
}

/**
 * Declaring the constants
 */
const ID_TOKEN_TTL_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 0;

@Injectable()
export class AccessTokenService {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(private readonly keyService: KeyService) {}

  private now(): number {
    return Math.floor(Date.now() / 1000) - CLOCK_SKEW_SECONDS;
  }

  mintAccessToken(input: AccessTokenInput): { token: string; expiresIn: number } {
    const iat = this.now();
    const claims: JwtClaims = {
      iss: this.issuer,
      sub: input.subject,
      aud: input.audience,
      client_id: input.clientId,
      scope: input.scope,
      token_type: input.actorType,
      iat,
      exp: iat + input.ttlSeconds,
      jti: randomUUID(),
    };
    if (input.organisationId) claims.org = input.organisationId;
    if (input.sessionId) claims.sid = input.sessionId;
    return { token: this.keyService.sign(claims).token, expiresIn: input.ttlSeconds };
  }

  mintIdToken(input: IdTokenInput): string {
    const iat = this.now();
    const claims: JwtClaims = {
      iss: this.issuer,
      sub: input.subject,
      aud: input.clientId,
      iat,
      exp: iat + (input.ttlSeconds || ID_TOKEN_TTL_SECONDS),
      auth_time: iat,
      ...input.claims,
    };
    if (input.nonce) claims.nonce = input.nonce;
    return this.keyService.sign(claims).token;
  }

  getIssuer(): string {
    return this.issuer;
  }
}

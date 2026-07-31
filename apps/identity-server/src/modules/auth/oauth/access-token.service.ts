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
  /**
   * Authentication assurance the token conveys. Present only on a token minted from a step-up that
   * was granted for this exact audience, which is what lets a resource server trust `aal` without
   * calling back to the identity service.
   */
  aal?: 'AAL1' | 'AAL2';
  /**
   * RFC 8693 `act`: the application acting on the user's behalf. Present on exchanged tokens only,
   * and mandatory there — with app-level trust replacing a second consent ceremony, the delegation
   * chain is the audit record that consent would otherwise have been (D-22).
   */
  actorClientId?: string;
}

export interface IdTokenInput {
  subject: string;
  clientId: string;
  nonce?: string;
  ttlSeconds: number;
  claims?: JwtClaims;
}

export interface MintedAccessToken {
  token: string;
  expiresIn: number;
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

  mintAccessToken(input: AccessTokenInput): MintedAccessToken {
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
    if (input.aal) claims.aal = input.aal;
    /** An application's subject is its client id, so the RFC's canonical `sub` slot carries it. */
    if (input.actorClientId) claims.act = { sub: input.actorClientId };
    return { token: this.keyService.sign(claims).token, expiresIn: input.ttlSeconds };
  }

  /**
   * Verifies a token this service issued: signed under a published key, carrying our own issuer, and
   * unexpired. Audience and scope are deliberately left to the caller — every consumer bounds those
   * differently, and a helper that guessed would be the wrong check somewhere.
   */
  verifyAccessToken(token: string): JwtClaims | null {
    const claims = this.keyService.verify(token);
    if (!claims || claims.iss !== this.issuer) return null;
    if (typeof claims.exp !== 'number' || claims.exp <= this.now()) return null;
    return claims;
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

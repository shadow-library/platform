import { randomUUID } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { JwtClaims, KeyService } from '@server/modules/auth/keys';

export interface AccessTokenInput {
  subject: string;
  audience: string;
  scope: string;
  clientId: string;
  organisationId?: string;
  sessionId?: string;
  ttlSeconds: number;
  actorType: 'user' | 'service';
  aal?: 'AAL1' | 'AAL2';
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
    if (input.actorClientId) claims.act = { sub: input.actorClientId };
    return { token: this.keyService.sign(claims).token, expiresIn: input.ttlSeconds };
  }

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

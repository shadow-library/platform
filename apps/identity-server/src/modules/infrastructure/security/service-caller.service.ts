import { type FastifyRequest } from 'fastify';
import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { KeyService } from '@server/modules/auth/keys/key.service';

const PLATFORM_AUDIENCE = 'shadow-identity';
const BEARER_PREFIX = 'Bearer ';

/** Identifies a first-party service by its bearer before the guard runs, so rate limiting can budget it per client rather than per pod address; mirrors the guard's service-token checks. */
@Injectable()
export class ServiceCallerService {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(private readonly keyService: KeyService) {}

  clientIdOf(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) return null;

    const claims = this.keyService.verify(header.slice(BEARER_PREFIX.length));
    if (!claims || claims.iss !== this.issuer || claims.token_type !== 'service' || claims.aud !== PLATFORM_AUDIENCE) return null;
    if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return typeof claims.client_id === 'string' && claims.client_id ? claims.client_id : null;
  }
}

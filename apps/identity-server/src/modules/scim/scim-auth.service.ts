/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { OAuthClientService } from '@server/modules/auth/oauth';

import { ScimError } from './scim.types';

/**
 * Defining types
 */

export interface ScimTenant {
  clientId: string;
  organisationId: bigint;
}

/**
 * Declaring the constants
 *
 * SCIM authenticates with ordinary client-credentials service tokens carrying `scim:provision`
 * (recorded decision: the reserved `scim_tokens` table was subsumed — an org-bound SERVICE client
 * already gives per-tenant, rotatable credentials with introspection and dual-secret rotation for
 * free, instead of a second bearer format). The client's `organisation_id` binding scopes every
 * operation; a client without one cannot provision anything.
 */
const SCIM_SCOPE = 'scim:provision';
const PLATFORM_AUDIENCE = 'shadow-identity';

@Injectable()
export class ScimAuthService {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(
    private readonly keyService: KeyService,
    private readonly oauthClientService: OAuthClientService,
  ) {}

  async authenticate(request: FastifyRequest): Promise<ScimTenant> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new ScimError(401, 'Bearer token required');

    const claims = this.keyService.verify(token);
    const now = Math.floor(Date.now() / 1000);
    if (!claims || typeof claims.exp !== 'number' || claims.exp <= now || claims.iss !== this.issuer) throw new ScimError(401, 'Invalid or expired token');

    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
    if (claims.token_type !== 'service' || claims.aud !== PLATFORM_AUDIENCE || !scopes.includes(SCIM_SCOPE)) throw new ScimError(403, `Token must carry the ${SCIM_SCOPE} scope`);

    const clientId = typeof claims.client_id === 'string' ? claims.client_id : null;
    const client = clientId ? await this.oauthClientService.getClient(clientId) : null;
    if (!client || !client.isActive) throw new ScimError(401, 'Unknown client');
    if (!client.organisationId) throw new ScimError(403, 'Client is not bound to an organisation');
    return { clientId: client.id, organisationId: client.organisationId };
  }
}

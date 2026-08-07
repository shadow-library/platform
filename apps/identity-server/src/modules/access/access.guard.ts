import { type FastifyRequest } from 'fastify';
import { type HandlerMetadata } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { AsyncRouteHandler, Middleware, MiddlewareGenerator } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { AdminAccessService } from '@server/modules/admin';
import { type JwtClaims, KeyService } from '@server/modules/auth/keys';
import { SessionAuthService } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';

import { ACCESS_METADATA } from './access.decorator';
import { type AuthContext, type AuthenticatedRequest, type AuthOptions } from './access.types';
import { clientInfoOf } from './auth-context.accessor';

const PLATFORM_AUDIENCE = 'shadow-identity';

@Middleware({ type: 'preHandler', weight: 100 })
export class AccessGuard implements MiddlewareGenerator {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly adminAccessService: AdminAccessService,
    private readonly organisationService: OrganisationService,
    private readonly keyService: KeyService,
  ) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `access:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    const options = metadata[ACCESS_METADATA] as AuthOptions | undefined;
    if (!options || options.public) return undefined;

    return async (request: FastifyRequest): Promise<void> => {
      const context: AuthContext = { clientInfo: clientInfoOf(request as AuthenticatedRequest) };

      if (options.service) {
        context.serviceToken = this.verifyServiceToken(request, options.service === true ? undefined : options.service);
        (request as AuthenticatedRequest).auth = context;
        return;
      }

      const session = options.elevated ? await this.sessionAuthService.authenticateElevated(request) : await this.sessionAuthService.authenticate(request);
      context.session = session;
      context.elevated = session.elevatedUntil !== null && session.elevatedUntil > Date.now();

      if (options.permission) context.actor = await this.adminAccessService.authorize(session, options.permission);

      if (options.orgRole) {
        const { membership, organisation } = await this.organisationService.requireRole(session.userId, this.organisationIdOf(request, options.orgParam), options.orgRole);
        context.membership = membership;
        context.organisation = organisation;
      } else if (options.orgMember) {
        context.membership = await this.organisationService.assertMember(session.userId, this.organisationIdOf(request, options.orgParam));
      }

      (request as AuthenticatedRequest).auth = context;
    };
  }

  private organisationIdOf(request: FastifyRequest, orgParam = 'organisationId'): bigint {
    const value = (request.params as Record<string, string | undefined>)[orgParam];
    if (!value) throw AppErrorCode.ORG_001.create();
    return BigInt(value);
  }

  private verifyServiceToken(request: FastifyRequest, scope?: string): JwtClaims {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw AppErrorCode.SEC_003.create();

    const claims = this.keyService.verify(token);
    const now = Math.floor(Date.now() / 1000);
    if (!claims || typeof claims.exp !== 'number' || claims.exp <= now || claims.iss !== this.issuer) throw AppErrorCode.SEC_003.create();

    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
    if (claims.token_type !== 'service' || claims.aud !== PLATFORM_AUDIENCE) throw AppErrorCode.SEC_004.create();
    if (scope !== undefined && !scopes.includes(scope)) throw AppErrorCode.SEC_004.create();
    return claims;
  }
}

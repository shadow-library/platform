/**
 * Importing npm packages
 */
import { Route, type RouteMetadata } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { AsyncRouteHandler, Middleware, MiddlewareGenerator, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { KeyService } from '@server/modules/auth/keys';

/**
 * Defining types
 */

interface ServiceTokenPolicy {
  scope: string;
}

type ServiceTokenDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 *
 * Service-to-service endpoints accept only client-credentials access tokens minted by this server
 * for its own audience. Verification is native (KeyService holds the signing keys) rather than a
 * JWKS round-trip through the SDK: the server should not call itself over HTTP to check its own
 * signatures, and at boot the listener may not even be up yet.
 */
const SERVICE_TOKEN_METADATA = 'serviceToken';
const PLATFORM_AUDIENCE = 'shadow-identity';

/** Restricts the route to M2M callers presenting a service token carrying the given scope */
export const RequireServiceToken = (scope: string): ServiceTokenDecorator => Route({ [SERVICE_TOKEN_METADATA]: { scope } satisfies ServiceTokenPolicy });

@Middleware({ type: 'preHandler', weight: 100 })
export class ServiceTokenGuard implements MiddlewareGenerator {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(private readonly keyService: KeyService) {}

  /** The router caches generated handlers by metadata alone; namespacing avoids colliding with other generating middlewares */
  cacheKey(metadata: RouteMetadata): string {
    return `service-token:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: RouteMetadata): AsyncRouteHandler | undefined {
    const policy = metadata[SERVICE_TOKEN_METADATA] as ServiceTokenPolicy | undefined;
    if (!policy) return undefined;

    return async (request: FastifyRequest): Promise<void> => {
      const header = request.headers.authorization;
      const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!token) throw new ServerError(AppErrorCode.SEC_003);

      const claims = this.keyService.verify(token);
      const now = Math.floor(Date.now() / 1000);
      if (!claims || typeof claims.exp !== 'number' || claims.exp <= now || claims.iss !== this.issuer) throw new ServerError(AppErrorCode.SEC_003);

      const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
      if (claims.token_type !== 'service' || claims.aud !== PLATFORM_AUDIENCE || !scopes.includes(policy.scope)) throw new ServerError(AppErrorCode.SEC_004);
    };
  }
}

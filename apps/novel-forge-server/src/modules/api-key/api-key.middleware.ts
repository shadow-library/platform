import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AUTH_PRINCIPAL } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';
import { ContextService, type HttpRequest, Middleware, type RouteHandler } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { API_KEY_HEADER, API_KEY_ROUTE_METADATA, type ApiKeyRouteMetadata } from './api-key.decorators';
import { ApiKeyService } from './api-key.service';

/**
 * Authenticates the ingest surface from a long-lived `x-api-key` secret and puts a full principal in
 * the ambient context, so every downstream service reads the caller through `getAuthPrincipal()` and
 * never learns which credential was presented. It runs at `preValidation` like the package's own
 * `AuthGuard`, and for the same reason: an unauthenticated caller must be answered before schema
 * validation can describe the route's body back to it.
 *
 * A route carrying `@ApiKeyAuthenticated()` must not also carry `@Authenticated()`: the package guard
 * sorts ahead of this one and would reject a key-only caller with `IAM_001` before it ever ran. The
 * `getAuthPrincipalOrNull()` check is therefore defence in depth rather than a supported combination —
 * this guard never displaces a principal another guard already resolved.
 */
@Middleware({ type: 'preValidation', weight: 90 })
export class ApiKeyGuard {
  private readonly logger = Logger.getLogger(APP_NAME, ApiKeyGuard.name);

  constructor(
    private readonly context: ContextService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `novel-forge-api-key:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    const route = metadata[API_KEY_ROUTE_METADATA] as ApiKeyRouteMetadata | undefined;
    if (!route?.authenticated) return undefined;

    const handler = async (request: HttpRequest): Promise<void> => {
      if (this.context.getAuthPrincipalOrNull()) return;

      const header = request.headers[API_KEY_HEADER];
      if (typeof header !== 'string' || header.length === 0) throw AppErrorCode.KEY_001.create();

      const key = await this.apiKeyService.authenticate(header);
      if (!route.skipOwnerCheck) await this.apiKeyService.assertOwnerPermitted(key);

      const principal: AuthPrincipal = {
        kind: 'user',
        sub: key.ownerId.toString(),
        org: key.ownerOrgId,
        // Empty on purpose: a key carries no OIDC scopes and no assurance level, so it satisfies
        // neither `@RequireScope` nor `@RequireElevation` — only what this guard itself authorises.
        scopes: [],
        claims: { sub: key.ownerId.toString(), org: key.ownerOrgId, api_key_id: key.id.toString() },
      };
      this.context.set(AUTH_PRINCIPAL, principal);
      this.logger.debug('request authenticated by api key', { id: key.id.toString(), keyPrefix: key.keyPrefix, sub: principal.sub });
    };

    return handler as unknown as RouteHandler;
  }
}

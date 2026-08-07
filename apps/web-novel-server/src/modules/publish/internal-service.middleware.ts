import { type HandlerMetadata } from '@shadow-library/app';
import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';
import { ContextService, Middleware, type RouteHandler } from '@shadow-library/fastify';

import { APP_NAME } from '@server/constants';

/**
 * Defence-in-depth over the scope guard for the `/internal/*` surface: `web-novel:publish` must only
 * ever ride an identity-issued M2M token, but the auth guard runs its service-access allowlist only
 * for service principals — a user-kind token that somehow carried the scope would pass on scope
 * alone. This preHandler runs just after the auth guard (lower weight, same phase, once the
 * principal is in context) and rejects any non-service principal before it can drive a mutation.
 */

@Middleware({ type: 'preHandler', weight: 50 })
export class InternalServiceGuard {
  private readonly logger = Logger.getLogger(APP_NAME, InternalServiceGuard.name);

  constructor(private readonly context: ContextService) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `web-novel-internal-service:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    if (typeof metadata.path !== 'string' || !metadata.path.startsWith('/internal/')) return undefined;

    const handler = async (): Promise<void> => {
      const principal = this.context.getAuthPrincipal();
      if (principal.kind === 'service') return;
      this.logger.warn('rejected non-service principal on the internal publish surface', { sub: principal.sub, kind: principal.kind });
      throw AuthGuardErrorCode.IAM_002.create();
    };

    return handler as unknown as RouteHandler;
  }
}

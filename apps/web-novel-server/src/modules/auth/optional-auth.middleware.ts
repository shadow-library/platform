import { type HandlerMetadata } from '@shadow-library/app';
import { AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { AppSessionService, AUTH_PRINCIPAL, parseCookies } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';
import { ContextService, type HttpRequest, Middleware, type RouteHandler } from '@shadow-library/fastify';

import { APP_NAME } from '@server/constants';

/**
 * The SDK's `AuthGuard` is all-or-nothing by design: a route either demands a credential or never
 * sees one. The public catalog needs the third thing — read it anonymously, but if the caller does
 * carry a session, resolve them so a novel shared with them is reachable at the same URL as
 * everything else.
 *
 * So this resolves a principal when one is presented and stays silent when it is not. A credential
 * that is present but bad is treated exactly like no credential at all: the caller simply reads as
 * anonymous and sees the public catalog. That is deliberate — this middleware grants nothing, it
 * only supplies an identity for {@link NovelAccessService} to judge, and turning a stale cookie
 * into a 401 on the public reading surface would break browsing for anyone whose session lapsed.
 */

/** Runs before the access checks in the handlers, and after nothing — no guard attaches to these routes. */
const OPTIONAL_AUTH_WEIGHT = 100;

@Middleware({ type: 'preHandler', weight: OPTIONAL_AUTH_WEIGHT })
export class OptionalAuthResolver {
  private readonly logger = Logger.getLogger(APP_NAME, OptionalAuthResolver.name);

  constructor(
    private readonly client: AuthClient,
    private readonly context: ContextService,
    private readonly sessions: AppSessionService,
  ) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `web-novel-optional-auth:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    if (typeof metadata.path !== 'string' || !metadata.path.startsWith('/api/novels')) return undefined;

    const handler = async (request: HttpRequest): Promise<void> => {
      const principal = await this.resolve(request);
      if (principal) this.context.set(AUTH_PRINCIPAL, principal);
    };

    return handler as unknown as RouteHandler;
  }

  private async resolve(request: HttpRequest): Promise<AuthPrincipal | undefined> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    try {
      if (token) return await this.client.verify(token);
      const handle = this.sessions.readHandle(parseCookies(request.headers.cookie));
      return handle ? await this.sessions.resolvePrincipal(handle) : undefined;
    } catch (err) {
      this.logger.debug('optional auth could not resolve a principal; continuing anonymously', { message: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }
}

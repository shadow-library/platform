/**
 * Importing npm packages
 */
import { type HandlerMetadata } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';
import { ContextService, Middleware, ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AuthPrincipal, BotPrincipal } from '../interfaces';
import { AuthClient } from '../lib/auth-client';
import { BOT_KEY_PREFIX, parseBotKey } from '../lib/bot-key';
import { BotRateLimiter } from '../lib/bot-rate-limiter';
import { retryAfterHint } from '../lib/transport';
import { AppSessionService } from './app-session.service';
import { AUTH_ROUTE_METADATA } from './constants';
import { AUTH_PRINCIPAL } from './context';
import { parseCookies } from './cookie';
import { AuthRouteMetadata } from './decorators';
import { AuthGuardErrorCode } from './errors';

/**
 * Defining types
 */

export interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Path and query of the current request; used verbatim as the `return_to` of a login or step-up bounce */
  url?: string;
  /** The caller's address as the framework resolved it; forwarded to identity when a bot key is exchanged */
  ip?: string;
}

/** The subset of the framework reply the guard needs to bounce a browser instead of erroring at it */
export interface GuardedResponse {
  header(name: string, value: string | string[]): unknown;
  redirect(url: string, statusCode?: number): unknown;
}

export type AuthGuardHandler = (request: GuardedRequest, response?: GuardedResponse) => Promise<unknown>;

/**
 * Declaring the constants
 *
 * The guard only attaches to routes that carry auth metadata, so unguarded routes pay no cost. A
 * caller may present either an `Authorization: Bearer` token or the application's session cookie, and
 * both land in the same principal — a route handler never learns which was used. Every failure is
 * mapped to the same generic 401/403 pair; the response never explains which check failed, only the
 * audit-friendly error code differs. The single exception is `IAM_003`, because "step up" is
 * instruction rather than information. M2M callers stay deny-by-default: a service token passes only
 * when an admin-configured service-access rule covers this route for that caller.
 */

/** 302 keeps the browser's method on a redirect the user follows interactively */
const FOUND = 302;

/** Only a top-level navigation gets bounced; anything else is answered with a status a client can act on */
const isNavigation = (request: GuardedRequest, method: string): boolean => {
  const accept = request.headers.accept;
  return method.toUpperCase() === 'GET' && typeof accept === 'string' && accept.includes('text/html');
};

/**
 * Runs at `preValidation`, one lifecycle stage ahead of the schema validation Fastify wires through
 * `setValidatorCompiler`. On `preHandler` the validator answered first, so an unauthenticated caller
 * sending a malformed body got a 422 describing the route's schema instead of a 401 — a shape oracle
 * for anyone who could reach the URL. The guard reads only headers, cookies and the route's static
 * metadata, so it has nothing to gain from the parsed body and loses nothing by running earlier.
 * Every other guard stays on `preHandler`: they read params, the body, or the principal this one
 * puts in context, and the stage ordering keeps them strictly downstream of it.
 */
@Middleware({ type: 'preValidation', weight: 100 })
export class AuthGuard {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthGuard.name);
  private readonly botRateLimiter = new BotRateLimiter();

  constructor(
    private readonly client: AuthClient,
    private readonly context: ContextService,
    private readonly sessions?: AppSessionService,
  ) {}

  /** The router caches generated handlers by metadata alone; namespacing avoids colliding with other generating middlewares on the same route */
  cacheKey(metadata: HandlerMetadata): string {
    return `shadow-auth:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AuthGuardHandler | undefined {
    const auth = metadata[AUTH_ROUTE_METADATA] as AuthRouteMetadata | undefined;
    if (!auth?.authenticated) return undefined;

    const method = String(metadata.method ?? '*');
    const path = String(metadata.path ?? '/');
    return async (request: GuardedRequest, response?: GuardedResponse): Promise<unknown> => {
      try {
        const principal = await this.authenticate(request, auth, method, path);
        await this.admit(principal, auth, method, path, response);
        this.context.set(AUTH_PRINCIPAL, principal);
        this.logger.debug('request authenticated', { sub: principal.sub, kind: principal.kind, aal: principal.aal, method, path });
        return undefined;
      } catch (error) {
        return this.recover(error, request, response, method);
      }
    };
  }

  private async authenticate(request: GuardedRequest, auth: AuthRouteMetadata, method: string, path: string): Promise<AuthPrincipal> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token?.startsWith(BOT_KEY_PREFIX)) return this.authenticateBot(token, request.ip, auth, method, path);
    if (token) return this.client.verify(token).catch((error: Error) => throwError(this.unauthenticated(error)));

    const sessions = this.sessions;
    const handle = sessions && sessions.readHandle(parseCookies(request.headers.cookie));
    if (!sessions || !handle) throw AuthGuardErrorCode.IAM_001.create();

    /** A cookie caller has no token yet: the SDK mints one for this app's own audience and verifies it offline, exactly as it would a presented bearer */
    return sessions.resolvePrincipal(handle, { elevated: auth.elevated });
  }

  /**
   * Everything that can refuse a bot without asking identity is decided before the exchange. The checksum
   * is public, so a well-formed key proves nothing, and exchanging one on a route no bot may use would
   * turn every guarded route into a free amplifier against identity's token endpoint.
   *
   * An exchange that failed for want of identity — transport, 5xx, a throttle, a malformed answer — is
   * answered 503 rather than collapsed into 401, so a bot can tell an outage from a revoked key. It still
   * fails closed.
   */
  private async authenticateBot(botKey: string, clientIp: string | undefined, auth: AuthRouteMetadata, method: string, path: string): Promise<BotPrincipal> {
    if (!parseBotKey(botKey)) throw this.unauthenticated(AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the key is malformed or fails its checksum' }));
    if (!auth.botPermissions?.length) throw this.denied('bot refused on a route that declares no bot permission', { method, path });
    if (auth.elevated) throw this.denied('bot refused on a route that requires elevation', { method, path });

    return this.client.resolveBotKey(botKey, clientIp).catch((error: unknown) => {
      if (!AppError.is(error) || error.status < 500) throw this.unauthenticated(error instanceof Error ? error : new Error(String(error)));
      this.logger.warn('bot key exchange unavailable', { reason: error.message, method, path });
      throw AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity could not exchange the bot key', retryAfterSeconds: retryAfterHint(error) });
    });
  }

  private async admit(principal: AuthPrincipal, auth: AuthRouteMetadata, method: string, path: string, response: GuardedResponse | undefined): Promise<void> {
    if (principal.kind === 'bot') return this.admitBot(principal, auth, response);
    this.authorize(principal, auth, method, path);
    if (auth.permission) await this.checkPermission(principal, auth);
  }

  private authorize(principal: AuthPrincipal, auth: AuthRouteMetadata, method: string, path: string): void {
    if (principal.kind === 'service' && (!principal.clientId || !this.client.isServiceCallerAllowed(principal.clientId, method, path))) {
      throw this.denied('service caller not allowed for this route', { clientId: principal.clientId, method, path });
    }
    if (auth.scopes?.some(scope => !principal.scopes.includes(scope))) throw this.denied('token lacks a required scope', { sub: principal.sub, requiredScopes: auth.scopes });
    if (auth.elevated && principal.aal !== 'AAL2') throw AuthErrorCode.ELEVATION_REQUIRED.create({ reason: 'the presented credential is not elevated' });
  }

  /**
   * Service-access rules and scopes do not apply to a bot — an organisation admin grants a bot
   * permissions, never rules or scopes — so its gate is every `@BotPermission` plus the route's own
   * `@RequirePermission`, all evaluated in the bot's organisation. Every decision uses the high-risk TTL
   * so a revoked grant stops the bot within a minute, and `failOpen` never applies.
   */
  private async admitBot(principal: BotPrincipal, auth: AuthRouteMetadata, response: GuardedResponse | undefined): Promise<void> {
    if (!auth.botPermissions?.length || auth.elevated) throw this.denied('bot refused on a route that is not open to bots', { botId: principal.botId });

    const permissions = [...new Set([...(auth.botPermissions ?? []), ...(auth.permission ? [auth.permission] : [])])];

    const decision = this.botRateLimiter.consume(principal.botId, principal.rateLimitPerMinute);
    if (!decision.allowed) {
      this.logger.warn('bot rate limit exhausted', { botId: principal.botId, retryAfterSeconds: decision.retryAfterSeconds });
      response?.header('retry-after', String(decision.retryAfterSeconds));
      throw ServerErrorCode.S007.create();
    }

    const checks = permissions.map(action => ({ action, organisationId: principal.org, principal }));
    const permitted = await this.client.checkAll(checks, { highRisk: true });
    if (permitted.includes(false)) throw this.denied('bot permission denied', { botId: principal.botId, org: principal.org, permissions });
  }

  /**
   * A permission is always evaluated in an organisation, so a credential that names none — a service
   * token, or a user token minted before the organisation could be resolved — has no question to ask
   * and is refused outright.
   *
   * `failOpen` deliberately does not apply here. It means "the policy decision point was unreachable,
   * prefer availability", not "there was nothing to ask, assume yes"; letting it cover a missing claim
   * would turn every `failOpen` route into an unguarded one for exactly the callers least entitled to
   * it.
   */
  private async checkPermission(principal: AuthPrincipal, auth: AuthRouteMetadata): Promise<void> {
    const permission = auth.permission as string;
    if (!principal.org) throw this.denied('permission denied: the credential names no organisation to evaluate it in', { sub: principal.sub, permission });

    const options = { failOpen: auth.failOpen, highRisk: auth.highRisk };
    const permitted = await this.client.check({ action: permission, organisationId: principal.org, principal }, options);
    if (!permitted) throw this.denied('permission denied', { sub: principal.sub, permission });
  }

  /**
   * Turns the two recoverable failures into the move that actually resolves them. A browser gets
   * bounced — to login when its session died, to step-up when the route needs `AAL2` — while every
   * other caller gets a status it can branch on. Nothing here ever falls through as anonymous.
   */
  private async recover(error: unknown, request: GuardedRequest, response: GuardedResponse | undefined, method: string): Promise<unknown> {
    const sessions = this.sessions;
    const returnTo = request.url ?? '/';

    if (AppError.is(error, AuthErrorCode.SESSION_INVALID)) {
      this.logger.warn('app session rejected; clearing the cookie and restarting the login', { method });
      if (!sessions) throw AuthGuardErrorCode.IAM_001.create();
      for (const cookie of sessions.clearedCookies()) response?.header('set-cookie', cookie);
      if (!response || !isNavigation(request, method)) throw AuthGuardErrorCode.IAM_001.create();
      return this.bounce(response, sessions.loginUrl(returnTo));
    }

    /** A mismatch lands here too: the step-up route is where the prompt is restarted with this app's intent */
    if (AppError.is(error, AuthErrorCode.ELEVATION_REQUIRED) || AppError.is(error, AuthErrorCode.ELEVATION_INTENT_MISMATCH)) {
      this.logger.warn('route requires elevation and the principal is not elevated', { method });
      if (!sessions || !response || !isNavigation(request, method)) throw AuthGuardErrorCode.IAM_003.create();
      return this.bounce(response, sessions.stepUpUrl(returnTo));
    }

    /** Identity throttled the exchange and said when to come back; the 503 carries that forward rather than leaving the bot to guess */
    if (AppError.is(error, AuthErrorCode.TOKEN_EXCHANGE_FAILED)) {
      const retryAfterSeconds = retryAfterHint(error);
      if (retryAfterSeconds !== undefined) response?.header('retry-after', String(retryAfterSeconds));
      throw error;
    }

    /**
     * Everything else collapses back to the generic pair. The cookie path can fail with the SDK's own
     * codes — a broken scope grant, an unreachable identity — and none of that is the browser's
     * business; leaking it would tell an unauthenticated caller how this service is configured.
     */
    if (AppError.is(error, AuthGuardErrorCode) || AppError.is(error, ServerErrorCode.S007)) throw error;
    throw this.unauthenticated(error instanceof Error ? error : new Error(String(error)));
  }

  /**
   * Fastify skips the route handler only once the reply has finished writing, and a hook that merely
   * *returns* the reply does not reliably get there first — the handler then runs unauthenticated and
   * the error handler tries to write a response that has already gone out. Awaiting the redirect is
   * what makes the bounce terminal.
   */
  private async bounce(response: GuardedResponse, url: string): Promise<unknown> {
    await response.redirect(url, FOUND);
    return response;
  }

  /** Warn-level trail for rejected credentials; the response stays a generic 401 */
  private unauthenticated(error: Error): AppError {
    this.logger.warn('bearer token rejected', { reason: error.message });
    return AuthGuardErrorCode.IAM_001.create();
  }

  /** Warn-level trail for denied requests; the response stays a generic 403 */
  private denied(message: string, metadata: Record<string, unknown>): AppError {
    this.logger.warn(message, metadata);
    return AuthGuardErrorCode.IAM_002.create();
  }
}

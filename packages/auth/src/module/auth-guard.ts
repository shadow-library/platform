import { type HandlerMetadata } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';
import { ContextService, Middleware, ServerErrorCode } from '@shadow-library/fastify';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AuthPrincipal, BotPrincipal, ServicePrincipal, UserPrincipal } from '../interfaces';
import { AuthClient } from '../lib/auth-client';
import { BOT_KEY_PREFIX, parseBotKey } from '../lib/bot-key';
import { BotRateLimiter } from '../lib/bot-rate-limiter';
import { isThrottled, retryAfterHint } from '../lib/transport';
import { AuthAccessPolicy } from './access-policy';
import { AppSessionService } from './app-session.service';
import { AUTH_PRINCIPAL } from './context';
import { parseCookies } from './cookie';
import { type RequiredAuthRoute } from './decorators';
import { AuthGuardErrorCode } from './errors';

export interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Used verbatim as the `return_to` of a login or step-up bounce */
  url?: string;
  /** The caller's address as the framework resolved it (trust-proxy aware); it feeds identity's bot IP allowlist */
  ip?: string;
}

export interface GuardedResponse {
  header(name: string, value: string | string[]): unknown;
  redirect(url: string, statusCode?: number): unknown;
}

export type AuthGuardHandler = (request: GuardedRequest, response?: GuardedResponse) => Promise<unknown>;

const FOUND = 302;

const bearerToken = (request: GuardedRequest): string | undefined => {
  const header = request.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
};

/** Only a top-level navigation gets bounced; anything else is answered with a status a client can act on */
const isNavigation = (request: GuardedRequest, method: string): boolean => {
  const accept = request.headers.accept;
  return method.toUpperCase() === 'GET' && typeof accept === 'string' && accept.includes('text/html');
};

// Runs at `preValidation`: on `preHandler` the schema validator answered first, so an unauthenticated caller sending a malformed body got a 422 describing the route's
// schema (a shape oracle) instead of a 401.
// Every failure maps to the same generic 401/403 pair so the response never reveals which check failed; `IAM_003` is the exception because "step up" is instruction, not
// information.
// Other guards stay on `preHandler` because they read params, the body or the principal this one puts in context.
@Middleware({ type: 'preValidation', weight: 100 })
export class AuthGuard {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthGuard.name);
  private readonly botRateLimiter = new BotRateLimiter();

  constructor(
    private readonly client: AuthClient,
    private readonly context: ContextService,
    private readonly accessPolicy: AuthAccessPolicy,
    private readonly sessions?: AppSessionService,
  ) {}

  /** The router caches generated handlers by metadata alone; namespacing avoids colliding with other middlewares on the route */
  cacheKey(metadata: HandlerMetadata): string {
    return `shadow-auth:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AuthGuardHandler | undefined {
    const auth = this.accessPolicy.resolve(metadata);
    if (auth.access === 'public') return undefined;

    const method = String(metadata.method ?? '*');
    const path = String(metadata.path ?? '/');
    if (auth.access === 'optional') return request => this.resolveOptional(request, method, path);
    return async (request: GuardedRequest, response?: GuardedResponse): Promise<unknown> => {
      try {
        const principal = await this.authenticate(request, auth, method, path);
        if (!bearerToken(request)) await this.assertConsented(principal, auth);
        await this.admit(principal, auth, method, path, response);
        this.context.set(AUTH_PRINCIPAL, principal);
        this.logger.debug('request authenticated', { sub: principal.sub, kind: principal.kind, aal: principal.aal, method, path });
        return undefined;
      } catch (error) {
        return this.recover(error, request, response, method);
      }
    };
  }

  /**
   * Every failure reads as anonymous, not 401, which would break browsing after a session expires; the response is never touched, because a `set-cookie` on a shared-cache-
   * stored response reaches every reader
   */
  private async resolveOptional(request: GuardedRequest, method: string, path: string): Promise<undefined> {
    const principal = await this.identify(request, method, path).catch((error: unknown) => {
      this.logger.debug('optional auth could not resolve a principal; continuing anonymously', { reason: error instanceof Error ? error.message : String(error), method, path });
      return undefined;
    });
    if (principal) this.context.set(AUTH_PRINCIPAL, principal);
    return undefined;
  }

  /** A bot key is never exchanged here: the route grants bots nothing, so the round trip would only let a leaked key load identity */
  private async identify(request: GuardedRequest, method: string, path: string): Promise<AuthPrincipal | undefined> {
    const token = bearerToken(request);
    if (token?.startsWith(BOT_KEY_PREFIX)) {
      this.logger.debug('bot key presented on an optional route; continuing anonymously', { method, path });
      return undefined;
    }

    if (token) return this.identifiedCaller(await this.client.verify(token), method, path);

    const sessions = this.sessions;
    const handle = sessions?.readHandle(parseCookies(request.headers.cookie));
    return sessions && handle ? sessions.resolvePrincipal(handle) : undefined;
  }

  private identifiedCaller(principal: UserPrincipal | ServicePrincipal, method: string, path: string): AuthPrincipal | undefined {
    if (principal.kind === 'user' || (principal.clientId && this.client.isServiceCallerAllowed(principal.clientId, method, path))) return principal;
    this.logger.debug('service caller not allowed for this route; continuing anonymously', { clientId: principal.clientId, method, path });
    return undefined;
  }

  private async authenticate(request: GuardedRequest, auth: RequiredAuthRoute, method: string, path: string): Promise<AuthPrincipal> {
    const token = bearerToken(request);
    if (token?.startsWith(BOT_KEY_PREFIX)) return this.authenticateBot(token, request.ip, auth, method, path);
    if (token) return this.client.verify(token).catch((error: Error) => throwError(this.unauthenticated(error)));

    const sessions = this.sessions;
    const handle = sessions && sessions.readHandle(parseCookies(request.headers.cookie));
    if (!sessions || !handle) throw AuthGuardErrorCode.IAM_001.create();

    return sessions.resolvePrincipal(handle, { elevated: auth.elevated });
  }

  /**
   * Refusals that need no identity are decided before the exchange: the checksum is public, so a well-formed key proves nothing,
   * and exchanging on a route no bot may use would make every guarded route an amplifier against identity.
   * An exchange failing for want of identity answers 503 rather than 401, so a bot can tell an outage from a revoked key; it still fails closed.
   */
  private async authenticateBot(botKey: string, clientIp: string | undefined, auth: RequiredAuthRoute, method: string, path: string): Promise<BotPrincipal> {
    if (!parseBotKey(botKey)) throw this.unauthenticated(AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the key is malformed or fails its checksum' }));
    if (!auth.botPermissions?.length) throw this.denied('bot refused on a route that declares no bot permission', { method, path });
    if (auth.elevated) throw this.denied('bot refused on a route that requires elevation', { method, path });

    return this.client.resolveBotKey(botKey, clientIp).catch((error: unknown) => {
      if (!AppError.is(error) || error.status < 500) throw this.unauthenticated(error instanceof Error ? error : new Error(String(error)));
      this.logger.warn('bot key exchange unavailable', { reason: error.message, method, path });
      throw AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity could not exchange the bot key', retryAfterSeconds: retryAfterHint(error) });
    });
  }

  /** Identity freezes a session's grant at authorize, so only a fresh authorize can add a sensitive scope; any other missing scope stays the generic denial */
  private async assertConsented(principal: AuthPrincipal, auth: RequiredAuthRoute): Promise<void> {
    if (!this.sessions || principal.kind !== 'user' || principal.aal !== 'AAL2') return;
    const missing = auth.scopes?.filter(scope => !principal.scopes.includes(scope)) ?? [];
    if (missing.length === 0) return;

    const sensitive = await this.sessions.sensitiveScopes();
    if (missing.every(scope => sensitive.includes(scope))) throw AuthErrorCode.CONSENT_REQUIRED.create({ reason: `the session grant lacks ${missing.join(', ')}` });
  }

  private async admit(principal: AuthPrincipal, auth: RequiredAuthRoute, method: string, path: string, response: GuardedResponse | undefined): Promise<void> {
    if (principal.kind === 'bot') return this.admitBot(principal, auth, response);
    this.authorize(principal, auth, method, path);
    if (auth.permission) await this.checkPermission(principal, auth);
  }

  private authorize(principal: AuthPrincipal, auth: RequiredAuthRoute, method: string, path: string): void {
    if (principal.kind === 'service' && (!principal.clientId || !this.client.isServiceCallerAllowed(principal.clientId, method, path))) {
      throw this.denied('service caller not allowed for this route', { clientId: principal.clientId, method, path });
    }
    if (auth.scopes?.some(scope => !principal.scopes.includes(scope))) throw this.denied('token lacks a required scope', { sub: principal.sub, requiredScopes: auth.scopes });
    if (auth.elevated && principal.aal !== 'AAL2') throw AuthErrorCode.ELEVATION_REQUIRED.create({ reason: 'the presented credential is not elevated' });
  }

  /**
   * Admins grant bots permissions, never rules or scopes, so the gate is every `@BotPermission` plus the route's `@RequirePermission`; high-risk TTL so a revoked grant
   * bites within a minute, and `failOpen` never applies
   */
  private async admitBot(principal: BotPrincipal, auth: RequiredAuthRoute, response: GuardedResponse | undefined): Promise<void> {
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
   * A credential naming no organisation has nothing to evaluate and is refused outright; `failOpen` means "PDP unreachable", not "nothing to ask", and covering it would
   * unguard every `failOpen` route for the least entitled callers
   */
  private async checkPermission(principal: AuthPrincipal, auth: RequiredAuthRoute): Promise<void> {
    const permission = auth.permission as string;
    if (!principal.org) throw this.denied('permission denied: the credential names no organisation to evaluate it in', { sub: principal.sub, permission });

    const options = { failOpen: auth.failOpen, highRisk: auth.highRisk };
    const permitted = await this.client.check({ action: permission, organisationId: principal.org, principal }, options);
    if (!permitted) throw this.denied('permission denied', { sub: principal.sub, permission });
  }

  /** Browsers are bounced (login when the session died, step-up when the route needs `AAL2`); other callers get a status they can branch on. Nothing falls through as anonymous */
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

    if (AppError.is(error, AuthErrorCode.CONSENT_REQUIRED) && sessions) return this.reconsent(error, request, response, method, sessions);

    // A mismatch lands here too: the step-up route restarts the prompt with this app's intent
    if (AppError.is(error, AuthErrorCode.ELEVATION_REQUIRED) || AppError.is(error, AuthErrorCode.ELEVATION_INTENT_MISMATCH)) {
      this.logger.warn('route requires elevation and the principal is not elevated', { method });
      if (!sessions || !response || !isNavigation(request, method)) throw AuthGuardErrorCode.IAM_003.create();
      return this.bounce(response, sessions.stepUpUrl(returnTo));
    }

    // A throttle collapsed into the generic pair would tell an entitled caller it is forbidden, or bounce a signed-in browser into a login identity is also throttling
    if (AppError.is(error, AuthErrorCode.TOKEN_EXCHANGE_FAILED) || isThrottled(error)) {
      const retryAfterSeconds = retryAfterHint(error);
      if (retryAfterSeconds !== undefined) response?.header('retry-after', String(retryAfterSeconds));
      throw error;
    }

    // Everything else collapses to the generic pair: SDK codes (broken scope grant, unreachable identity) would tell an unauthenticated caller how this service is configured
    if (AppError.is(error, AuthGuardErrorCode) || AppError.is(error, ServerErrorCode.S007)) throw error;
    throw this.unauthenticated(error instanceof Error ? error : new Error(String(error)));
  }

  /** A browser that already went round and still lacks the scope gets the 403: identity is withholding it, and another sign-in would only repeat the bounce */
  private async reconsent(error: AppError, request: GuardedRequest, response: GuardedResponse | undefined, method: string, sessions: AppSessionService): Promise<unknown> {
    const cookies = parseCookies(request.headers.cookie);
    const handle = sessions.readHandle(cookies);
    if (!handle || sessions.hasReconsented(cookies)) {
      this.logger.warn('the session still lacks a sensitive scope after a fresh authorize; refusing rather than restarting the login again', { method });
      response?.header('set-cookie', sessions.reconsentSpentCookie());
      throw error;
    }

    this.logger.warn('the session predates consent to a sensitive scope this route needs; restarting the login', { method });
    for (const cookie of await sessions.beginReconsent(handle)) response?.header('set-cookie', cookie);
    if (!response || !isNavigation(request, method)) throw AuthGuardErrorCode.IAM_001.create();
    return this.bounce(response, sessions.loginUrl(request.url ?? '/'));
  }

  /** Fastify skips the handler only once the reply has finished writing; merely returning it does not reliably get there first, so the handler would run unauthenticated */
  private async bounce(response: GuardedResponse, url: string): Promise<unknown> {
    await response.redirect(url, FOUND);
    return response;
  }

  private unauthenticated(error: Error): AppError {
    this.logger.warn('bearer token rejected', { reason: error.message });
    return AuthGuardErrorCode.IAM_001.create();
  }

  private denied(message: string, metadata: Record<string, unknown>): AppError {
    this.logger.warn(message, metadata);
    return AuthGuardErrorCode.IAM_002.create();
  }
}

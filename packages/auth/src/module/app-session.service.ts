/**
 * Importing npm packages
 */
import { AppError, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppRegistration, AppSessionOrganisation, AppSessionToken, AuthPrincipal } from '../interfaces';
import { AccessTokenCache, hashSessionHandle } from '../lib/access-token-cache';
import { AuthClient } from '../lib/auth-client';
import { buildAuthorizationUrl } from '../rp/authorization-url';
import { createPkcePair, randomUrlSafeString } from '../rp/pkce';
import { ResolvedBrowserAuthConfig } from './config';
import { expireCookie, serializeCookie } from './cookie';
import { decodeLoginState, encodeLoginState, LoginState, matchesState } from './login-state';
import { SessionRegistry } from './session-registry';

/**
 * Defining types
 */

export interface LoginRedirect {
  url: string;
  /** The transient login-state cookie: `__Host-`-prefixed, `HttpOnly`, and cleared on first use */
  cookies: string[];
}

export interface LoginResult {
  cookies: string[];
  returnTo: string;
  userId: string;
}

export interface TokenRequest {
  /** Requires a token minted from a live step-up grant for this app's audience */
  elevated?: boolean;
}

/**
 * The half of the browser configuration identity owns (D-21), resolved per request from the
 * application's registration and refreshed with it — so an admin granting a scope or registering a
 * redirect URI reaches a running service without a redeploy.
 */
export interface BrowserAuthRuntime {
  clientId: string;
  audience: string;
  redirectUri: string;
  scopes: string[];
  stepUpUrl: string;
}

/**
 * Declaring the constants
 *
 * The whole first-party browser flow lives here so a consuming service inherits it rather than
 * writing it: PKCE and transient state, the handle cookie, the token cache, elevation, and logout.
 * The handle never leaves this class except into its own cookie and into `AppSessionClient`'s
 * request bodies; everything the SDK retains about a session is a hash of it.
 */

/** RFC 9470 — the assurance level a step-up authorization must reach */
const STEP_UP_ACR = 'AAL2';

/** Only http(s) origins can be compared meaningfully; every other scheme reports its origin as `"null"` */
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

/** Used when identity answers with an expiry this SDK cannot read, so a session is never immortal by accident */
const FALLBACK_SESSION_TTL_MS = 60 * 60 * 1000;

/** An unreadable timestamp must fail towards "expires sooner", never towards "never expires" */
const parseExpiry = (value: string, fallback: number): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class AppSessionService {
  private readonly logger = Logger.getLogger(NAMESPACE, AppSessionService.name);
  private readonly tokens = new AccessTokenCache();
  private readonly registry = new SessionRegistry();

  /**
   * Elevation grant windows in epoch milliseconds, keyed by session hash. The D-19 isolation boundary
   * is (app session, audience), but a service only ever mints for its own audience, so the audience is
   * a constant here — carrying it in the key would only invite a stale one into a lookup.
   */
  private readonly grants = new Map<string, number>();

  /** The last runtime derived from a registration, kept so an unchanged registration costs nothing */
  private derived: { registration: AppRegistration; runtime: BrowserAuthRuntime } | null = null;

  constructor(
    private readonly client: AuthClient,
    private readonly config: ResolvedBrowserAuthConfig,
  ) {}

  /**
   * Resolves the identity-owned half of the configuration and validates what a deploy can still get
   * wrong. Called once at startup so a misregistration surfaces at boot rather than on a user's first
   * login, and cheap afterwards — the registration is cached and refreshed on its own TTL.
   */
  async warmUp(): Promise<BrowserAuthRuntime> {
    const runtime = await this.runtime();
    if (this.config.validateScopes) await this.client.assertScopesSupported(runtime.scopes);
    this.warnOnRedirectUriMismatch(runtime.redirectUri);
    this.logger.info('browser auth resolved from the app registration', {
      clientId: runtime.clientId,
      audience: runtime.audience,
      redirectUri: runtime.redirectUri,
      scopes: runtime.scopes,
    });
    return runtime;
  }

  /** Starts a login: PKCE, `state`, `nonce` and `resource` out; the transient state rides in its own cookie */
  async beginLogin(returnTo?: string): Promise<LoginRedirect> {
    const [document, runtime] = await Promise.all([this.client.getDiscovery(), this.runtime()]);
    const pkce = await createPkcePair();
    const state: LoginState = { state: randomUrlSafeString(16), nonce: randomUrlSafeString(16), codeVerifier: pkce.verifier, returnTo: this.resolveReturnTo(returnTo) };

    const url = buildAuthorizationUrl({
      authorizationEndpoint: document.authorization_endpoint,
      clientId: runtime.clientId,
      redirectUri: runtime.redirectUri,
      scopes: runtime.scopes,
      state: state.state,
      nonce: state.nonce,
      codeChallenge: pkce.challenge,
      resource: runtime.audience,
    });

    this.logger.debug('login started', { returnTo: state.returnTo });
    return { url, cookies: [serializeCookie(this.config.stateCookieName, encodeLoginState(state), this.config.stateCookie)] };
  }

  /** Completes the callback: validates `state`, redeems the code for a handle, and sets the session cookie */
  async completeLogin(query: { code?: string; state?: string }, cookies: Record<string, string>): Promise<LoginResult> {
    const pending = decodeLoginState(cookies[this.config.stateCookieName]);
    if (!pending) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'no in-flight login matched this callback' }));
    if (!query.code) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'the callback carried no authorization code' }));
    if (!query.state || !matchesState(pending.state, query.state)) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'the callback state did not match' }));

    const { redirectUri } = await this.runtime();
    const session = await this.client.appSessions.createSession({ code: query.code, codeVerifier: pending.codeVerifier, redirectUri });
    const handleHash = hashSessionHandle(session.sessionHandle);
    this.registry.register(handleHash, session.userId, parseExpiry(session.expiresAt, Date.now() + FALLBACK_SESSION_TTL_MS));

    this.logger.info('app session established', { userId: session.userId, scope: session.scope });
    return {
      cookies: [serializeCookie(this.config.cookieName, session.sessionHandle, this.config.cookie), expireCookie(this.config.stateCookieName, this.config.stateCookie)],
      returnTo: pending.returnTo,
      userId: session.userId,
    };
  }

  /**
   * Resolves the caller behind a session cookie into the same principal a bearer token would produce:
   * an access token for this app's own audience, minted or served from cache, then verified through
   * the ordinary offline path. Route handlers never learn which credential the caller presented.
   */
  async resolvePrincipal(handle: string, request: TokenRequest = {}): Promise<AuthPrincipal> {
    const token = await this.getAccessToken(handle, request);
    return this.client.verify(token.accessToken);
  }

  /** The cached-or-minted access token for this app's audience; elevation is part of the cache key, never a property of the entry */
  async getAccessToken(handle: string, request: TokenRequest = {}): Promise<AppSessionToken> {
    const handleHash = hashSessionHandle(handle);
    if (!this.registry.isActive(handleHash)) throw AuthErrorCode.SESSION_INVALID.create({ reason: 'session was ended by a back-channel logout' });

    const runtime = await this.runtime();
    const elevated = request.elevated ?? false;
    const key = { handleHash, audience: runtime.audience, elevated, scope: runtime.scopes.join(' ') || undefined };
    const cached = this.tokens.get(key);
    if (cached) return cached;

    const minted = await this.mint(runtime, handle, handleHash, elevated);

    /**
     * An elevated token is only cached for as long as the grant it came from is known to last. When
     * that window is unknown — identity still held a grant this process never saw it claim — the
     * expiry passed here is already in the past, so the token is used once and never stored. Guessing
     * a window would be the one way an `AAL2` token could outlive its elevation.
     */
    this.tokens.set(key, minted, elevated ? (this.grants.get(handleHash) ?? 0) : undefined);
    return minted;
  }

  /**
   * Spends the user's step-up into a grant for this app session and this audience only. Elevation
   * never bleeds to another service or up to the parent identity session, which is exactly why a
   * user driving two applications must step up in each — the cost of the isolation, not a defect.
   */
  async claimElevation(handle: string): Promise<void> {
    const handleHash = hashSessionHandle(handle);
    const { audience } = await this.runtime();
    const elevation = await this.client.appSessions.claimElevation(handle, audience).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
    /** An unreadable grant window records as already closed, so nothing elevated is ever cached from it */
    this.grants.set(handleHash, parseExpiry(elevation.expiresAt, 0));

    /** Anything cached before the grant opened predates the elevation and must not be reused across it */
    this.tokens.evictElevated(handleHash);
  }

  /** The organisations this session may act in, with the active one flagged; a single-entry list means there is nothing to switch to */
  async listOrganisations(handle: string): Promise<AppSessionOrganisation[]> {
    const handleHash = hashSessionHandle(handle);
    return this.client.appSessions.listOrganisations(handle).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
  }

  /**
   * Moves the session into another organisation and returns the cookie carrying its rotated handle.
   *
   * Identity retires the old handle, and that is precisely what makes the switch safe: tokens are
   * cached against the handle, so a sibling replica — which never saw this request — would otherwise
   * keep serving the previous organisation's authority until the token expired. A hash no client will
   * present again is unreachable everywhere at once, which no local eviction could achieve. The local
   * eviction below is merely the cheap half.
   */
  async switchOrganisation(handle: string, organisationId: string): Promise<{ cookies: string[]; organisationId: string }> {
    const handleHash = hashSessionHandle(handle);
    const switched = await this.client.appSessions.switchOrganisation(handle, organisationId).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));

    const rotatedHash = hashSessionHandle(switched.sessionHandle);
    this.registry.rotate(handleHash, rotatedHash, parseExpiry(switched.expiresAt, Date.now() + FALLBACK_SESSION_TTL_MS));
    this.evictTokens(handleHash);

    this.logger.info('app session organisation switched', { organisationId: switched.organisationId });
    return { cookies: [serializeCookie(this.config.cookieName, switched.sessionHandle, this.config.cookie)], organisationId: switched.organisationId };
  }

  /**
   * Ends this application's session only; the central identity session is deliberately untouched.
   * The handle is marked dead locally whether or not identity confirms it — a revocation that times
   * out must not leave a logged-out handle quietly replayable against this process.
   */
  async logout(handle: string | undefined): Promise<string[]> {
    if (handle) {
      this.revoke(hashSessionHandle(handle));
      await this.client.appSessions
        .revokeSession(handle)
        .catch((error: Error) => this.logger.warn('app session revocation failed; the handle is refused locally regardless', { reason: error.message }));
    }
    return this.clearedCookies();
  }

  /** Drops every local session of the user identity has signed out, along with their cached tokens */
  async handleBackchannelLogout(logoutToken: string): Promise<void> {
    const claims = await this.client.verifyLogoutToken(logoutToken);
    if (!claims.sub) {
      /** Identity keys first-party sessions by user; a `sid`-only notice has nothing here to match */
      this.logger.warn('back-channel logout carried no sub; no local session could be matched', { sid: Boolean(claims.sid) });
      return;
    }
    for (const handleHash of this.registry.revokeSubject(claims.sub)) this.evictTokens(handleHash);
  }

  /** Reads the opaque handle out of the request's cookies; absent means "not logged in", never "anonymous but fine" */
  readHandle(cookies: Record<string, string>): string | undefined {
    return cookies[this.config.cookieName] || undefined;
  }

  clearedCookies(): string[] {
    return [expireCookie(this.config.cookieName, this.config.cookie), expireCookie(this.config.stateCookieName, this.config.stateCookie)];
  }

  /** This service's own login route, carrying where the browser should land once it is back */
  loginUrl(returnTo: string): string {
    return this.localUrl(this.config.routes.login, returnTo);
  }

  /**
   * This service's own step-up route. The guard sends the browser here rather than straight to
   * identity, because the user may already have stepped up elsewhere — in which case claiming the
   * grant is enough and no second prompt is needed.
   */
  stepUpUrl(returnTo: string): string {
    return this.localUrl(this.config.routes.stepUp, returnTo);
  }

  /**
   * Identity's step-up prompt, for when there is no step-up left to claim. It names its beneficiary:
   * without `client_id` and `resource` the resulting window is unattributed, and any application the
   * user happens to be driving could claim it first — the D-19 acquisition race. With them, identity
   * records who the step-up was for and refuses a claim from anybody else.
   */
  async identityStepUpUrl(returnTo: string): Promise<string> {
    const runtime = await this.runtime();
    const url = new URL(runtime.stepUpUrl);
    url.searchParams.set('client_id', runtime.clientId);
    url.searchParams.set('resource', runtime.audience);
    url.searchParams.set('return_to', new URL(returnTo, runtime.redirectUri).toString());
    url.searchParams.set('acr_values', STEP_UP_ACR);
    return url.toString();
  }

  private localUrl(path: string | false, returnTo: string): string {
    const base = path ? `${this.config.routes.basePath}${path}` : this.config.postLoginRedirect;
    return `${base}?return_to=${encodeURIComponent(returnTo)}`;
  }

  /** Identity's RP-initiated logout, when one is configured; otherwise the browser stays on this app */
  async endSessionUrl(): Promise<string | undefined> {
    const postLogout = this.config.postLogoutRedirect;
    if (!postLogout) return undefined;

    const endpoint = (await this.client.getDiscovery()).end_session_endpoint;
    if (!endpoint) return this.resolveReturnTo(postLogout);

    const url = new URL(endpoint);
    url.searchParams.set('client_id', (await this.runtime()).clientId);
    url.searchParams.set('post_logout_redirect_uri', this.assertAllowedRedirect(postLogout));
    return url.toString();
  }

  /**
   * Validates a `return_to` against the allow-list. Same-origin absolute paths are always fine;
   * anything else must be named in configuration. The check runs on a slash-normalised copy because
   * a browser folds backslashes into slashes for http(s): `//evil.test` and `/\evil.test` both read
   * as a path to a careless comparison and as an origin to the thing that actually follows them.
   */
  resolveReturnTo(candidate: string | undefined): string {
    if (!candidate) return this.config.postLoginRedirect;

    const normalised = candidate.replace(/\\/g, '/');
    if (normalised.startsWith('/') && !normalised.startsWith('//')) return normalised;
    return this.assertAllowedRedirect(candidate);
  }

  private assertAllowedRedirect(candidate: string): string {
    const target = URL.parse(candidate);
    const allowed = target && this.config.allowedRedirects.some(entry => this.covers(entry, target));
    if (!allowed) throw this.logged(AuthErrorCode.REDIRECT_NOT_ALLOWED.create({ reason: `'${candidate}' is not in the redirect allow-list` }));
    return target.toString();
  }

  /**
   * An allow-list entry matches on exact origin, and on path prefix when it names one. Both sides
   * must be http(s): every other scheme reports its origin as the string `"null"`, which would make
   * one custom-scheme entry match every custom-scheme target.
   */
  private covers(entry: string, target: URL): boolean {
    const allowed = URL.parse(entry);
    if (!allowed || !WEB_PROTOCOLS.has(allowed.protocol) || !WEB_PROTOCOLS.has(target.protocol)) return false;
    if (allowed.origin !== target.origin) return false;
    if (allowed.pathname === '/') return true;
    return target.pathname === allowed.pathname || target.pathname.startsWith(`${allowed.pathname.replace(/\/+$/, '')}/`);
  }

  private async mint(runtime: BrowserAuthRuntime, handle: string, handleHash: string, elevated: boolean): Promise<AppSessionToken> {
    const scope = runtime.scopes.join(' ') || undefined;
    const input = { sessionHandle: handle, resource: runtime.audience, scope, elevated };
    return this.client.appSessions.mintToken(input).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
  }

  /**
   * Merges what identity says about this application with the local overrides. Recomputed only when the
   * registration itself changes, so a request pays one map lookup rather than re-deriving on every call.
   */
  private async runtime(): Promise<BrowserAuthRuntime> {
    const [registration, audience, stepUpEndpoint] = await Promise.all([
      this.client.getAppRegistration(),
      this.client.getAudience(),
      this.config.stepUpUrl ? Promise.resolve(this.config.stepUpUrl) : this.client.getStepUpEndpoint(),
    ]);

    const cached = this.derived;
    if (cached?.registration === registration && cached.runtime.audience === audience && cached.runtime.stepUpUrl === stepUpEndpoint) return cached.runtime;

    const runtime: BrowserAuthRuntime = {
      clientId: registration.appId,
      audience,
      redirectUri: this.config.redirectUri ?? this.callbackRedirectUri(registration.redirectUris),
      scopes: this.config.scopes ?? registration.scopes,
      stepUpUrl: stepUpEndpoint,
    };
    this.derived = { registration, runtime };
    return runtime;
  }

  /**
   * An application may have several registered redirect URIs. The one belonging to this deployment is
   * the one pointing at the callback route this process actually serves — which is all the SDK can
   * know, since a service behind a proxy cannot see its own public origin. When that is still
   * ambiguous the choice is arbitrary, so it says so and the deploy is expected to pin `redirectUri`.
   */
  private callbackRedirectUri(redirectUris: string[]): string {
    const callbackPath = this.config.routes.callback ? `${this.config.routes.basePath}${this.config.routes.callback}` : '';
    const matches = redirectUris.filter(uri => URL.parse(uri)?.pathname === callbackPath);
    if (matches.length > 1) {
      this.logger.warn('several registered redirect uris point at the callback route; pin browser.redirectUri to say which origin this deployment serves', {
        candidates: matches,
      });
    }

    const chosen = matches[0] ?? redirectUris[0];
    if (!chosen) throw this.logged(AuthErrorCode.CONFIG_INVALID.create({ reason: 'identity has no redirect uri registered for this application' }));
    return chosen;
  }

  /**
   * A registered redirect uri that does not point at the callback route is the classic silent failure:
   * login works, the browser comes back to nothing. It stays a warning rather than an error because a
   * reverse proxy is perfectly entitled to rewrite the path in front of the service.
   */
  private warnOnRedirectUriMismatch(redirectUri: string): void {
    if (!this.config.routes.callback) return;
    const callbackPath = `${this.config.routes.basePath}${this.config.routes.callback}`;
    const registered = URL.parse(redirectUri);
    if (!registered || registered.pathname === callbackPath) return;

    this.logger.warn('the registered redirect uri does not point at the callback route; identity will send the browser somewhere this service does not serve', {
      redirectPath: registered.pathname,
      callbackPath,
    });
  }

  /**
   * A handle identity has rejected is remembered as dead rather than merely dropped. That keeps a
   * forged or replayed cookie from buying a fresh round trip to identity on every retry — without it
   * an unknown hash reads as active again immediately, and the application becomes an amplifier
   * pointed at the one service every other application also depends on.
   */
  private forgetOnInvalidSession(handleHash: string, error: unknown): never {
    if (AppError.is(error, AuthErrorCode.SESSION_INVALID)) this.revoke(handleHash);
    throw error;
  }

  private revoke(handleHash: string): void {
    this.registry.revoke(handleHash);
    this.evictTokens(handleHash);
  }

  private evictTokens(handleHash: string): void {
    this.tokens.evictSession(handleHash);
    this.grants.delete(handleHash);
  }

  /** Records the failure at warn level before it propagates; browser-flow rejections are expected traffic, not defects */
  private logged(error: AppError): AppError {
    this.logger.warn(error.message);
    return error;
  }
}

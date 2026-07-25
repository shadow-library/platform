/**
 * Importing npm packages
 */
import { AppError, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppSessionToken, AuthPrincipal } from '../interfaces';
import { AccessTokenCache, hashSessionHandle } from '../lib/access-token-cache';
import { AuthClient } from '../lib/auth-client';
import { buildAuthorizationUrl } from '../rp/authorization-url';
import { createPkcePair, randomUrlSafeString } from '../rp/pkce';
import { ResolvedBrowserAuthConfig } from './config';
import { expireCookie, serializeCookie } from './cookie';
import { LoginState, matchesState } from './login-state';
import { SessionRegistry } from './session-registry';

/**
 * Defining types
 */

export interface LoginRedirect {
  url: string;
  /** The transient login-state cookie; sealed or opaque, never readable by the browser */
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

  /** Elevation grant windows in epoch milliseconds, keyed by (session hash, audience) — the D-19 isolation boundary */
  private readonly grants = new Map<string, number>();

  constructor(
    private readonly client: AuthClient,
    private readonly config: ResolvedBrowserAuthConfig,
  ) {}

  /** Starts a login: PKCE, `state`, `nonce` and `resource` out; the transient state stays server-side or sealed */
  async beginLogin(returnTo?: string): Promise<LoginRedirect> {
    const document = await this.client.getDiscovery();
    const pkce = await createPkcePair();
    const state: LoginState = { state: randomUrlSafeString(16), nonce: randomUrlSafeString(16), codeVerifier: pkce.verifier, returnTo: this.resolveReturnTo(returnTo) };

    const url = buildAuthorizationUrl({
      authorizationEndpoint: document.authorization_endpoint,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes,
      state: state.state,
      nonce: state.nonce,
      codeChallenge: pkce.challenge,
      resource: this.config.audience,
    });

    const sealed = await this.config.loginStateStore.save(state);
    this.logger.debug('login started', { returnTo: state.returnTo });
    return { url, cookies: [serializeCookie(this.config.stateCookieName, sealed, this.config.stateCookie)] };
  }

  /** Completes the callback: validates `state`, redeems the code for a handle, and sets the session cookie */
  async completeLogin(query: { code?: string; state?: string }, cookies: Record<string, string>): Promise<LoginResult> {
    const carried = cookies[this.config.stateCookieName];
    const pending = carried ? await this.config.loginStateStore.take(carried) : null;
    if (!pending) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'no in-flight login matched this callback' }));
    if (!query.code) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'the callback carried no authorization code' }));
    if (!query.state || !matchesState(pending.state, query.state)) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'the callback state did not match' }));

    const session = await this.client.appSessions.createSession({ code: query.code, codeVerifier: pending.codeVerifier, redirectUri: this.config.redirectUri });
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

    const elevated = request.elevated ?? false;
    const key = { handleHash, audience: this.config.audience, elevated, scope: this.config.scopes.join(' ') || undefined };
    const cached = this.tokens.get(key);
    if (cached) return cached;

    const minted = await this.mint(handle, handleHash, elevated);

    /**
     * An elevated token is only cached for as long as the grant it came from is known to last. When
     * that window is unknown — identity still held a grant this process never saw it claim — the
     * expiry passed here is already in the past, so the token is used once and never stored. Guessing
     * a window would be the one way an `AAL2` token could outlive its elevation.
     */
    this.tokens.set(key, minted, elevated ? (this.grants.get(this.grantKey(handleHash)) ?? 0) : undefined);
    return minted;
  }

  /**
   * Spends the user's step-up into a grant for this app session and this audience only. Elevation
   * never bleeds to another service or up to the parent identity session, which is exactly why a
   * user driving two applications must step up in each — the cost of the isolation, not a defect.
   */
  async claimElevation(handle: string): Promise<void> {
    const handleHash = hashSessionHandle(handle);
    const elevation = await this.client.appSessions.claimElevation(handle, this.config.audience).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
    /** An unreadable grant window records as already closed, so nothing elevated is ever cached from it */
    this.grants.set(this.grantKey(handleHash), parseExpiry(elevation.expiresAt, 0));

    /** Anything cached before the grant opened predates the elevation and must not be reused across it */
    this.tokens.evictElevated(handleHash);
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

  /** Identity's step-up prompt, for when there is no step-up left to claim */
  identityStepUpUrl(returnTo: string): string {
    const url = new URL(this.config.stepUpUrl);
    url.searchParams.set('return_to', new URL(returnTo, this.config.redirectUri).toString());
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
    url.searchParams.set('client_id', this.config.clientId);
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

  private async mint(handle: string, handleHash: string, elevated: boolean): Promise<AppSessionToken> {
    const scope = this.config.scopes.join(' ') || undefined;
    const input = { sessionHandle: handle, resource: this.config.audience, scope, elevated };
    return this.client.appSessions.mintToken(input).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
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
    this.grants.delete(this.grantKey(handleHash));
  }

  private grantKey(handleHash: string): string {
    return `${handleHash}|${this.config.audience}`;
  }

  /** Records the failure at warn level before it propagates; browser-flow rejections are expected traffic, not defects */
  private logged(error: AppError): AppError {
    this.logger.warn(error.message);
    return error;
  }
}

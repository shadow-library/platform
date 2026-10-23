import { AppError, Logger } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppRegistration, AppSessionOrganisation, AppSessionToken, AuthPrincipal, UserInfo } from '../interfaces';
import { AccessTokenCache, hashSessionHandle } from '../lib/access-token-cache';
import { AuthClient } from '../lib/auth-client';
import { buildAuthorizationUrl } from '../rp/authorization-url';
import { createPkcePair, randomUrlSafeString } from '../rp/pkce';
import { ResolvedBrowserAuthConfig } from './config';
import { expireCookie, serializeCookie } from './cookie';
import { decodeLoginState, encodeLoginState, LoginState, matchesState } from './login-state';
import { SessionRegistry } from './session-registry';

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

export interface BrowserAuthRuntime {
  clientId: string;
  audience: string;
  redirectUri: string;
  scopes: string[];
  /** Asked for at authorize and minted only into an elevated token; see {@link AppRegistration.sensitiveScopes} */
  sensitiveScopes: string[];
  stepUpUrl: string;
}

/** RFC 9470 `acr_values` for the assurance level a step-up must reach */
const STEP_UP_ACR = 'AAL2';

/** Only http(s) origins can be compared meaningfully; every other scheme reports its origin as `"null"` */
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

/** Stands in for this application's origin when resolving a relative `return_to`; only whether the reference leaves it matters */
const SAME_ORIGIN_BASE = 'https://return-to.invalid';

/** A browser silently drops tabs and newlines from a URL, so `/\t/evil.test` reaches it as `//evil.test` */
const CONTROL_CHARACTERS = /\p{Cc}/u;

/** Used when identity answers with an expiry this SDK cannot read, so a session is never immortal by accident */
const FALLBACK_SESSION_TTL_MS = 60 * 60 * 1000;

const PROFILE_TTL_MS = 5 * 60 * 1000;

const PROTOCOL_SCOPES = ['openid', 'profile'];

/** Identity releases a sensitive scope only into an elevated token, so asking for one on a plain mint would only read as a narrowed grant */
const mintScope = (runtime: BrowserAuthRuntime, elevated: boolean): string | undefined =>
  (elevated ? [...runtime.scopes, ...runtime.sensitiveScopes] : runtime.scopes).join(' ') || undefined;

/** An unreadable timestamp must fail towards "expires sooner", never towards "never expires" */
const parseExpiry = (value: string, fallback: number): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class AppSessionService {
  private readonly logger = Logger.getLogger(NAMESPACE, AppSessionService.name);
  private readonly tokens = new AccessTokenCache();
  private readonly registry = new SessionRegistry();

  private readonly mints = new Map<string, Promise<AppSessionToken>>();

  /** Elevation grant windows in epoch ms by session hash; the audience is omitted from the key because a service only mints for its own */
  private readonly grants = new Map<string, number>();

  private derived: { registration: AppRegistration; requestOrigin: string | undefined; runtime: BrowserAuthRuntime } | null = null;

  /** Keyed by session hash rather than subject so every eviction path (logout, organisation switch, back-channel notice) drops the profile with the tokens */
  private readonly profiles = new Map<string, { profile: UserInfo; expiresAt: number }>();

  constructor(
    private readonly client: AuthClient,
    private readonly config: ResolvedBrowserAuthConfig,
  ) {}

  /** Called at startup so a misregistration surfaces at boot rather than on a user's first login */
  async warmUp(): Promise<BrowserAuthRuntime> {
    const runtime = await this.runtime(undefined);
    if (this.config.validateScopes) await this.client.assertScopesSupported([...runtime.scopes, ...runtime.sensitiveScopes]);
    this.warnOnRedirectUriMismatch(runtime.redirectUri);
    this.logger.info('browser auth resolved from the app registration', {
      clientId: runtime.clientId,
      audience: runtime.audience,
      redirectUri: runtime.redirectUri,
      scopes: runtime.scopes,
      sensitiveScopes: runtime.sensitiveScopes,
    });
    return runtime;
  }

  async beginLogin(returnTo?: string, requestOrigin?: string): Promise<LoginRedirect> {
    const [document, runtime] = await Promise.all([this.client.getDiscovery(), this.runtime(requestOrigin)]);
    const pkce = await createPkcePair();
    const state: LoginState = { state: randomUrlSafeString(16), nonce: randomUrlSafeString(16), codeVerifier: pkce.verifier, returnTo: this.resolveReturnTo(returnTo) };

    const url = buildAuthorizationUrl({
      authorizationEndpoint: document.authorization_endpoint,
      clientId: runtime.clientId,
      redirectUri: runtime.redirectUri,
      scopes: [...runtime.scopes, ...runtime.sensitiveScopes],
      state: state.state,
      nonce: state.nonce,
      codeChallenge: pkce.challenge,
      resource: runtime.audience,
    });

    this.logger.debug('login started', { returnTo: state.returnTo });
    return { url, cookies: [serializeCookie(this.config.stateCookieName, encodeLoginState(state), this.config.stateCookie)] };
  }

  async completeLogin(query: { code?: string; state?: string }, cookies: Record<string, string>, requestOrigin?: string): Promise<LoginResult> {
    const pending = decodeLoginState(cookies[this.config.stateCookieName]);
    if (!pending) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'no in-flight login matched this callback' }));
    if (!query.code) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'the callback carried no authorization code' }));
    if (!query.state || !matchesState(pending.state, query.state)) throw this.logged(AuthErrorCode.LOGIN_STATE_INVALID.create({ reason: 'the callback state did not match' }));

    const { redirectUri } = await this.runtime(requestOrigin);
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

  /** Produces the same principal a bearer token would, so route handlers never learn which credential was presented */
  async resolvePrincipal(handle: string, request: TokenRequest = {}): Promise<AuthPrincipal> {
    const token = await this.getAccessToken(handle, request);
    return this.client.verify(token.accessToken);
  }

  /** Kept off `resolvePrincipal` so an unreachable userinfo endpoint can never fail the auth gate; it degrades to the subject the token proved */
  async getUserInfo(handle: string): Promise<UserInfo> {
    const handleHash = hashSessionHandle(handle);
    const cached = this.profiles.get(handleHash);
    if (cached && cached.expiresAt > Date.now()) return cached.profile;

    const token = await this.getAccessToken(handle);
    const principal = await this.client.verify(token.accessToken);

    try {
      const profile = await this.client.getUserInfo(token.accessToken);
      this.profiles.set(handleHash, { profile, expiresAt: Date.now() + PROFILE_TTL_MS });
      return profile;
    } catch (error) {
      // Not cached: one unreachable moment must not leave this person nameless for the whole TTL
      this.logger.warn('userinfo lookup failed; falling back to the subject the token proved', { reason: (error as Error).message });
      return { sub: principal.sub };
    }
  }

  async getAccessToken(handle: string, request: TokenRequest = {}): Promise<AppSessionToken> {
    const handleHash = hashSessionHandle(handle);
    if (!this.registry.isActive(handleHash)) throw AuthErrorCode.SESSION_INVALID.create({ reason: 'session was ended by a back-channel logout' });

    const runtime = await this.runtime(undefined);
    const elevated = request.elevated ?? false;
    const key = { handleHash, audience: runtime.audience, elevated, scope: mintScope(runtime, elevated) };
    const cached = this.tokens.get(key);
    if (cached) return cached;

    // Concurrent cache misses (a cold page load) would each mint; sharing one is safe because the key names elevation, so an AAL2 mint never reaches an AAL1 caller
    const flightKey = `${handleHash}|${elevated ? 'AAL2' : 'AAL1'}|${key.audience}|${key.scope ?? ''}`;
    const inflight = this.mints.get(flightKey);
    if (inflight) return inflight;

    const flight = this.mint(runtime.audience, key.scope, handle, handleHash, elevated)
      .then(minted => {
        // An unknown grant window (a grant this process never saw claimed) yields an expiry in the past, so the token is used once and never stored; guessing a window could
        // let AAL2 outlive its elevation
        this.tokens.set(key, minted, elevated ? (this.grants.get(handleHash) ?? 0) : undefined);
        return minted;
      })
      .finally(() => this.mints.delete(flightKey));

    this.mints.set(flightKey, flight);
    return flight;
  }

  /** Elevation is scoped to this app session and audience, so a user driving two applications must step up in each */
  async claimElevation(handle: string): Promise<void> {
    const handleHash = hashSessionHandle(handle);
    const { audience } = await this.runtime(undefined);
    const elevation = await this.client.appSessions.claimElevation(handle, audience).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
    // An unreadable grant window records as already closed, so nothing elevated is cached from it
    this.grants.set(handleHash, parseExpiry(elevation.expiresAt, 0));

    // Tokens cached before the grant opened predate the elevation
    this.tokens.evictElevated(handleHash);
  }

  async listOrganisations(handle: string): Promise<AppSessionOrganisation[]> {
    const handleHash = hashSessionHandle(handle);
    return this.client.appSessions.listOrganisations(handle).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
  }

  /** Identity retires the old handle, which makes sibling replicas' cached tokens for the previous organisation unreachable; the local eviction is the cheap half */
  async switchOrganisation(handle: string, organisationId: string): Promise<{ cookies: string[]; organisationId: string }> {
    const handleHash = hashSessionHandle(handle);
    const switched = await this.client.appSessions.switchOrganisation(handle, organisationId).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));

    const rotatedHash = hashSessionHandle(switched.sessionHandle);
    this.registry.rotate(handleHash, rotatedHash, parseExpiry(switched.expiresAt, Date.now() + FALLBACK_SESSION_TTL_MS));
    this.evictTokens(handleHash);

    this.logger.info('app session organisation switched', { organisationId: switched.organisationId });
    return { cookies: [serializeCookie(this.config.cookieName, switched.sessionHandle, this.config.cookie)], organisationId: switched.organisationId };
  }

  /** Marks the handle dead locally whether or not identity confirms, so a timed-out revocation cannot leave it replayable; the identity session is untouched */
  async logout(handle: string | undefined): Promise<string[]> {
    if (handle) {
      this.revoke(hashSessionHandle(handle));
      await this.client.appSessions
        .revokeSession(handle)
        .catch((error: Error) => this.logger.warn('app session revocation failed; the handle is refused locally regardless', { reason: error.message }));
    }
    return this.clearedCookies();
  }

  async handleBackchannelLogout(logoutToken: string): Promise<void> {
    const claims = await this.client.verifyLogoutToken(logoutToken);
    if (!claims.sub) {
      // Identity keys first-party sessions by user; a sid-only notice has nothing here to match
      this.logger.warn('back-channel logout carried no sub; no local session could be matched', { sid: Boolean(claims.sid) });
      return;
    }
    for (const handleHash of this.registry.revokeSubject(claims.sub)) this.evictTokens(handleHash);
  }

  readHandle(cookies: Record<string, string>): string | undefined {
    return cookies[this.config.cookieName] || undefined;
  }

  async sensitiveScopes(): Promise<string[]> {
    return (await this.runtime(undefined)).sensitiveScopes;
  }

  /** Ends a session whose grant predates the sensitive-scope consent and marks the browser as sent round once */
  async beginReconsent(handle: string): Promise<string[]> {
    const cleared = await this.logout(handle);
    return [...cleared, serializeCookie(this.config.reconsentCookieName, '1', this.config.reconsentCookie)];
  }

  hasReconsented(cookies: Record<string, string>): boolean {
    return cookies[this.config.reconsentCookieName] === '1';
  }

  reconsentSpentCookie(): string {
    return expireCookie(this.config.reconsentCookieName, this.config.reconsentCookie);
  }

  clearedCookies(): string[] {
    return [expireCookie(this.config.cookieName, this.config.cookie), expireCookie(this.config.stateCookieName, this.config.stateCookie)];
  }

  loginUrl(returnTo: string): string {
    return this.localUrl(this.config.routes.login, returnTo);
  }

  /** The guard sends the browser here rather than straight to identity because the user may already have stepped up elsewhere, in which case claiming the grant suffices */
  stepUpUrl(returnTo: string): string {
    return this.localUrl(this.config.routes.stepUp, returnTo);
  }

  /** `client_id` and `resource` name the beneficiary; without them any application the user is driving could claim the window first */
  async identityStepUpUrl(returnTo: string): Promise<string> {
    const runtime = await this.runtime(undefined);
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

  async endSessionUrl(): Promise<string | undefined> {
    const postLogout = this.config.postLogoutRedirect;
    if (!postLogout) return undefined;

    const endpoint = (await this.client.getDiscovery()).end_session_endpoint;
    if (!endpoint) return this.resolveReturnTo(postLogout);

    const url = new URL(endpoint);
    url.searchParams.set('client_id', (await this.runtime(undefined)).clientId);
    url.searchParams.set('post_logout_redirect_uri', this.assertAllowedRedirect(postLogout));
    return url.toString();
  }

  /**
   * Decided by the URL parser, not a prefix check: browsers fold backslashes and strip control characters, so `/\evil.test` and `/\t/evil.test` are origins to them but
   * paths to a string comparison. Only the parser's normalised path is returned, and one starting `//` is refused, so the result cannot be reread as an authority
   */
  resolveReturnTo(candidate: string | undefined): string {
    if (!candidate) return this.config.postLoginRedirect;
    if (CONTROL_CHARACTERS.test(candidate)) throw this.redirectRefused(candidate);
    if (URL.canParse(candidate)) return this.assertAllowedRedirect(candidate);

    const target = URL.parse(candidate, SAME_ORIGIN_BASE);
    if (target?.origin !== SAME_ORIGIN_BASE || target.pathname.startsWith('//')) throw this.redirectRefused(candidate);
    return `${target.pathname}${target.search}${target.hash}`;
  }

  private assertAllowedRedirect(candidate: string): string {
    const target = URL.parse(candidate);
    const allowed = target && this.config.allowedRedirects.some(entry => this.covers(entry, target));
    if (!allowed) throw this.redirectRefused(candidate);
    return target.toString();
  }

  private redirectRefused(candidate: string): AppError {
    return this.logged(AuthErrorCode.REDIRECT_NOT_ALLOWED.create({ reason: `'${candidate}' is not in the redirect allow-list` }));
  }

  /** Both sides must be http(s): other schemes report origin `"null"`, so one custom-scheme entry would match every custom-scheme target */
  private covers(entry: string, target: URL): boolean {
    const allowed = URL.parse(entry);
    if (!allowed || !WEB_PROTOCOLS.has(allowed.protocol) || !WEB_PROTOCOLS.has(target.protocol)) return false;
    if (allowed.origin !== target.origin) return false;
    if (allowed.pathname === '/') return true;
    return target.pathname === allowed.pathname || target.pathname.startsWith(`${allowed.pathname.replace(/\/+$/, '')}/`);
  }

  private async mint(resource: string, scope: string | undefined, handle: string, handleHash: string, elevated: boolean): Promise<AppSessionToken> {
    const input = { sessionHandle: handle, resource, scope, elevated };
    return this.client.appSessions.mintToken(input).catch((error: unknown) => this.forgetOnInvalidSession(handleHash, error));
  }

  private async runtime(requestOrigin: string | undefined): Promise<BrowserAuthRuntime> {
    const [registration, audience, stepUpEndpoint] = await Promise.all([
      this.client.getAppRegistration(),
      this.client.getAudience(),
      this.config.stepUpUrl ? Promise.resolve(this.config.stepUpUrl) : this.client.getStepUpEndpoint(),
    ]);

    const cached = this.derived;
    if (cached?.registration === registration && cached.requestOrigin === requestOrigin && cached.runtime.audience === audience && cached.runtime.stepUpUrl === stepUpEndpoint)
      return cached.runtime;

    // Registrations list API scopes, never OIDC ones; without the protocol scopes the session consents to nothing and identity cannot release the person's name.
    // An override pins the whole set, but a sensitive scope it names still belongs to the elevated set only.
    const sensitiveScopes = registration.sensitiveScopes.filter(scope => !this.config.scopes || this.config.scopes.includes(scope));
    const scopes = [...new Set([...PROTOCOL_SCOPES, ...(this.config.scopes ?? registration.scopes)])].filter(scope => !sensitiveScopes.includes(scope));
    const runtime: BrowserAuthRuntime = {
      clientId: registration.appId,
      audience,
      redirectUri: this.config.redirectUri ?? this.callbackRedirectUri(registration.redirectUris, requestOrigin),
      scopes,
      sensitiveScopes,
      stepUpUrl: stepUpEndpoint,
    };
    this.derived = { registration, requestOrigin, runtime };
    return runtime;
  }

  /**
   * Picks by callback path, then by request origin (a proxied service cannot see its public origin otherwise); the first-candidate fallback is arbitrary and warns so the
   * deploy pins `redirectUri`
   */
  private callbackRedirectUri(redirectUris: string[], requestOrigin?: string): string {
    const callbackPath = this.config.routes.callback ? `${this.config.routes.basePath}${this.config.routes.callback}` : '';
    const matches = redirectUris.filter(uri => URL.parse(uri)?.pathname === callbackPath);

    if (matches.length > 1 && requestOrigin) {
      const originMatch = matches.find(uri => URL.parse(uri)?.origin === requestOrigin);
      if (originMatch) return originMatch;
    }

    if (matches.length > 1) {
      this.logger.warn('several registered redirect uris point at the callback route; pin browser.redirectUri to say which origin this deployment serves', {
        candidates: matches,
        requestOrigin,
      });
    }

    const chosen = matches[0] ?? redirectUris[0];
    if (!chosen) throw this.logged(AuthErrorCode.CONFIG_INVALID.create({ reason: 'identity has no redirect uri registered for this application' }));
    return chosen;
  }

  /** A warning, not an error: a reverse proxy may legitimately rewrite the path in front of the service */
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

  /** A rejected handle is remembered as dead, not dropped: an unknown hash reads as active, so forged cookies would otherwise cost identity a round trip per retry */
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
    this.profiles.delete(handleHash);
  }

  private logged(error: AppError): AppError {
    this.logger.warn(error.message);
    return error;
  }
}

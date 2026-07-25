/**
 * Importing npm packages
 */
import { APIRequest, type APIResponse, AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import {
  AuthClientConfig,
  AuthPrincipal,
  CheckInput,
  CheckOptions,
  DiscoveryDocument,
  ExchangedToken,
  FetchLike,
  IntrospectionResult,
  JwtPayload,
  LogoutTokenClaims,
  RoleCatalogManifest,
  RoleCatalogSyncOptions,
  RoleCatalogSyncResult,
  ServiceAccessRule,
  ServiceTokenOptions,
  TokenExchangeInput,
} from '../interfaces';
import { AppSessionClient } from './app-session-client';
import { buildClientAuthentication, isConfidential } from './client-auth';
import { DiscoveryClient } from './discovery';
import { RemoteJwks } from './jwks';
import { type ClaimExpectations, decodeJwt, verifyJwt } from './jwt';
import { PdpClient } from './pdp-client';
import { ServiceAccessClient } from './service-access';
import { ServiceTokenManager } from './token-manager';
import { assertValidTimeout, withTimeout } from './transport';

/**
 * Defining types
 */

interface IntrospectionResponse {
  active?: boolean;
  sub?: string;
  scope?: string;
  aud?: string;
  exp?: number;
  client_id?: string;
  token_type?: string;
}

interface TokenExchangeResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  audience?: string;
}

/**
 * Declaring the constants
 */
const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_TTL_SECONDS = 43_200;
const DEFAULT_DECISION_TTL_SECONDS = 900;

/** Matches the identity server's default token audience for its own API surface */
const DEFAULT_IDENTITY_RESOURCE = 'shadow-identity';

/** The server's PDP and service-access endpoints require a service token granted this scope */
const PDP_SCOPE = 'authz:check';

/** The catalog-sync endpoint requires a service token granted this scope */
const ROLE_SYNC_SCOPE = 'authz:roles:sync';

/** The app-session endpoints require a service token granted this scope */
const APP_SESSION_SCOPE = 'app-session:manage';

/** The `events` member that marks a JWT as a back-channel logout notice rather than an ID token */
const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/** How identity spells "your manifest would delete too much"; anything else on catalog sync is a plain failure */
const CONFLICT = 409;

/** RFC 8693 §2.1 — exchanging one token for another, here to act as the user towards another application */
const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/**
 * The consumer-facing auth client: offline token verification, PDP checks, M2M tokens, role
 * catalog sync, and admin-managed service-access rules. Designed as an injectable class —
 * `AuthModule.forRoot()` registers it under its own class token so application services take it
 * as an ordinary constructor dependency.
 */
export class AuthClient {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthClient.name);
  private readonly issuer: string;
  private readonly transport: FetchLike;
  private readonly timeout?: number;
  private readonly clockSkewSeconds: number;
  private readonly jwks: RemoteJwks;
  private readonly tokens: ServiceTokenManager;
  private readonly pdp: PdpClient;
  private readonly discovery: DiscoveryClient;
  private readonly serviceAccess: ServiceAccessClient;

  /** The first-party app-session protocol client; see `AppSessionClient` for why it is M2M-only */
  readonly appSessions: AppSessionClient;

  constructor(private readonly config: AuthClientConfig) {
    if (!config.issuer || !URL.canParse(config.issuer)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'issuer must be a valid url' });
    if (!config.audience) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'audience is required' });
    if (config.client && !config.client.id) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'client credentials require an id' });
    if ((config.clockSkewSeconds ?? 0) < 0) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'clock skew cannot be negative' });
    if ((config.serviceAccess?.refreshSeconds ?? 1) <= 0) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service access refresh interval must be positive' });
    assertValidTimeout(config.timeout);

    this.issuer = config.issuer.replace(/\/+$/, '');
    this.timeout = config.timeout;
    this.transport = withTimeout(config.fetch ?? ((url, init) => fetch(url, init)), config.timeout);
    this.clockSkewSeconds = config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
    this.discovery = new DiscoveryClient(this.issuer, this.transport);
    this.jwks = new RemoteJwks({ discovery: this.discovery, fetchFn: this.transport, ttlSeconds: config.cache?.jwksTtlSeconds ?? DEFAULT_JWKS_TTL_SECONDS });
    this.tokens = new ServiceTokenManager({ discovery: this.discovery, fetchFn: this.transport, client: config.client });
    this.pdp = new PdpClient({
      issuer: this.issuer,
      fetchFn: this.transport,
      ttlSeconds: config.cache?.decisionTtlSeconds ?? DEFAULT_DECISION_TTL_SECONDS,
      getToken: config.client ? () => this.identityToken(PDP_SCOPE) : undefined,
    });
    this.appSessions = new AppSessionClient({
      issuer: this.issuer,
      fetchFn: this.transport,
      getToken: () => this.identityToken(APP_SESSION_SCOPE),
      invalidateToken: () => this.tokens.invalidate(this.identityTokenOptions(APP_SESSION_SCOPE)),
      strictScopes: config.strictScopes,
    });
    this.serviceAccess = new ServiceAccessClient({
      issuer: this.issuer,
      fetchFn: this.transport,
      getToken: () => this.identityToken(PDP_SCOPE),
      refreshSeconds: config.serviceAccess?.refreshSeconds,
    });
    this.logger.info('auth client initialised', { issuer: this.issuer, audience: config.audience, hasClientCredentials: Boolean(config.client) });
  }

  /** The issuer's discovery document, fetched once per process and cached for the deployment's lifetime */
  getDiscovery(): Promise<DiscoveryDocument> {
    return this.discovery.get();
  }

  /**
   * Fails the boot when a configured scope is absent from the issuer's published `scopes_supported`.
   * A typo would otherwise mint quietly — with the misspelt scope simply dropped — and only surface
   * as a puzzling 403 deep inside a request, so it is worth one startup round trip.
   */
  async assertScopesSupported(scopes: string[]): Promise<void> {
    if (scopes.length === 0) return;
    const supported = (await this.discovery.get()).scopes_supported;
    if (!supported?.length) return;

    const unknown = scopes.filter(scope => !supported.includes(scope));
    if (unknown.length > 0) throw this.logged(AuthErrorCode.SCOPE_UNSUPPORTED.create({ scopes: unknown.join(', ') }));
    this.logger.debug('configured scopes validated against discovery', { scopes });
  }

  /** Verifies a bearer token offline against the issuer's JWKS and returns the resolved principal */
  async verify(token: string): Promise<AuthPrincipal> {
    if (!token) throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'no token provided' });
    const payload = await verifyJwt(token, kid => this.jwks.getKey(kid), this.expectations());
    const principal = this.toPrincipal(payload);
    this.logger.debug('token verified', { sub: principal.sub, kind: principal.kind, scopes: principal.scopes });
    return principal;
  }

  /**
   * Verifies an OIDC back-channel logout token (OpenID Connect Back-Channel Logout 1.0 §2.6). Unlike
   * an access token it is addressed to this *client*, not to this API, and the `events` claim plus
   * the absence of `nonce` are what separate it from an ID token replayed as a logout notice.
   */
  async verifyLogoutToken(token: string): Promise<LogoutTokenClaims> {
    const clientId = this.config.client?.id;
    if (!clientId) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'back-channel logout requires client credentials' });

    const reject = (reason: string): never => throwError(this.logged(AuthErrorCode.LOGOUT_TOKEN_INVALID.create({ reason })));
    const payload = await verifyJwt(token, kid => this.jwks.getKey(kid), { issuer: this.issuer, audience: clientId, clockSkewSeconds: this.clockSkewSeconds }).catch(
      (error: Error) => reject(error.message),
    );

    const events = payload.events;
    if (typeof events !== 'object' || events === null || !(BACKCHANNEL_LOGOUT_EVENT in events)) reject('missing the back-channel logout event');
    if (payload.nonce !== undefined) reject('a logout token must not carry a nonce');
    if (typeof payload.iat !== 'number') reject('missing iat claim');

    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
    if (!sub && !sid) reject('a logout token must carry sub, sid, or both');

    this.logger.info('back-channel logout token verified', { hasSub: Boolean(sub), hasSid: Boolean(sid) });
    return { sub, sid, claims: payload };
  }

  /** Asks the PDP whether the principal may perform the action; deny-by-default on any failure */
  check(input: CheckInput, options?: CheckOptions): Promise<boolean> {
    return this.pdp.check(input, options);
  }

  checkAll(inputs: CheckInput[], options?: CheckOptions): Promise<boolean[]> {
    return this.pdp.checkAll(inputs, options);
  }

  /** Returns a cached client-credentials token for calling another service */
  getServiceToken(options?: ServiceTokenOptions): Promise<string> {
    return this.tokens.getToken(options);
  }

  /**
   * Exchanges the user's token for one addressed to another application, acting *as the user* (RFC
   * 8693, D-22). This is the only supported way to do that: forwarding the user's own token gives the
   * receiving API an audience that is not its own, and asserting the user in a header is forbidden
   * outright because a header is not a credential.
   *
   * The result is never cached. It belongs to one user, is short-lived, and its `exp` is capped by the
   * subject token's — caching it would key a per-user credential by resource and hand it to the wrong
   * caller the moment two users' requests overlap.
   */
  async exchangeUserToken(input: TokenExchangeInput): Promise<ExchangedToken> {
    const client = this.config.client;
    if (!isConfidential(client)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'token exchange requires confidential client credentials' });
    if (!input.resource) throw AuthErrorCode.TOKEN_EXCHANGE_REFUSED.create({ reason: 'a target resource is required' });
    this.assertSingleHop(input.subjectToken);

    const endpoint = (await this.discovery.get()).token_endpoint;
    const requested = input.scopes ?? [];
    const body: Record<string, string> = {
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: input.subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      resource: input.resource,
    };
    if (requested.length > 0) body.scope = requested.join(' ');

    /** Never the body: it carries the user's live access token */
    this.logger.debug('exchanging a user token', { endpoint, resource: input.resource, scopes: requested });
    const response = await this.postToOAuthEndpoint(endpoint, body, AuthErrorCode.TOKEN_EXCHANGE_FAILED, 'token exchange');
    const payload = (await response.json()) as TokenExchangeResponse;
    if (!payload.access_token || typeof payload.expires_in !== 'number') {
      throw this.logged(AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'malformed token exchange response' }));
    }

    const granted = (payload.scope ?? '').split(' ').filter(Boolean);
    const dropped = requested.filter(scope => !granted.includes(scope));
    if (dropped.length > 0) this.logger.warn('token exchange returned a narrowed scope', { resource: input.resource, requested, granted, dropped });

    this.logger.info('user token exchanged', { resource: input.resource, granted, expiresIn: payload.expires_in });
    return { accessToken: payload.access_token, tokenType: payload.token_type ?? 'Bearer', expiresIn: payload.expires_in, scope: granted, audience: payload.audience };
  }

  /**
   * Delegation is single-hop by protocol rule, and the check belongs client-side: a service that is
   * itself being called through an exchange must learn that from the token it holds, not from a round
   * trip to identity that fails for reasons it cannot distinguish from an outage.
   */
  private assertSingleHop(subjectToken: string): void {
    if (!subjectToken) throw AuthErrorCode.TOKEN_EXCHANGE_REFUSED.create({ reason: 'no subject token provided' });

    const refuse = (reason: string): never => throwError(this.logged(AuthErrorCode.TOKEN_EXCHANGE_REFUSED.create({ reason })));
    const payload = (() => {
      try {
        return decodeJwt(subjectToken).payload;
      } catch {
        return refuse('the subject token is not a readable jwt');
      }
    })();
    if (payload.act !== undefined) refuse('the subject token already carries act; delegation is single-hop');
  }

  /** `fetch` with the service token injected and a single automatic retry on a stale-token 401 */
  async fetch(url: string, init: RequestInit = {}, options: ServiceTokenOptions = {}): Promise<Response> {
    this.logger.debug('calling service endpoint', { url, method: init.method ?? 'GET', resource: options.resource });
    const token = await this.tokens.getToken(options);
    const response = await this.transport(url, this.withBearer(init, token));
    if (response.status !== 401) return response;

    this.logger.warn('service call rejected with 401; retrying with a fresh token', { url });
    this.tokens.invalidate(options);
    const fresh = await this.tokens.getToken(options);
    return this.transport(url, this.withBearer(init, fresh));
  }

  /**
   * Calls a named ecosystem service over the `svc://` scheme, which APIRequest resolves through
   * cluster DNS (or a `SERVICE_URL_<NAME>` override). A service token addressed to the service is
   * attached and a stale-token 401 triggers a single retry with a fresh token.
   */
  async fetchService<T = unknown>(service: string, path: string, init: RequestInit = {}, options: ServiceTokenOptions = {}): Promise<APIResponse<T>> {
    const resource = options.resource ?? service;
    const url = `svc://${service}${path.startsWith('/') ? path : `/${path}`}`;
    const method = String(init.method ?? 'GET').toUpperCase();
    this.logger.debug('calling service endpoint', { service, path, method, resource });

    const dispatch = (bearer: string): Promise<APIResponse<T>> => {
      const request =
        method === 'POST'
          ? APIRequest.post(url)
          : method === 'PUT'
            ? APIRequest.put(url)
            : method === 'PATCH'
              ? APIRequest.patch(url)
              : method === 'DELETE'
                ? APIRequest.delete(url)
                : APIRequest.get(url);
      request.header('authorization', `Bearer ${bearer}`).suppressErrors();
      if (this.timeout !== undefined) request.timeout(this.timeout);
      new Headers(init.headers).forEach((value, key) => key !== 'authorization' && request.header(key, value));
      if (init.body != null) request.body(typeof init.body === 'string' ? (JSON.parse(init.body) as object) : (init.body as object));
      return request.execute<T>();
    };

    const response = await dispatch(await this.tokens.getToken({ ...options, resource }));
    if (response.statusCode !== 401) return response;

    this.logger.warn('service call rejected with 401; retrying with a fresh token', { service, path });
    this.tokens.invalidate({ ...options, resource });
    return dispatch(await this.tokens.getToken({ ...options, resource }));
  }

  /**
   * Declaratively replaces this application's role catalog in identity; requires service-account
   * credentials. The manifest is the complete truth — anything absent from it is deleted there — so
   * identity guards against a sync that would delete too much and answers `ROLE_SYNC_REFUSED`. That
   * refusal is deliberately its own error: a truncated manifest must not read as a transport blip.
   */
  async syncRoles(manifest: RoleCatalogManifest, options: RoleCatalogSyncOptions = {}): Promise<RoleCatalogSyncResult> {
    if (!this.config.client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'role sync requires service-account client credentials' });
    const token = await this.identityToken(ROLE_SYNC_SCOPE);
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    const url = `${this.issuer}/api/v1/authz/catalog${options.force ? '?force=true' : ''}`;
    const response = await this.transport(url, { method: 'PUT', headers, body: JSON.stringify(manifest) }).catch((error: Error) =>
      throwError(this.logged(AuthErrorCode.ROLE_SYNC_FAILED.create({ reason: `role sync failed: ${error.message}` }))),
    );
    if (response.status === CONFLICT) throw this.logged(AuthErrorCode.ROLE_SYNC_REFUSED.create({ reason: await this.readFailureReason(response) }));
    if (!response.ok) throw this.logged(AuthErrorCode.ROLE_SYNC_FAILED.create({ reason: `role sync endpoint returned http ${response.status}` }));
    const result = (await response.json()) as RoleCatalogSyncResult;
    this.logger.info('role catalog synced', { permissions: manifest.permissions.length, roles: manifest.roles.length, forced: options.force ?? false });
    return result;
  }

  /**
   * Loads the admin-configured service-access rules for this application from identity and schedules
   * their periodic refresh. Called by `AuthModule` at startup; until the first load succeeds, every
   * service-to-service caller is denied (deny-by-default), so a failure here aborts the boot rather
   * than being swallowed.
   */
  loadServiceAccess(): Promise<ServiceAccessRule[]> {
    if (!this.config.client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service access rules require service-account client credentials' });
    return this.serviceAccess.load();
  }

  /**
   * Re-fetches the rules out of band, as the scheduled refresh does. Never throws — the last good
   * rules stay in force through an identity outage, because the alternative is every service in the
   * fleet revoking every one of its M2M callers the moment identity blinks.
   */
  refreshServiceAccess(): Promise<ServiceAccessRule[]> {
    if (!this.config.client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service access rules require service-account client credentials' });
    return this.serviceAccess.refresh();
  }

  /** Whether an M2M caller may invoke the given route, per the rules loaded from identity */
  isServiceCallerAllowed(callerClientId: string, method: string, path: string): boolean {
    return this.serviceAccess.isAllowed(callerClientId, method, path);
  }

  /** Releases the client's background timers; `AuthModule` calls it when the application shuts down */
  stop(): void {
    this.serviceAccess.stopRefresh();
  }

  /**
   * Explicit fallback for opaque tokens; MUST NOT be used for routine verification. Introspection is
   * now caller-scoped — another client's token reads as `active: false` — so it can no longer be used
   * to probe tokens this application does not own.
   */
  async introspect(token: string): Promise<IntrospectionResult> {
    const endpoint = await this.oauthEndpoint('introspection_endpoint', 'introspect');
    const response = await this.postToOAuthEndpoint(endpoint, { token }, AuthErrorCode.INTROSPECTION_FAILED, 'introspection');
    const result = (await response.json()) as IntrospectionResponse;
    return { active: result.active === true, sub: result.sub, scope: result.scope, aud: result.aud, exp: result.exp, clientId: result.client_id, tokenType: result.token_type };
  }

  /** RFC 7009 revocation; `tokenTypeHint` narrows the lookup when the token's kind is known */
  async revoke(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    const endpoint = await this.oauthEndpoint('revocation_endpoint', 'revoke');
    const body: Record<string, string> = { token };
    if (tokenTypeHint) body.token_type_hint = tokenTypeHint;
    await this.postToOAuthEndpoint(endpoint, body, AuthErrorCode.REVOCATION_FAILED, 'revocation');
    this.logger.info('token revoked', { tokenTypeHint });
  }

  /** Identity's own explanation, when it sent one — a guardrail refusal is only actionable with its reason */
  private async readFailureReason(response: Response): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    return body.message ?? body.code ?? `http ${response.status}`;
  }

  /** Discovery is the source of truth; the issuer-relative path stays only as a last resort for older deployments */
  private async oauthEndpoint(key: 'introspection_endpoint' | 'revocation_endpoint', fallbackPath: string): Promise<string> {
    const document = await this.discovery.get();
    const advertised = document[key];
    if (advertised) return advertised;
    this.logger.warn('discovery advertises no endpoint; falling back to the issuer-relative path', { endpoint: key });
    return `${this.issuer}/oauth2/${fallbackPath}`;
  }

  /** Every `/oauth2/*` grant this client drives: form-encoded, authenticated by secret or SA assertion */
  private async postToOAuthEndpoint(endpoint: string, body: Record<string, string>, errorCode: AuthErrorCode, description: string): Promise<Response> {
    const client = this.config.client;
    if (!isConfidential(client)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: `${description} requires confidential client credentials` });

    const authentication = await buildClientAuthentication(client);
    const headers = { 'content-type': 'application/x-www-form-urlencoded', ...authentication.headers };
    const form = new URLSearchParams({ ...body, ...authentication.body }).toString();
    const response = await this.transport(endpoint, { method: 'POST', headers, body: form }).catch((error: Error) =>
      throwError(this.logged(errorCode.create({ reason: `${description} failed: ${error.message}` }))),
    );
    if (!response.ok) throw this.logged(errorCode.create({ reason: `${description} endpoint returned http ${response.status}: ${await this.readFailureReason(response)}` }));
    return response;
  }

  private identityToken(scope: string): Promise<string> {
    return this.tokens.getToken(this.identityTokenOptions(scope));
  }

  private identityTokenOptions(scope: string): ServiceTokenOptions {
    return { resource: this.config.identityResource ?? DEFAULT_IDENTITY_RESOURCE, scopes: [scope] };
  }

  private expectations(): ClaimExpectations {
    return { issuer: this.issuer, audience: this.config.audience, clockSkewSeconds: this.clockSkewSeconds };
  }

  private toPrincipal(payload: JwtPayload): AuthPrincipal {
    if (typeof payload.sub !== 'string' || !payload.sub) throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'missing sub claim' });
    return {
      kind: payload.token_type === 'service' ? 'service' : 'user',
      sub: payload.sub,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
      clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
      org: typeof payload.org === 'string' ? payload.org : undefined,
      sid: typeof payload.sid === 'string' ? payload.sid : undefined,
      aal: payload.aal === 'AAL2' ? 'AAL2' : payload.aal === 'AAL1' ? 'AAL1' : undefined,
      claims: payload,
    };
  }

  private withBearer(init: RequestInit, token: string): RequestInit {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return { ...init, headers };
  }

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}

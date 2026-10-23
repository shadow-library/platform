import { APIRequest, type APIResponse, AppError, Logger, ServiceDiscovery, throwError } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import {
  AppRegistration,
  AuthClientConfig,
  AuthPrincipal,
  BotPrincipal,
  CheckInput,
  CheckOptions,
  DirectoryUser,
  DiscoveryDocument,
  ExchangedToken,
  FetchLike,
  IntrospectionResult,
  JwtPayload,
  LogoutTokenClaims,
  ResolvedDirectoryUser,
  RoleCatalogManifest,
  RoleCatalogSyncOptions,
  RoleCatalogSyncResult,
  ServiceAccessRule,
  ServicePrincipal,
  ServiceTokenOptions,
  TokenExchangeInput,
  UserInfo,
  UserPrincipal,
} from '../interfaces';
import { AppRegistryClient } from './app-registry';
import { AppSessionClient } from './app-session-client';
import { BotKeyExchanger } from './bot-key-exchanger';
import { buildClientAuthentication, isConfidential } from './client-auth';
import { DiscoveryClient } from './discovery';
import { RemoteJwks } from './jwks';
import { type ClaimExpectations, decodeJwt, verifyJwt } from './jwt';
import { PdpClient } from './pdp-client';
import { assertValidRoleCatalog } from './role-catalog';
import { ServiceAccessClient } from './service-access';
import { ServiceTokenManager } from './token-manager';
import { assertValidTimeout, retryAfterSecondsOf, TOO_MANY_REQUESTS, withTimeout } from './transport';

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

const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_TTL_SECONDS = 43_200;
const DEFAULT_DECISION_TTL_SECONDS = 900;

const DEFAULT_IDENTITY_RESOURCE = 'shadow-identity';

const PDP_SCOPE = 'authz:check';

const ROLE_SYNC_SCOPE = 'authz:roles:sync';

const APP_SESSION_SCOPE = 'app-session:manage';

const DIRECTORY_SCOPE = 'users:resolve';

/** Identity caps a single directory request; larger batches would be silently truncated */
const DIRECTORY_BATCH_SIZE = 50;

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

const CONFLICT = 409;

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const BOT_KEY_TOKEN_TYPE = 'urn:shadow:token-type:bot-key';

const readString = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

const UNAUTHORIZED = 401;

/** A 401 is identity refusing this application's own credential, not the key, so it is an outage from the bot's point of view; a 429 never reaches here */
const isBotKeyRejection = (status: number): boolean => status >= 400 && status < 500 && status !== UNAUTHORIZED;

export class AuthClient {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthClient.name);
  private readonly issuer: string;
  private readonly identityUrl: string;
  private readonly transport: FetchLike;
  private readonly timeout?: number;
  private readonly clockSkewSeconds: number;
  private readonly jwks: RemoteJwks;
  private readonly tokens: ServiceTokenManager;
  private readonly pdp: PdpClient;
  private readonly discovery: DiscoveryClient;
  private readonly serviceAccess: ServiceAccessClient;
  private readonly apps: AppRegistryClient;
  private readonly botKeys: BotKeyExchanger;

  readonly appSessions: AppSessionClient;

  constructor(private readonly config: AuthClientConfig) {
    if (!config.issuer || !URL.canParse(config.issuer)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'issuer must be a valid url' });
    if (config.client && !config.client.id) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'client credentials require an id' });

    // Without an explicit audience or a credential to read the registration, the client could never learn which tokens are addressed to it
    if (!config.audience && !isConfidential(config.client)) {
      throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'either an explicit audience or a credential to resolve the app registration with is required' });
    }
    if ((config.clockSkewSeconds ?? 0) < 0) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'clock skew cannot be negative' });
    if ((config.serviceAccess?.refreshSeconds ?? 1) <= 0) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service access refresh interval must be positive' });
    assertValidTimeout(config.timeout);

    this.issuer = config.issuer.replace(/\/+$/, '');

    // OIDC paths use a bare fetch rather than `APIRequest` (token endpoints mandate form encoding, RFC 6749 §4.1.3), so the `svc://` name is resolved once here instead of
    // per request
    this.identityUrl = config.identityUrl ? ServiceDiscovery.resolve(config.identityUrl).replace(/\/+$/, '') : this.issuer;
    if (!URL.canParse(this.identityUrl)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'identityUrl must resolve to a valid url' });

    this.timeout = config.timeout;
    this.transport = withTimeout(config.fetch ?? ((url, init) => fetch(url, init)), config.timeout);
    this.clockSkewSeconds = config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
    this.discovery = new DiscoveryClient(this.issuer, this.identityUrl, this.transport);
    this.jwks = new RemoteJwks({ discovery: this.discovery, fetchFn: this.transport, ttlSeconds: config.cache?.jwksTtlSeconds ?? DEFAULT_JWKS_TTL_SECONDS });
    this.tokens = new ServiceTokenManager({ discovery: this.discovery, fetchFn: this.transport, client: config.client });
    this.pdp = new PdpClient({
      baseUrl: this.identityUrl,
      fetchFn: this.transport,
      ttlSeconds: config.cache?.decisionTtlSeconds ?? DEFAULT_DECISION_TTL_SECONDS,
      getToken: config.client ? () => this.identityToken(PDP_SCOPE) : undefined,
    });
    this.appSessions = new AppSessionClient({
      baseUrl: this.identityUrl,
      fetchFn: this.transport,
      getToken: () => this.identityToken(APP_SESSION_SCOPE),
      invalidateToken: () => this.tokens.invalidate(this.identityTokenOptions(APP_SESSION_SCOPE)),
      strictScopes: config.strictScopes,
    });
    this.serviceAccess = new ServiceAccessClient({
      baseUrl: this.identityUrl,
      fetchFn: this.transport,
      getToken: () => this.identityToken(PDP_SCOPE),
      refreshSeconds: config.serviceAccess?.refreshSeconds,
    });
    this.apps = new AppRegistryClient({
      baseUrl: this.identityUrl,
      fetchFn: this.transport,
      getToken: () => this.tokens.getToken({ resource: this.identityResource() }),
      appId: config.appId,
      refreshSeconds: config.app?.refreshSeconds,
    });
    this.botKeys = new BotKeyExchanger({ exchange: (botKey, clientIp) => this.exchangeBotKey(botKey, clientIp), verify: token => this.verifyToken(token) });
    this.logger.info('auth client initialised', { issuer: this.issuer, appId: config.appId, audience: config.audience, hasClientCredentials: Boolean(config.client) });
  }

  getAppRegistration(): Promise<AppRegistration> {
    return this.apps.get();
  }

  async getAudience(): Promise<string> {
    return this.config.audience ?? (await this.apps.get()).audience;
  }

  getDiscovery(): Promise<DiscoveryDocument> {
    return this.discovery.get();
  }

  /** A typo would otherwise mint quietly with the scope dropped and surface as a 403 deep in a request, so it is worth one startup round trip */
  async assertScopesSupported(scopes: string[]): Promise<void> {
    if (scopes.length === 0) return;
    const supported = (await this.discovery.get()).scopes_supported;
    if (!supported?.length) return;

    const unknown = scopes.filter(scope => !supported.includes(scope));
    if (unknown.length > 0) throw this.logged(AuthErrorCode.SCOPE_UNSUPPORTED.create({ scopes: unknown.join(', ') }));
    this.logger.debug('configured scopes validated against discovery', { scopes });
  }

  /** A bot token is refused: bots enter only via `resolveBotKey`, where identity checks the IP allowlist and revocation lag is capped at a minute */
  async verify(token: string): Promise<UserPrincipal | ServicePrincipal> {
    const principal = await this.verifyToken(token);
    if (principal.kind === 'bot') throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'a bot token is only accepted through bot key exchange' });
    return principal;
  }

  private async verifyToken(token: string): Promise<AuthPrincipal> {
    if (!token) throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'no token provided' });
    const payload = await verifyJwt(token, kid => this.jwks.getKey(kid), await this.expectations());
    const principal = this.toPrincipal(payload);
    this.logger.debug('token verified', { sub: principal.sub, kind: principal.kind, scopes: principal.scopes });
    return principal;
  }

  /** OIDC Back-Channel Logout 1.0 §2.6: addressed to this client, not this API; the `events` claim and absent `nonce` separate it from an ID token replayed as a logout notice */
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

  resolveBotKey(botKey: string, clientIp?: string): Promise<BotPrincipal> {
    return this.botKeys.resolve(botKey, clientIp);
  }

  /**
   * Identity forces the audience to this client's resource, so a key cannot be replayed into another application; only a credential rejection is `BOT_KEY_INVALID`,
   * everything else is a 503 so a fine key is never negative-cached
   */
  private async exchangeBotKey(botKey: string, clientIp: string | undefined): Promise<string> {
    const endpoint = (await this.discovery.get()).token_endpoint;
    const body: Record<string, string> = { grant_type: TOKEN_EXCHANGE_GRANT_TYPE, subject_token: botKey, subject_token_type: BOT_KEY_TOKEN_TYPE };
    if (clientIp) body.client_ip = clientIp;

    const response = await this.dispatchToOAuthEndpoint(endpoint, body, AuthErrorCode.TOKEN_EXCHANGE_FAILED, 'bot key exchange');
    if (response.status === TOO_MANY_REQUESTS) {
      const retryAfterSeconds = retryAfterSecondsOf(response);
      this.logger.warn('identity throttled the bot key exchange', { retryAfterSeconds });
      throw AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity throttled the bot key exchange', throttled: true, retryAfterSeconds });
    }
    if (isBotKeyRejection(response.status)) throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: `identity refused the key with http ${response.status}` });
    if (!response.ok) throw this.logged(AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: `bot key exchange endpoint returned http ${response.status}` }));

    const payload = (await response.json().catch(() => ({}))) as TokenExchangeResponse;
    if (!payload.access_token) throw this.logged(AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'malformed bot key exchange response' }));
    return payload.access_token;
  }

  /**
   * An unreachable or malformed PDP reads as a deny, but a throttle outlasting its retries throws 503 `PDP_UNAVAILABLE` because the caller may be entitled; `failOpen`
   * permits either
   */
  check(input: CheckInput, options?: CheckOptions): Promise<boolean> {
    return this.pdp.check(input, options);
  }

  checkAll(inputs: CheckInput[], options?: CheckOptions): Promise<boolean[]> {
    return this.pdp.checkAll(inputs, options);
  }

  getServiceToken(options?: ServiceTokenOptions): Promise<string> {
    return this.tokens.getToken(options);
  }

  /**
   * RFC 8693: the only supported way to call another application as the user; forwarding the user's token gives the receiving API a foreign audience,
   * and a header is not a credential.
   * Never cached: it is a per-user credential, and keying it by resource would hand it to the wrong caller when two users' requests overlap.
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

    // Never log the body: it carries the user's live access token
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

  /** Checked client-side so a service called through an exchange learns that from its token rather than from an identity failure it cannot tell from an outage */
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
    if (payload.token_type === 'bot') refuse('a bot token cannot be exchanged');
  }

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

  /** The manifest is the complete truth; identity's guardrail refusal is its own `ROLE_SYNC_REFUSED` so a truncated manifest does not read as a transport blip */
  async syncRoles(manifest: RoleCatalogManifest, options: RoleCatalogSyncOptions = {}): Promise<RoleCatalogSyncResult> {
    if (!this.config.client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'role sync requires service-account client credentials' });
    assertValidRoleCatalog(manifest);
    const token = await this.identityToken(ROLE_SYNC_SCOPE);
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    const url = `${this.identityUrl}/api/v1/authz/catalog${options.force ? '?force=true' : ''}`;
    const response = await this.transport(url, { method: 'PUT', headers, body: JSON.stringify(manifest) }).catch((error: Error) =>
      throwError(this.logged(AuthErrorCode.ROLE_SYNC_FAILED.create({ reason: `role sync failed: ${error.message}` }))),
    );
    if (response.status === CONFLICT) throw this.logged(AuthErrorCode.ROLE_SYNC_REFUSED.create({ reason: await this.readFailureReason(response) }));
    if (!response.ok) throw this.logged(AuthErrorCode.ROLE_SYNC_FAILED.create({ reason: `role sync endpoint returned http ${response.status}` }));
    const result = (await response.json()) as RoleCatalogSyncResult;
    this.logger.info('role catalog synced', { permissions: manifest.permissions.length, roles: manifest.roles.length, forced: options.force ?? false });
    return result;
  }

  /** Until the first load succeeds every M2M caller is denied, so a failure here aborts the boot rather than being swallowed */
  loadServiceAccess(): Promise<ServiceAccessRule[]> {
    if (!this.config.client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service access rules require service-account client credentials' });
    return this.serviceAccess.load();
  }

  /** A failed refresh keeps the last good rules, or every service would revoke all its M2M callers the moment identity blinks */
  refreshServiceAccess(): Promise<ServiceAccessRule[]> {
    if (!this.config.client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service access rules require service-account client credentials' });
    return this.serviceAccess.refresh();
  }

  isServiceCallerAllowed(callerClientId: string, method: string, path: string): boolean {
    return this.serviceAccess.isAllowed(callerClientId, method, path);
  }

  stop(): void {
    this.serviceAccess.stopRefresh();
  }

  /** Fallback for opaque tokens only, never routine verification; identity scopes it to the caller, so another client's token reads as `active: false` */
  async introspect(token: string): Promise<IntrospectionResult> {
    const endpoint = await this.oauthEndpoint('introspection_endpoint', 'introspect');
    const response = await this.postToOAuthEndpoint(endpoint, { token }, AuthErrorCode.INTROSPECTION_FAILED, 'introspection');
    const result = (await response.json()) as IntrospectionResponse;
    return { active: result.active === true, sub: result.sub, scope: result.scope, aud: result.aud, exp: result.exp, clientId: result.client_id, tokenType: result.token_type };
  }

  async revoke(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    const endpoint = await this.oauthEndpoint('revocation_endpoint', 'revoke');
    const body: Record<string, string> = { token };
    if (tokenTypeHint) body.token_type_hint = tokenTypeHint;
    await this.postToOAuthEndpoint(endpoint, body, AuthErrorCode.REVOCATION_FAILED, 'revocation');
    this.logger.info('token revoked', { tokenTypeHint });
  }

  private async readFailureReason(response: Response): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    return body.message ?? body.code ?? `http ${response.status}`;
  }

  /** Discovery is the source of truth; the issuer-relative path is a last resort for older deployments */
  private async oauthEndpoint(key: 'introspection_endpoint' | 'revocation_endpoint', fallbackPath: string): Promise<string> {
    const document = await this.discovery.get();
    const advertised = document[key];
    if (advertised) return advertised;
    this.logger.warn('discovery advertises no endpoint; falling back to the issuer-relative path', { endpoint: key });
    return `${this.issuer}/oauth2/${fallbackPath}`;
  }

  private async postToOAuthEndpoint(endpoint: string, body: Record<string, string>, errorCode: AuthErrorCode, description: string): Promise<Response> {
    const response = await this.dispatchToOAuthEndpoint(endpoint, body, errorCode, description);
    if (!response.ok) throw this.logged(errorCode.create({ reason: `${description} endpoint returned http ${response.status}: ${await this.readFailureReason(response)}` }));
    return response;
  }

  private async dispatchToOAuthEndpoint(endpoint: string, body: Record<string, string>, errorCode: AuthErrorCode, description: string): Promise<Response> {
    const client = this.config.client;
    if (!isConfidential(client)) throw AuthErrorCode.CONFIG_INVALID.create({ reason: `${description} requires confidential client credentials` });

    const authentication = await buildClientAuthentication(client);
    const headers = { 'content-type': 'application/x-www-form-urlencoded', ...authentication.headers };
    const form = new URLSearchParams({ ...body, ...authentication.body }).toString();
    return this.transport(endpoint, { method: 'POST', headers, body: form }).catch((error: Error) =>
      throwError(this.logged(errorCode.create({ reason: `${description} failed: ${error.message}` }))),
    );
  }

  /** Presented with the user's own token, so no machine grant is needed; a session established before `profile` was requested gets `sub` alone */
  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const endpoint = await this.userInfoEndpoint();
    const response = await this.transport(endpoint, { headers: { authorization: `Bearer ${accessToken}` } }).catch((error: Error) =>
      throwError(this.logged(AuthErrorCode.USERINFO_FAILED.create({ reason: `userinfo request failed: ${error.message}` }))),
    );
    if (!response.ok)
      throw this.logged(AuthErrorCode.USERINFO_FAILED.create({ reason: `userinfo endpoint returned http ${response.status}: ${await this.readFailureReason(response)}` }));
    return (await response.json()) as UserInfo;
  }

  /** Unlike userinfo this is a machine call needing the `users:resolve` grant; batched here because identity caps a single request */
  async lookupUsers(userIds: string[]): Promise<DirectoryUser[]> {
    return this.directory<DirectoryUser>('/api/v1/internal/users/lookup', 'userIds', userIds);
  }

  /** An address identity will not name is absent, never an error */
  async resolveUsersByEmail(emails: string[]): Promise<ResolvedDirectoryUser[]> {
    return this.directory<ResolvedDirectoryUser>('/api/v1/internal/users/resolve', 'emails', emails);
  }

  private async directory<T>(path: string, field: 'userIds' | 'emails', values: string[]): Promise<T[]> {
    const found: T[] = [];
    for (let index = 0; index < values.length; index += DIRECTORY_BATCH_SIZE) {
      const batch = values.slice(index, index + DIRECTORY_BATCH_SIZE);
      const response = await this.fetch(
        `${this.identityUrl}${path}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [field]: batch }) },
        this.identityTokenOptions(DIRECTORY_SCOPE),
      );
      if (!response.ok)
        throw this.logged(AuthErrorCode.DIRECTORY_FAILED.create({ reason: `directory endpoint returned http ${response.status}: ${await this.readFailureReason(response)}` }));
      found.push(...(((await response.json()) as { users?: T[] }).users ?? []));
    }
    return found;
  }

  /** Discovery is the source of truth; the issuer-relative path is a last resort for older deployments */
  private async userInfoEndpoint(): Promise<string> {
    const advertised = (await this.discovery.get()).userinfo_endpoint;
    if (advertised) return advertised;

    this.logger.warn('discovery advertises no userinfo endpoint; falling back to the issuer-relative path');
    return `${this.issuer}/oauth2/userinfo`;
  }

  private identityToken(scope: string): Promise<string> {
    return this.tokens.getToken(this.identityTokenOptions(scope));
  }

  private identityTokenOptions(scope: string): ServiceTokenOptions {
    return { resource: this.identityResource(), scopes: [scope] };
  }

  private identityResource(): string {
    return this.config.identityResource ?? DEFAULT_IDENTITY_RESOURCE;
  }

  async getStepUpEndpoint(): Promise<string> {
    const advertised = (await this.discovery.get()).step_up_endpoint;
    if (advertised) return advertised;

    this.logger.warn('discovery advertises no step-up endpoint; falling back to the issuer-relative path');
    return `${this.issuer}/auth/step-up`;
  }

  private async expectations(): Promise<ClaimExpectations> {
    return { issuer: this.issuer, audience: await this.getAudience(), clockSkewSeconds: this.clockSkewSeconds };
  }

  private toPrincipal(payload: JwtPayload): AuthPrincipal {
    const sub = readString(payload.sub);
    if (!sub) throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'missing sub claim' });

    const base = { sub, scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [], clientId: readString(payload.client_id), claims: payload };
    if (payload.token_type === 'bot') return this.toBotPrincipal(payload, base);
    if (payload.token_type === 'service') return { ...base, kind: 'service', org: readString(payload.org) };

    const aal = payload.aal === 'AAL2' ? 'AAL2' : payload.aal === 'AAL1' ? 'AAL1' : undefined;
    return { ...base, kind: 'user', org: readString(payload.org), sid: readString(payload.sid), aal };
  }

  private toBotPrincipal(payload: JwtPayload, base: Omit<BotPrincipal, 'kind' | 'org' | 'botId' | 'keyId' | 'rateLimitPerMinute'>): BotPrincipal {
    const org = readString(payload.org);
    const botId = readString(payload.bot_id);
    const keyId = readString(payload.bot_key_id);
    if (!org || !botId || !keyId) throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'a bot token must carry org, bot_id and bot_key_id' });

    const rateLimitPerMinute = payload.rl;
    if (typeof rateLimitPerMinute !== 'number' || !Number.isSafeInteger(rateLimitPerMinute) || rateLimitPerMinute <= 0) {
      throw AuthErrorCode.TOKEN_INVALID.create({ reason: 'a bot token must carry a positive integer rl' });
    }
    return { ...base, kind: 'bot', org, botId, keyId, rateLimitPerMinute };
  }

  private withBearer(init: RequestInit, token: string): RequestInit {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return { ...init, headers };
  }

  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}

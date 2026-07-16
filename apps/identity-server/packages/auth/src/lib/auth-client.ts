/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import {
  AuthClientConfig,
  AuthPrincipal,
  CheckInput,
  CheckOptions,
  FetchLike,
  IntrospectionResult,
  JwtPayload,
  RoleCatalogManifest,
  RoleCatalogSyncResult,
  ServiceAccessRule,
  ServiceTokenOptions,
} from '../interfaces';
import { DiscoveryClient } from './discovery';
import { RemoteJwks } from './jwks';
import { verifyJwt } from './jwt';
import { PdpClient } from './pdp-client';
import { ServiceDiscovery } from './service-discovery';
import { ServiceTokenManager } from './token-manager';

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

/**
 * The consumer-facing auth client: offline token verification, PDP checks, M2M tokens, role
 * catalog sync, and admin-managed service-access rules. Designed as an injectable class —
 * `AuthModule.forRoot()` registers it under its own class token so application services take it
 * as an ordinary constructor dependency.
 */
export class AuthClient {
  private readonly issuer: string;
  private readonly transport: FetchLike;
  private readonly clockSkewSeconds: number;
  private readonly jwks: RemoteJwks;
  private readonly tokens: ServiceTokenManager;
  private readonly pdp: PdpClient;
  private readonly discovery: DiscoveryClient;
  private readonly services: ServiceDiscovery;
  private serviceAccess: ServiceAccessRule[] | null = null;

  constructor(private readonly config: AuthClientConfig) {
    if (!config.issuer || !URL.canParse(config.issuer)) throw new AuthError('CONFIG_INVALID', 'issuer must be a valid url');
    if (!config.audience) throw new AuthError('CONFIG_INVALID', 'audience is required');
    if (config.client && !config.client.id) throw new AuthError('CONFIG_INVALID', 'client credentials require an id');
    if ((config.clockSkewSeconds ?? 0) < 0) throw new AuthError('CONFIG_INVALID', 'clock skew cannot be negative');

    this.issuer = config.issuer.replace(/\/+$/, '');
    this.transport = config.fetch ?? ((url, init) => fetch(url, init));
    this.clockSkewSeconds = config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
    this.discovery = new DiscoveryClient(this.issuer, this.transport);
    this.services = new ServiceDiscovery();
    this.jwks = new RemoteJwks({ discovery: this.discovery, fetchFn: this.transport, ttlSeconds: config.cache?.jwksTtlSeconds ?? DEFAULT_JWKS_TTL_SECONDS });
    this.tokens = new ServiceTokenManager({ discovery: this.discovery, fetchFn: this.transport, client: config.client });
    this.pdp = new PdpClient({
      issuer: this.issuer,
      fetchFn: this.transport,
      ttlSeconds: config.cache?.decisionTtlSeconds ?? DEFAULT_DECISION_TTL_SECONDS,
      getToken: config.client ? () => this.identityToken(PDP_SCOPE) : undefined,
    });
  }

  /** Verifies a bearer token offline against the issuer's JWKS and returns the resolved principal */
  async verify(token: string): Promise<AuthPrincipal> {
    if (!token) throw new AuthError('TOKEN_INVALID', 'no token provided');
    const payload = await verifyJwt(token, kid => this.jwks.getKey(kid), this.expectations());
    return this.toPrincipal(payload);
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

  /** `fetch` with the service token injected and a single automatic retry on a stale-token 401 */
  async fetch(url: string, init: RequestInit = {}, options: ServiceTokenOptions = {}): Promise<Response> {
    const token = await this.tokens.getToken(options);
    const response = await this.transport(url, this.withBearer(init, token));
    if (response.status !== 401) return response;

    this.tokens.invalidate(options);
    const fresh = await this.tokens.getToken(options);
    return this.transport(url, this.withBearer(init, fresh));
  }

  /** Resolves a service name to its base URL (in-cluster svc DNS by default, env-overridable) */
  resolveService(service: string): string {
    return this.services.resolve(service);
  }

  /** `fetch` against a named service: svc-DNS resolution plus a service token addressed to it */
  fetchService(service: string, path: string, init: RequestInit = {}, options: ServiceTokenOptions = {}): Promise<Response> {
    return this.fetch(this.services.url(service, path), init, { ...options, resource: options.resource ?? service });
  }

  /** Declaratively replaces this application's role catalog in identity; requires service-account credentials */
  async syncRoles(manifest: RoleCatalogManifest): Promise<RoleCatalogSyncResult> {
    if (!this.config.client) throw new AuthError('CONFIG_INVALID', 'role sync requires service-account client credentials');
    const token = await this.identityToken(ROLE_SYNC_SCOPE);
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    const response = await this.transport(`${this.issuer}/api/v1/authz/catalog`, { method: 'PUT', headers, body: JSON.stringify(manifest) }).catch((error: Error) => {
      throw new AuthError('ROLE_SYNC_FAILED', `role sync failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError('ROLE_SYNC_FAILED', `role sync endpoint returned http ${response.status}`);
    return (await response.json()) as RoleCatalogSyncResult;
  }

  /**
   * Loads the admin-configured service-access rules for this application from identity. Called by
   * `AuthModule` at startup; until it succeeds, every service-to-service caller is denied
   * (deny-by-default), so a failure here should abort the boot rather than be swallowed.
   */
  async loadServiceAccess(): Promise<ServiceAccessRule[]> {
    if (!this.config.client) throw new AuthError('CONFIG_INVALID', 'service access rules require service-account client credentials');
    const token = await this.identityToken(PDP_SCOPE);
    const response = await this.transport(`${this.issuer}/api/v1/authz/service-access`, { headers: { authorization: `Bearer ${token}` } }).catch((error: Error) => {
      throw new AuthError('SERVICE_ACCESS_FAILED', `service access fetch failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError('SERVICE_ACCESS_FAILED', `service access endpoint returned http ${response.status}`);

    const body = (await response.json()) as { rules?: ServiceAccessRule[] };
    this.serviceAccess = body.rules ?? [];
    return this.serviceAccess;
  }

  /** Whether an M2M caller may invoke the given route, per the rules loaded from identity */
  isServiceCallerAllowed(callerClientId: string, method: string, path: string): boolean {
    if (!this.serviceAccess) return false;
    return this.serviceAccess.some(rule => rule.callerClientId === callerClientId && this.matchesMethod(rule.method, method) && this.matchesPath(rule.path, path));
  }

  /** Explicit fallback for opaque tokens; MUST NOT be used for routine verification */
  async introspect(token: string): Promise<IntrospectionResult> {
    const client = this.config.client;
    if (!client?.secret) throw new AuthError('CONFIG_INVALID', 'introspection requires confidential client credentials');

    const document = await this.discovery.get();
    const endpoint = document.introspection_endpoint ?? `${this.issuer}/oauth2/introspect`;
    const headers = { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}` };
    const response = await this.transport(endpoint, { method: 'POST', headers, body: JSON.stringify({ token }) }).catch((error: Error) => {
      throw new AuthError('INTROSPECTION_FAILED', `introspection failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError('INTROSPECTION_FAILED', `introspection endpoint returned http ${response.status}`);

    const result = (await response.json()) as IntrospectionResponse;
    return { active: result.active === true, sub: result.sub, scope: result.scope, aud: result.aud, exp: result.exp, clientId: result.client_id, tokenType: result.token_type };
  }

  private identityToken(scope: string): Promise<string> {
    return this.tokens.getToken({ resource: this.config.identityResource ?? DEFAULT_IDENTITY_RESOURCE, scopes: [scope] });
  }

  private matchesMethod(pattern: string, method: string): boolean {
    return pattern === '*' || pattern.toUpperCase() === method.toUpperCase();
  }

  private matchesPath(pattern: string, path: string): boolean {
    if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
    return pattern === path;
  }

  private expectations(): { issuer: string; audience: string; clockSkewSeconds: number } {
    return { issuer: this.issuer, audience: this.config.audience, clockSkewSeconds: this.clockSkewSeconds };
  }

  private toPrincipal(payload: JwtPayload): AuthPrincipal {
    if (typeof payload.sub !== 'string' || !payload.sub) throw new AuthError('TOKEN_INVALID', 'missing sub claim');
    return {
      kind: payload.token_type === 'service' ? 'service' : 'user',
      sub: payload.sub,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
      clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
      org: typeof payload.org === 'string' ? payload.org : undefined,
      sid: typeof payload.sid === 'string' ? payload.sid : undefined,
      aal: typeof payload.aal === 'string' ? payload.aal : undefined,
      claims: payload,
    };
  }

  private withBearer(init: RequestInit, token: string): RequestInit {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return { ...init, headers };
  }
}

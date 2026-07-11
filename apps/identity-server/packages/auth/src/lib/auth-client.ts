/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import { AuthClientConfig, AuthPrincipal, CheckInput, CheckOptions, FetchLike, IntrospectionResult, JwtPayload, ServiceTokenOptions } from '../interfaces';
import { DiscoveryClient } from './discovery';
import { RemoteJwks } from './jwks';
import { verifyJwt } from './jwt';
import { PdpClient } from './pdp-client';
import { ServiceTokenManager } from './token-manager';

/**
 * Defining types
 */

export interface AuthClient {
  /** Verifies a bearer token offline against the issuer's JWKS and returns the resolved principal */
  verify(token: string): Promise<AuthPrincipal>;

  /** Asks the PDP whether the principal may perform the action; deny-by-default on any failure */
  check(input: CheckInput, options?: CheckOptions): Promise<boolean>;

  checkAll(inputs: CheckInput[], options?: CheckOptions): Promise<boolean[]>;

  /** Returns a cached client-credentials token for calling another service */
  getServiceToken(options?: ServiceTokenOptions): Promise<string>;

  /** `fetch` with the service token injected and a single automatic retry on a stale-token 401 */
  fetch(url: string, init?: RequestInit, options?: ServiceTokenOptions): Promise<Response>;

  /** Explicit fallback for opaque tokens; MUST NOT be used for routine verification */
  introspect(token: string): Promise<IntrospectionResult>;
}

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
const DEFAULT_JWKS_TTL_SECONDS = 300;
const DEFAULT_DECISION_TTL_SECONDS = 60;

/** Matches the identity server's default token audience for its own API surface */
const DEFAULT_IDENTITY_RESOURCE = 'shadow-identity';

/** The server's PDP endpoint requires a service token granted this scope */
const PDP_SCOPE = 'authz:check';

class AuthClientImpl implements AuthClient {
  private readonly issuer: string;
  private readonly transport: FetchLike;
  private readonly clockSkewSeconds: number;
  private readonly jwks: RemoteJwks;
  private readonly tokens: ServiceTokenManager;
  private readonly pdp: PdpClient;
  private readonly discovery: DiscoveryClient;

  constructor(private readonly config: AuthClientConfig) {
    this.issuer = config.issuer.replace(/\/+$/, '');
    this.transport = config.fetch ?? ((url, init) => fetch(url, init));
    this.clockSkewSeconds = config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
    this.discovery = new DiscoveryClient(this.issuer, this.transport);
    this.jwks = new RemoteJwks({ discovery: this.discovery, fetchFn: this.transport, ttlSeconds: config.cache?.jwksTtlSeconds ?? DEFAULT_JWKS_TTL_SECONDS });
    this.tokens = new ServiceTokenManager({ discovery: this.discovery, fetchFn: this.transport, client: config.client });
    this.pdp = new PdpClient({
      issuer: this.issuer,
      fetchFn: this.transport,
      ttlSeconds: config.cache?.decisionTtlSeconds ?? DEFAULT_DECISION_TTL_SECONDS,
      getToken: config.client ? () => this.tokens.getToken({ resource: config.identityResource ?? DEFAULT_IDENTITY_RESOURCE, scopes: [PDP_SCOPE] }) : undefined,
    });
  }

  async verify(token: string): Promise<AuthPrincipal> {
    if (!token) throw new AuthError('TOKEN_INVALID', 'no token provided');
    const payload = await verifyJwt(token, kid => this.jwks.getKey(kid), this.expectations());
    return this.toPrincipal(payload);
  }

  check(input: CheckInput, options?: CheckOptions): Promise<boolean> {
    return this.pdp.check(input, options);
  }

  checkAll(inputs: CheckInput[], options?: CheckOptions): Promise<boolean[]> {
    return this.pdp.checkAll(inputs, options);
  }

  getServiceToken(options?: ServiceTokenOptions): Promise<string> {
    return this.tokens.getToken(options);
  }

  async fetch(url: string, init: RequestInit = {}, options: ServiceTokenOptions = {}): Promise<Response> {
    const token = await this.tokens.getToken(options);
    const response = await this.transport(url, this.withBearer(init, token));
    if (response.status !== 401) return response;

    this.tokens.invalidate(options);
    const fresh = await this.tokens.getToken(options);
    return this.transport(url, this.withBearer(init, fresh));
  }

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

export function createAuthClient(config: AuthClientConfig): AuthClient {
  if (!config.issuer || !URL.canParse(config.issuer)) throw new AuthError('CONFIG_INVALID', 'issuer must be a valid url');
  if (!config.audience) throw new AuthError('CONFIG_INVALID', 'audience is required');
  if (config.client && !config.client.id) throw new AuthError('CONFIG_INVALID', 'client credentials require an id');
  if ((config.clockSkewSeconds ?? 0) < 0) throw new AuthError('CONFIG_INVALID', 'clock skew cannot be negative');
  return new AuthClientImpl(config);
}

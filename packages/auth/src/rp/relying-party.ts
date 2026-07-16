/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import { AuthCacheOptions, AuthClientCredential, FetchLike, JwtPayload } from '../interfaces';
import { createPkcePair, randomUrlSafeString } from './pkce';
import { DiscoveryClient } from '../lib/discovery';
import { RemoteJwks } from '../lib/jwks';
import { verifyJwt } from '../lib/jwt';

/**
 * Defining types
 */

export interface RelyingPartyConfig {
  issuer: string;
  client: AuthClientCredential;
  redirectUri: string;
  /** Defaults to `['openid']` */
  scopes?: string[];
  clockSkewSeconds?: number;
  cache?: AuthCacheOptions;
  fetch?: FetchLike;
}

export interface AuthorizationUrlOptions {
  state?: string;
  nonce?: string;
  scopes?: string[];
  resource?: string;
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface CodeExchangeInput {
  code: string;
  codeVerifier: string;
  /** The nonce sent on the authorization request; the ID token is rejected when it does not match */
  nonce?: string;
}

export interface TokenSet {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope?: string;
  idToken?: string;
  refreshToken?: string;
  idTokenClaims?: JwtPayload;
}

interface TokenEndpointResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
}

/**
 * Declaring the constants
 *
 * The protocol core of an OIDC relying party: apps never build authorization URLs, verify PKCE,
 * or parse tokens themselves. Session-cookie management and back-channel logout are deliberately
 * left to the consuming app (see docs/sdk.md).
 */
const DEFAULT_SCOPES = ['openid'];
const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_TTL_SECONDS = 300;

/**
 * Injectable class: `RelyingPartyModule.forRoot()` registers it under its own class token so app
 * services take it as an ordinary constructor dependency.
 */
export class RelyingParty {
  private readonly issuer: string;
  private readonly transport: FetchLike;
  private readonly discovery: DiscoveryClient;
  private readonly jwks: RemoteJwks;

  constructor(private readonly config: RelyingPartyConfig) {
    if (!config.issuer || !URL.canParse(config.issuer)) throw new AuthError('CONFIG_INVALID', 'issuer must be a valid url');
    if (!config.client?.id) throw new AuthError('CONFIG_INVALID', 'client id is required');
    if (!config.redirectUri || !URL.canParse(config.redirectUri)) throw new AuthError('CONFIG_INVALID', 'redirect uri must be a valid url');

    this.issuer = config.issuer.replace(/\/+$/, '');
    this.transport = config.fetch ?? ((url, init) => fetch(url, init));
    this.discovery = new DiscoveryClient(this.issuer, this.transport);
    this.jwks = new RemoteJwks({ discovery: this.discovery, fetchFn: this.transport, ttlSeconds: config.cache?.jwksTtlSeconds ?? DEFAULT_JWKS_TTL_SECONDS });
  }

  /** Builds the `/oauth2/authorize` redirect with PKCE (S256), `state`, and `nonce` */
  async createAuthorizationUrl(options: AuthorizationUrlOptions = {}): Promise<AuthorizationRequest> {
    const document = await this.discovery.get();
    const pkce = await createPkcePair();
    const state = options.state ?? randomUrlSafeString(16);
    const nonce = options.nonce ?? randomUrlSafeString(16);

    const url = new URL(document.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.client.id);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', (options.scopes ?? this.config.scopes ?? DEFAULT_SCOPES).join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (options.resource) url.searchParams.set('resource', options.resource);

    return { url: url.toString(), state, nonce, codeVerifier: pkce.verifier };
  }

  /** Exchanges the callback code, validating the ID token (signature, `iss`/`aud`/`exp`/`nonce`) */
  async exchangeCode(input: CodeExchangeInput): Promise<TokenSet> {
    const body: Record<string, string> = { grant_type: 'authorization_code', code: input.code, redirect_uri: this.config.redirectUri, code_verifier: input.codeVerifier };
    const tokens = await this.requestTokens(body);
    if (tokens.idToken) tokens.idTokenClaims = await this.validateIdToken(tokens.idToken, input.nonce);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    return this.requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async requestTokens(body: Record<string, string>): Promise<TokenSet> {
    const document = await this.discovery.get();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.client.secret) headers.authorization = `Basic ${Buffer.from(`${this.config.client.id}:${this.config.client.secret}`).toString('base64')}`;
    else body.client_id = this.config.client.id;

    const response = await this.transport(document.token_endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).catch((error: Error) => {
      throw new AuthError('EXCHANGE_FAILED', `token request failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError('EXCHANGE_FAILED', `token endpoint returned http ${response.status}`);

    const payload = (await response.json()) as TokenEndpointResponse;
    if (!payload.access_token || typeof payload.expires_in !== 'number') throw new AuthError('EXCHANGE_FAILED', 'malformed token endpoint response');
    return {
      accessToken: payload.access_token,
      tokenType: payload.token_type ?? 'Bearer',
      expiresIn: payload.expires_in,
      scope: payload.scope,
      idToken: payload.id_token,
      refreshToken: payload.refresh_token,
    };
  }

  private validateIdToken(idToken: string, nonce?: string): Promise<JwtPayload> {
    const expectations = { issuer: this.issuer, audience: this.config.client.id, clockSkewSeconds: this.config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS, nonce };
    return verifyJwt(idToken, kid => this.jwks.getKey(kid), expectations);
  }
}

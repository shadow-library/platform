/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Minimal JWK shape; declared locally because the WebCrypto `JsonWebKey` lib type is not loaded */
export interface Jwk {
  kty?: string;
  crv?: string;
  x?: string;
  kid?: string;
  alg?: string;
  use?: string;
  [parameter: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [claim: string]: unknown;
}

export type PrincipalKind = 'user' | 'service';

export interface AuthPrincipal {
  kind: PrincipalKind;
  sub: string;
  scopes: string[];
  clientId?: string;
  org?: string;
  sid?: string;
  aal?: string;
  claims: JwtPayload;
}

/** Transport used for every network call; injectable so consumers can test without sockets */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AuthClientCredential {
  id: string;
  secret?: string;
}

export interface AuthCacheOptions {
  decisionTtlSeconds?: number;
  jwksTtlSeconds?: number;
}

export interface AuthClientConfig {
  /** Issuer base URL of the identity service; discovery is fetched from `{issuer}/.well-known/openid-configuration` */
  issuer: string;

  /** This service's API resource identifier; tokens whose `aud` does not include it are rejected */
  audience: string;

  /** Service-account credentials used for M2M tokens, PDP calls, and introspection */
  client?: AuthClientCredential;

  /** Audience of the SDK's own service token towards the identity service (PDP calls). Defaults to the identity default audience */
  identityResource?: string;

  /** Tolerated clock drift when validating `exp`/`nbf`, in seconds. Defaults to 60 */
  clockSkewSeconds?: number;

  cache?: AuthCacheOptions;

  /** Transport override, primarily for tests; defaults to global fetch */
  fetch?: FetchLike;
}

export interface DiscoveryDocument {
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  authorization_endpoint: string;
  userinfo_endpoint?: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
}

export interface ServiceTokenOptions {
  resource?: string;
  scopes?: string[];
}

export interface CheckPrincipal {
  kind: PrincipalKind;
  sub: string;
  org?: string;
}

export interface CheckInput {
  action: string;
  /** Defaults to the principal's own organisation; the check is denied outright when neither is present */
  organisationId?: string;
  principal: CheckPrincipal;
}

export interface CheckOptions {
  /**
   * Permits the action when the PDP is unreachable instead of failing closed. Explicit opt-in for
   * availability-critical read paths only; a reachable PDP answering DENY is always a DENY.
   */
  failOpen?: boolean;
}

export interface IntrospectionResult {
  active: boolean;
  sub?: string;
  scope?: string;
  aud?: string;
  exp?: number;
  clientId?: string;
  tokenType?: string;
}

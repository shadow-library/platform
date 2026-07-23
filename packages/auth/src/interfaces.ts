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

  /**
   * Path to a projected Kubernetes service-account token. When set, the SDK authenticates to the
   * token endpoint with the file's JWT as an RFC 7523 client assertion instead of a static secret;
   * the file is re-read on every token request because the kubelet rotates it in place.
   */
  assertionPath?: string;
}

export interface AuthCacheOptions {
  decisionTtlSeconds?: number;
  jwksTtlSeconds?: number;
}

/** One permission a service's application defines; the name is unique within the application */
export interface PermissionManifest {
  name: string;
  description?: string;
}

/** One role a service's application defines, carrying a set of its own permission names */
export interface RoleManifest {
  name: string;
  description?: string;
  /** Permission names this role grants; every name MUST also appear in the manifest's `permissions` */
  permissions: string[];
}

/**
 * The full, declarative role catalog a service owns for its application. Pushed to identity via
 * `syncRoles`; anything absent from it is deleted there (cascading into assignments), so it must be
 * the complete set, not a delta.
 */
export interface RoleCatalogManifest {
  permissions: PermissionManifest[];
  roles: RoleManifest[];
}

export interface RoleCatalogSyncResult {
  permissionsUpserted: number;
  permissionsDeleted: number;
  rolesUpserted: number;
  rolesDeleted: number;
  /** Principals whose cached decisions were invalidated because a role under them changed or was removed */
  principalsInvalidated: number;
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

  /**
   * The application's role catalog. When set (and `client` credentials are present), `AuthModule`
   * pushes it to identity on startup so roles are owned in code, not administered by hand.
   */
  roles?: RoleCatalogManifest;

  /**
   * Total time budget in milliseconds applied to every outbound request the client makes. On expiry the
   * request is aborted; transport calls surface their path's failure error (e.g. `DISCOVERY_FAILED`), while
   * `fetchService` surfaces the common package's retryable `API_REQUEST_TIMEOUT`. Unbounded when unset.
   */
  timeout?: number;

  /** Transport override, primarily for tests; defaults to global fetch */
  fetch?: FetchLike;
}

/** One admin-configured allowance: the caller client may invoke routes matching `method` + `path` */
export interface ServiceAccessRule {
  callerClientId: string;
  /** HTTP method the rule covers, or `*` for all methods */
  method: string;
  /** Route path the rule covers; a trailing `*` matches any suffix (e.g. `/api/v1/posts/*`) */
  path: string;
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

  /**
   * Marks the action as high-risk, caching its decision for a much shorter window so a revocation
   * bites in ~60 s instead of the default 15 min. Reserve for sensitive operations (credential or
   * membership changes, destructive admin actions); routine reads should keep the long default.
   */
  highRisk?: boolean;
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

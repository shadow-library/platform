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

/**
 * Authentication assurance level (D-19). `AAL2` is only ever minted from a live step-up grant scoped
 * to one (app session, audience) pair, so it never travels to another service or up to the parent
 * identity session.
 */
export type AssuranceLevel = 'AAL1' | 'AAL2';

export interface AuthPrincipal {
  kind: PrincipalKind;
  sub: string;
  scopes: string[];
  clientId?: string;
  org?: string;
  sid?: string;
  aal?: AssuranceLevel;
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

export interface ServiceAccessOptions {
  /**
   * How often the admin-configured M2M route allowlist is re-fetched, in seconds. Defaults to 300.
   * This interval is the upper bound on how long a revoked caller keeps its access, so shortening it
   * trades identity round trips for revocation latency.
   */
  refreshSeconds?: number;
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

export interface RoleCatalogSyncOptions {
  /**
   * Overrides the server's guardrail against a destructive sync (D-15). Identity refuses a manifest
   * that would delete an unreasonable share of an application's catalog, because that is what a
   * truncated or half-generated manifest looks like. Forcing past it is a deliberate call-site
   * decision — `AuthModule` never passes it on the startup sync.
   */
  force?: boolean;
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

  serviceAccess?: ServiceAccessOptions;

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
  end_session_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
  /** When published, configured scopes are validated against it at startup so a typo fails the boot */
  scopes_supported?: string[];
}

/*!
 * First-party app sessions (D-18/D-19)
 *
 * A first-party application exchanges its authorization code for an opaque session handle and is
 * issued no refresh token: the handle itself is the renewal credential. Every call below is
 * machine-to-machine and authenticated with the application's own M2M token, so possessing a handle
 * grants nothing on its own.
 */

export interface AppSessionCreateInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface AppSession {
  /** Opaque, returned once; belongs in the application's own cookie and nowhere else */
  sessionHandle: string;
  userId: string;
  expiresAt: string;
  scope?: string;
}

export interface AppSessionTokenInput {
  sessionHandle: string;
  /** Always send it: omitted, the token is addressed to the identity service rather than this app's API */
  resource?: string;
  /** Narrows the token; omitted, the session's full consented scope is minted */
  scope?: string;
  /** Mints from the session's live step-up grant; fails with `ELEVATION_REQUIRED` when there is none */
  elevated?: boolean;
}

export interface AppSessionToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope?: string;
  audience?: string;
  aal?: AssuranceLevel;
}

export interface LogoutTokenClaims {
  /** The user whose sessions end; at least one of `sub` and `sid` is always present */
  sub?: string;
  sid?: string;
  claims: JwtPayload;
}

export interface AppSessionElevation {
  /** When the grant for this (app session, audience) pair closes; cached elevated tokens die with it */
  expiresAt: string;
}

export interface ServiceTokenOptions {
  resource?: string;
  scopes?: string[];
}

/*!
 * Token exchange (D-22)
 *
 * The only supported way to call another application *as the user*. Forwarding the user's own token
 * is forbidden — the receiving API would see an audience that is not its own — and asserting the
 * user's identity in a header is forbidden outright: a header is not a credential.
 */

export interface TokenExchangeInput {
  /** The user's access token as presented to this service; it must not itself be a delegated token */
  subjectToken: string;

  /** The API resource the exchanged token is addressed to */
  resource: string;

  /** Narrows the exchange; identity intersects it with what both the user and this application hold */
  scopes?: string[];
}

export interface ExchangedToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;

  /**
   * What identity actually granted. The server narrows silently, so a caller that assumes it received
   * what it asked for will hand its downstream API a token missing the capability it needs.
   */
  scope: string[];

  /** Present when identity echoes the audience the token was addressed to */
  audience?: string;
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

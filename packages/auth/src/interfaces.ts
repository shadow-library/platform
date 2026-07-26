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
  /**
   * Issuer base URL of the identity service. This is an **identity**, not an address: it is the
   * value the discovery document must claim and the audience tokens are addressed to. Unless
   * `identityUrl` is set, it is also where discovery is fetched from.
   */
  issuer: string;

  /**
   * Where this process actually reaches identity, when that differs from the public issuer — in a
   * cluster, the Service: `http://identity-server.identity`. A plain absolute url, because the OIDC
   * paths are dialled with a bare `fetch` and so have no `svc://` resolution available to them.
   *
   * Only back-channel traffic moves: discovery, JWKS, token, introspection, PDP and app-session
   * calls. Browser-facing endpoints stay on the public issuer, because a user redirected to an
   * in-cluster hostname cannot resolve it. The `iss` claim is still validated against `issuer`, so
   * the RFC 8414 guarantee is unaffected — this is the split Keycloak spells `KC_HOSTNAME_BACKCHANNEL`.
   */
  identityUrl?: string;

  /**
   * This application's identifier at identity, and by default the id its credential authenticates
   * with. Everything else about the registration — audience, redirect URIs, granted scopes — is read
   * back from `GET /api/v1/apps/me` rather than restated here.
   */
  appId?: string;

  /**
   * Overrides the derived API resource identifier; tokens whose `aud` does not include it are
   * rejected. Only needed when there is no credential to resolve the registration with, or when a
   * deployment genuinely serves an audience identity does not know about.
   */
  audience?: string;

  /** Service-account credentials used for M2M tokens, PDP calls, and introspection */
  client?: AuthClientCredential;

  app?: AppRegistryOptions;

  /** Audience of the SDK's own service token towards the identity service (PDP calls). Defaults to the identity default audience */
  identityResource?: string;

  /** Tolerated clock drift when validating `exp`/`nbf`, in seconds. Defaults to 60 */
  clockSkewSeconds?: number;

  cache?: AuthCacheOptions;

  serviceAccess?: ServiceAccessOptions;

  /**
   * Turns a silently narrowed mint into a thrown `SCOPE_NOT_GRANTED` instead of a warning. Off by
   * default because a missing scope is usually only fatal to the one route that needs it; turn it on
   * where a partial grant would be worse than no service at all.
   */
  strictScopes?: boolean;

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

  /** Where a browser is sent to satisfy a step-up prompt (D-19); derived rather than configured */
  step_up_endpoint?: string;

  /** Base of the first-party app-session API (D-18); derived rather than configured */
  app_session_endpoint?: string;
}

/*!
 * Derived configuration (D-21)
 *
 * Identity already stores what every consumer used to restate in environment variables: the API
 * resource its tokens are addressed to, the redirect URIs an admin registered, the scopes an admin
 * granted. Reading it back leaves `AUTH_ISSUER` + `AUTH_APP_ID` + a credential as the whole of a
 * steady-state deployment, and — because the registration is refreshed on a TTL — an admin granting
 * a scope takes effect without a redeploy.
 */

export interface AppRegistration {
  /** Identity's own view of which application this credential belongs to */
  appId: string;
  name?: string;

  /** The API resource identifier this application's tokens are addressed to */
  audience: string;

  /** Redirect URIs an admin registered for the browser flow */
  redirectUris: string[];

  /** Scopes an admin has granted this application; the browser flow requests exactly these */
  scopes: string[];

  postLogoutRedirectUris?: string[];
}

export interface AppRegistryOptions {
  /**
   * How often the registration is re-resolved, in seconds. Defaults to 300, which is also the upper
   * bound on how long an admin's grant change takes to reach a running service.
   */
  refreshSeconds?: number;
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

  /**
   * What identity actually granted, parsed from `scope`. Minting answers 200 with whatever survived
   * filtering rather than refusing, so a caller that reads its own request back instead of this hands
   * its API a token missing the capability it asked for.
   */
  grantedScopes: string[];
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

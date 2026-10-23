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

/** `AAL2` is only minted from a live step-up grant scoped to one (app session, audience) pair, so it never travels to another service */
export type AssuranceLevel = 'AAL1' | 'AAL2';

interface PrincipalBase {
  sub: string;
  scopes: string[];
  clientId?: string;
  claims: JwtPayload;
}

export interface UserPrincipal extends PrincipalBase {
  kind: 'user';
  org?: string;
  sid?: string;
  aal?: AssuranceLevel;
}

export interface ServicePrincipal extends PrincipalBase {
  kind: 'service';
  org?: string;
  sid?: undefined;
  aal?: undefined;
}

/** `sub` and `clientId` are the bot's OAuth client id; a bot is refused on every guarded route that does not declare `@BotPermission` */
export interface BotPrincipal extends PrincipalBase {
  kind: 'bot';
  org: string;
  botId: string;
  keyId: string;
  rateLimitPerMinute: number;
  sid?: undefined;
  aal?: undefined;
}

export type AuthPrincipal = UserPrincipal | ServicePrincipal | BotPrincipal;

export type PrincipalKind = AuthPrincipal['kind'];

/** `public` leaves an undecorated route anonymous; `private` requires a session on it and on every `@OptionalAuth()` route */
export type AuthAccessMode = 'public' | 'private';

/** Transport used for every network call; injectable so consumers can test without sockets */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AuthClientCredential {
  id: string;
  secret?: string;

  /** Projected Kubernetes service-account token authenticating as an RFC 7523 client assertion instead of a secret; re-read per request because the kubelet rotates it in place */
  assertionPath?: string;
}

export interface AuthCacheOptions {
  decisionTtlSeconds?: number;
  jwksTtlSeconds?: number;
}

export interface ServiceAccessOptions {
  /** Seconds between M2M route allowlist re-fetches (default 300); the upper bound on how long a revoked caller keeps access */
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
  /** Marks this role as the application's baseline, granted implicitly to every user */
  default?: boolean;

  /** Makes the role grantable to bots; omitted, only people can hold it */
  bot?: BotGrantManifest;
}

/** `write` implies `read`: a write role must carry every permission of the read role on the same resource */
export type BotGrantLevel = 'read' | 'write';

export interface BotGrantManifest {
  /** The resource the grant is presented under to an organisation admin, e.g. `projects` */
  resource: string;
  level: BotGrantLevel;
  /** Flags the grant as sensitive to organisation admins, as for spend-incurring actions such as AI generation */
  sensitive?: boolean;
}

/** Pushed via `syncRoles`; anything absent is deleted at identity (cascading into assignments), so it must be the complete set, not a delta */
export interface RoleCatalogManifest {
  permissions: PermissionManifest[];
  roles: RoleManifest[];
}

export interface RoleCatalogSyncOptions {
  /** Overrides identity's guardrail against manifests that delete an unreasonable share of the catalog; `AuthModule` never passes it on the startup sync */
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
  /** Issuer base URL: the value the discovery document must claim and `iss` is validated against, not necessarily where identity is reached (see `identityUrl`) */
  issuer: string;

  /**
   * Where this process reaches identity when that differs from the public issuer: a `svc://<service>` name or plain address, resolved by `ServiceDiscovery`.
   * Only back-channel calls move; browser-facing endpoints stay on the issuer because users cannot resolve in-cluster hostnames, and `iss` is still validated against `issuer`.
   */
  identityUrl?: string;

  /** This application's identifier at identity; audience, redirect URIs and scopes are read back from `GET /api/v1/apps/me` rather than restated */
  appId?: string;

  /** Overrides the derived API resource identifier; tokens whose `aud` lacks it are rejected */
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

  /** Throws `SCOPE_NOT_GRANTED` instead of warning when a mint is silently narrowed; off by default because a missing scope usually only breaks one route */
  strictScopes?: boolean;

  /** Pushed to identity on startup by `AuthModule` when `client` credentials are present */
  roles?: RoleCatalogManifest;

  /**
   * Per-request time budget in ms (unbounded when unset); transport calls fail with their path's error (e.g. `DISCOVERY_FAILED`), `fetchService` with the retryable
   * `API_REQUEST_TIMEOUT`
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

  /** Where a browser is sent to satisfy a step-up prompt; derived rather than configured */
  step_up_endpoint?: string;

  /** Base of the first-party app-session API; derived rather than configured */
  app_session_endpoint?: string;
}

export interface AppRegistration {
  /** Identity's own view of which application this credential belongs to */
  appId: string;
  name?: string;

  /** The API resource identifier this application's tokens are addressed to */
  audience: string;

  /** Redirect URIs an admin registered for the browser flow */
  redirectUris: string[];

  /** Scopes an admin has granted this application; every browser-flow token asks for these */
  scopes: string[];

  /** `is_sensitive` scopes: consented at login because identity freezes the grant from the authorization code, but released only into elevated mints */
  sensitiveScopes: string[];

  postLogoutRedirectUris?: string[];
}

export interface AppRegistryOptions {
  /** Seconds between registration re-resolves (default 300); the upper bound on how long an admin's grant change takes to reach a running service */
  refreshSeconds?: number;
}

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

/** One organisation an application session may act in; capability is evaluated in whichever is active */
export interface AppSessionOrganisation {
  id: string;
  slug: string;
  name: string;
  type: 'PERSONAL' | 'TEAM';
  /** Whether the session is acting in this organisation right now */
  active: boolean;
}

export interface SwitchedOrganisation {
  /** Switching retires the presented handle, so store this one before doing anything else */
  sessionHandle: string;
  organisationId: string;
  expiresAt: string;
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

  /** What identity actually granted; minting answers 200 with whatever survived filtering, so read this rather than the request */
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

  /** What identity actually granted; the server narrows silently, so read this rather than the request */
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
   * Permits the action when the PDP is unreachable or throttled instead of denying or throwing `PDP_UNAVAILABLE`; a reachable PDP answering DENY is still a DENY.
   * Opt in only on availability-critical read paths
   */
  failOpen?: boolean;

  /**
   * Caches the decision for a much shorter window so a revocation bites in ~60 s instead of the default 15 min.
   * Reserve for sensitive operations (credential or membership changes, destructive admin actions)
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

/** OIDC userinfo claims under the protocol's own names; which ones arrive depends on consented scopes, and a claim with no value is absent rather than empty */
export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}

/** A person named by subject id through identity's directory — the batch answer to "who are these ids". */
export interface DirectoryUser {
  userId: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

/** A subject resolved from an address; an address identity will not name is absent from the answer. */
export interface ResolvedDirectoryUser {
  email: string;
  userId: string;
}

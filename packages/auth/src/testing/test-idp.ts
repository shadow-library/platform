/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AssuranceLevel, Jwk, JwtPayload, PrincipalKind, ServiceAccessRule } from '../interfaces';
import { createTestSigner, TestSigner } from './signer';

/**
 * Defining types
 */

export interface TestIdPOptions {
  /** Overrides the issuer advertised in discovery; defaults to the bound server url */
  issuer?: string;

  /** When set, the token endpoint enforces these client credentials */
  clientId?: string;
  clientSecret?: string;

  accessTokenTtlSeconds?: number;

  /** Published as `scopes_supported`; left unset, discovery omits it and startup scope validation stands down */
  scopesSupported?: string[];

  /** How long an app session lives before its handle stops minting; defaults to an hour */
  appSessionTtlSeconds?: number;
}

export interface TestTokenInput {
  sub: string;
  kind?: PrincipalKind;
  audience?: string | string[];
  scopes?: string[];
  org?: string;
  sid?: string;
  clientId?: string;
  /** May be negative to mint already-expired tokens */
  ttlSeconds?: number;
  claims?: JwtPayload;
}

export interface TestPrincipalRef {
  kind: PrincipalKind;
  sub: string;
}

interface AppSessionRecord {
  userId: string;
  scope: string;
  expiresAt: number;
}

export interface CapturedCatalog {
  manifest: { permissions: unknown[]; roles: unknown[] };
  authorization: string | null;
  /** Whether the caller asked identity to override its destructive-sync guardrail */
  forced: boolean;
}

export interface CapturedTokenRequest {
  body: Record<string, unknown>;
  authorization: string | null;
  contentType: string | null;
}

export interface TestLogoutTokenInput {
  sub?: string;
  sid?: string;
  claims?: JwtPayload;
}

export interface TestIdP {
  issuer: string;

  /** Mints a signed token with sensible claim defaults */
  issueToken(input: TestTokenInput): Promise<string>;

  /** Signs exactly the given claims — no defaults are applied */
  signToken(claims: JwtPayload): Promise<string>;

  /** Registers a single-use authorization code redeemable at the token endpoint */
  createAuthorizationCode(input: TestTokenInput & { nonce?: string }): string;

  grantPermission(principal: TestPrincipalRef, organisationId: string, action: string): void;
  revokePermission(principal: TestPrincipalRef, organisationId: string, action: string): void;
  bumpAuthzVersion(): void;

  /** Replaces the signing key; previous public keys stay published, mirroring real rotation */
  rotateKeys(): Promise<void>;

  /** Makes an endpoint answer http 503 until re-enabled */
  setEndpointFailure(pathname: string, fail: boolean): void;
  getRequestCount(pathname: string): number;

  /** Returns the most recent role-catalog sync the mock received, if any */
  getLastCatalog(): CapturedCatalog | undefined;

  /** Makes the catalog endpoint answer identity's destructive-sync refusal unless the caller forces past it */
  setCatalogGuardrail(refuse: boolean): void;

  /** Scopes a token exchange always drops, so a test can watch the SDK surface a silent narrowing */
  setUnexchangeableScopes(scopes: string[]): void;

  /** Configures the rules the `/api/v1/authz/service-access` endpoint returns */
  setServiceAccess(rules: ServiceAccessRule[]): void;

  /** Returns the most recent token-endpoint request the mock received, if any */
  getLastTokenRequest(): CapturedTokenRequest | undefined;

  /*!
   * First-party app sessions (D-18/D-19)
   */

  /** Marks the user as having satisfied a step-up on the identity domain, so an elevation claim succeeds */
  setSteppedUp(userId: string, steppedUp: boolean): void;

  /** Ends the central identity session: every app session of that user starts answering `AUTH_005` */
  endIdentitySession(userId: string): void;

  /** Signs an OIDC back-channel logout token addressed to the configured client */
  issueLogoutToken(input: TestLogoutTokenInput): Promise<string>;

  /** How many app sessions are live, for asserting that a revocation actually reached identity */
  getAppSessionCount(): number;

  /** Returns the most recent mint request the app-session token endpoint received, if any */
  getLastMintRequest(): Record<string, unknown> | undefined;

  stop(): void;
}

/**
 * Declaring the constants
 */
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 600;
const DEFAULT_APP_SESSION_TTL_SECONDS = 3600;
const DEFAULT_AUDIENCE = 'shadow-identity';

/** How long a claimed step-up grant stays live, mirroring identity's short elevation window */
const ELEVATION_WINDOW_SECONDS = 600;

/** The scope every app-session route demands of its M2M caller */
const APP_SESSION_SCOPE = 'app-session:manage';

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Reads a token's claims without verifying it; the mock signed everything it is ever handed back */
const readClaims = (token: string): JwtPayload | undefined => {
  const segment = token.split('.')[1];
  if (!segment) return undefined;
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString()) as JwtPayload;
  } catch {
    return undefined;
  }
};

/** Identity's catalog keys for the two app-session failures an SDK is expected to branch on */
const sessionInvalid = (): Response => json({ code: 'AUTH_005', message: 'Application session is no longer valid' }, 401);
const elevationRequired = (): Response => json({ code: 'AUTH_006', message: 'Step-up authentication is required' }, 403);

/**
 * Spins an in-process mock identity provider: an ephemeral Ed25519 key, discovery + JWKS + token +
 * PDP endpoints on a random port. Consuming services integration-test their guards against it
 * without a running identity service.
 */
export async function createTestIdP(options: TestIdPOptions = {}): Promise<TestIdP> {
  let signer: TestSigner = await createTestSigner();
  const retiredJwks: (Jwk & { kid: string })[] = [];
  const requestCounts = new Map<string, number>();
  const failingEndpoints = new Set<string>();
  const authorizationCodes = new Map<string, TestTokenInput & { nonce?: string }>();
  const refreshTokens = new Map<string, TestTokenInput>();
  const grants = new Set<string>();
  const appSessions = new Map<string, AppSessionRecord>();
  const elevationGrants = new Map<string, number>();
  const steppedUp = new Set<string>();
  let authzVersion = 1;
  let issuer = '';
  let lastCatalog: CapturedCatalog | undefined;
  let lastTokenRequest: CapturedTokenRequest | undefined;
  let lastMintRequest: Record<string, unknown> | undefined;
  let serviceAccessRules: ServiceAccessRule[] = [];
  let catalogGuardrail = false;
  const unexchangeableScopes = new Set<string>();

  const ttl = options.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const sessionTtl = options.appSessionTtlSeconds ?? DEFAULT_APP_SESSION_TTL_SECONDS;

  const buildClaims = (input: TestTokenInput): JwtPayload => {
    const now = Math.floor(Date.now() / 1000);
    const kind = input.kind ?? 'user';
    const claims: JwtPayload = {
      iss: issuer,
      sub: input.sub,
      aud: input.audience ?? DEFAULT_AUDIENCE,
      iat: now,
      exp: now + (input.ttlSeconds ?? ttl),
      jti: crypto.randomUUID(),
      token_type: kind,
      scope: (input.scopes ?? []).join(' '),
    };
    if (input.clientId) claims.client_id = input.clientId;
    if (input.org) claims.org = input.org;
    if (input.sid) claims.sid = input.sid;
    return { ...claims, ...input.claims };
  };

  const issueToken = (input: TestTokenInput): Promise<string> => signer.sign(buildClaims(input));

  const isClientAuthorized = (request: Request, body: Record<string, unknown>): boolean => {
    if (!options.clientId) return true;
    const header = request.headers.get('authorization');
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString();
      return decoded === `${options.clientId}:${options.clientSecret ?? ''}`;
    }
    /** RFC 7523 client assertions (projected SA tokens) are accepted verbatim; tests inspect them via getLastTokenRequest */
    if (typeof body.client_assertion === 'string' && body.client_assertion.length > 0) return body.client_id === options.clientId;
    return body.client_id === options.clientId && (options.clientSecret === undefined || body.client_secret === options.clientSecret);
  };

  /** Real-world RPs send form-encoded token requests (RFC 6749 §4.1.3); JSON stays accepted for the SDK. */
  const readTokenBody = async (request: Request): Promise<Record<string, unknown>> => {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(await request.text()));
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  };

  const handleToken = async (request: Request): Promise<Response> => {
    const body = await readTokenBody(request);
    lastTokenRequest = { body, authorization: request.headers.get('authorization'), contentType: request.headers.get('content-type') };
    if (!isClientAuthorized(request, body)) return json({ error: 'invalid_client' }, 401);

    if (body.grant_type === 'client_credentials') {
      const clientId = options.clientId ?? (typeof body.client_id === 'string' ? body.client_id : 'test-client');
      const scopes = typeof body.scope === 'string' ? body.scope.split(' ').filter(Boolean) : [];
      const audience = typeof body.resource === 'string' ? body.resource : undefined;
      const accessToken = await issueToken({ sub: clientId, kind: 'service', clientId, scopes, audience });
      return json({ access_token: accessToken, token_type: 'Bearer', expires_in: ttl, scope: scopes.join(' ') });
    }

    if (body.grant_type === 'authorization_code') {
      const code = typeof body.code === 'string' ? body.code : '';
      const stored = authorizationCodes.get(code);
      if (!stored) return json({ error: 'invalid_grant' }, 400);
      authorizationCodes.delete(code);

      const clientId = options.clientId ?? stored.clientId ?? 'test-client';
      const accessToken = await issueToken({ ...stored, clientId });
      const now = Math.floor(Date.now() / 1000);
      /** Extra claims (email, email_verified, …) flow into the ID token so RPs can test claim mapping. */
      const idClaims: JwtPayload = { iss: issuer, sub: stored.sub, aud: clientId, iat: now, exp: now + ttl, auth_time: now, ...stored.claims };
      if (stored.nonce) idClaims.nonce = stored.nonce;
      const idToken = await signer.sign(idClaims);
      const refreshToken = crypto.randomUUID();
      refreshTokens.set(refreshToken, stored);
      return json({ access_token: accessToken, id_token: idToken, token_type: 'Bearer', expires_in: ttl, scope: (stored.scopes ?? []).join(' '), refresh_token: refreshToken });
    }

    /**
     * RFC 8693 (D-22): the exchanged token is addressed to the target resource, acts for the subject,
     * and carries only what the subject and the requesting application both hold. Identity narrows
     * silently — no error, just a smaller `scope` — which is exactly the trap the SDK guards against.
     */
    if (body.grant_type === TOKEN_EXCHANGE_GRANT_TYPE) {
      const subject = readClaims(typeof body.subject_token === 'string' ? body.subject_token : '');
      if (!subject?.sub) return json({ error: 'invalid_grant' }, 400);
      if (subject.act !== undefined) return json({ error: 'invalid_request', message: 'delegation is single-hop' }, 400);

      const held = String(subject.scope ?? '')
        .split(' ')
        .filter(Boolean);
      const requested = typeof body.scope === 'string' && body.scope ? body.scope.split(' ').filter(Boolean) : held;
      const granted = requested.filter(scope => held.includes(scope) && !unexchangeableScopes.has(scope));
      const audience = typeof body.resource === 'string' ? body.resource : DEFAULT_AUDIENCE;
      const actor = options.clientId ?? 'test-client';
      const accessToken = await issueToken({ sub: subject.sub, audience, scopes: granted, claims: { act: { sub: actor } } });
      return json({ access_token: accessToken, token_type: 'Bearer', expires_in: ttl, scope: granted.join(' '), audience });
    }

    if (body.grant_type === 'refresh_token') {
      const presented = typeof body.refresh_token === 'string' ? body.refresh_token : '';
      const stored = refreshTokens.get(presented);
      if (!stored) return json({ error: 'invalid_grant' }, 400);
      refreshTokens.delete(presented);

      const accessToken = await issueToken(stored);
      const rotated = crypto.randomUUID();
      refreshTokens.set(rotated, stored);
      return json({ access_token: accessToken, token_type: 'Bearer', expires_in: ttl, scope: (stored.scopes ?? []).join(' '), refresh_token: rotated });
    }

    return json({ error: 'unsupported_grant_type' }, 400);
  };

  /**
   * Every app-session route is machine-to-machine: possessing a handle grants nothing without the
   * application's own M2M token carrying `app-session:manage`. The mock enforces that so a consuming
   * service can actually test the property rather than take it on trust.
   */
  const isAppSessionCaller = (request: Request): boolean => {
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return false;
    const segment = header.slice(7).split('.')[1];
    if (!segment) return false;
    const claims = JSON.parse(Buffer.from(segment, 'base64url').toString()) as JwtPayload;
    return (
      claims.token_type === 'service' &&
      String(claims.scope ?? '')
        .split(' ')
        .includes(APP_SESSION_SCOPE)
    );
  };

  const liveSession = (handle: unknown): AppSessionRecord | undefined => {
    if (typeof handle !== 'string') return undefined;
    const session = appSessions.get(handle);
    if (session && session.expiresAt > Date.now()) return session;
    appSessions.delete(String(handle));
    return undefined;
  };

  const handleAppSessions = async (request: Request): Promise<Response> => {
    if (!isAppSessionCaller(request)) return json({ code: 'AUTH_002', message: 'Service token missing the app-session:manage scope' }, 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (request.method === 'DELETE') {
      if (typeof body.sessionHandle === 'string') appSessions.delete(body.sessionHandle);
      return json({ success: true });
    }

    const stored = typeof body.code === 'string' ? authorizationCodes.get(body.code) : undefined;
    if (!stored) return json({ code: 'OAU_003', message: 'invalid_grant' }, 400);
    authorizationCodes.delete(String(body.code));

    const handle = crypto.randomUUID();
    const scope = (stored.scopes ?? []).join(' ');
    const expiresAt = Date.now() + sessionTtl * 1000;
    appSessions.set(handle, { userId: stored.sub, scope, expiresAt });
    return json({ sessionHandle: handle, userId: stored.sub, expiresAt: new Date(expiresAt).toISOString(), scope }, 201);
  };

  const handleAppSessionToken = async (request: Request): Promise<Response> => {
    if (!isAppSessionCaller(request)) return json({ code: 'AUTH_002', message: 'Service token missing the app-session:manage scope' }, 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    lastMintRequest = body;

    const session = liveSession(body.sessionHandle);
    if (!session) return sessionInvalid();

    const audience = typeof body.resource === 'string' ? body.resource : DEFAULT_AUDIENCE;
    const elevated = body.elevated === true;
    if (elevated && (elevationGrants.get(`${String(body.sessionHandle)}|${audience}`) ?? 0) <= Date.now()) return elevationRequired();

    const scope = typeof body.scope === 'string' && body.scope ? body.scope : session.scope;
    const aal: AssuranceLevel = elevated ? 'AAL2' : 'AAL1';
    const accessToken = await issueToken({ sub: session.userId, audience, scopes: scope.split(' ').filter(Boolean), claims: { aal } });
    return json({ accessToken, tokenType: 'Bearer', expiresIn: ttl, scope, audience, aal });
  };

  const handleAppSessionElevation = async (request: Request): Promise<Response> => {
    if (!isAppSessionCaller(request)) return json({ code: 'AUTH_002', message: 'Service token missing the app-session:manage scope' }, 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const session = liveSession(body.sessionHandle);
    if (!session) return sessionInvalid();
    if (!steppedUp.has(session.userId)) return elevationRequired();

    /** The step-up is *spent*: the grant covers this session and this audience, and nothing else */
    steppedUp.delete(session.userId);
    const audience = typeof body.resource === 'string' ? body.resource : DEFAULT_AUDIENCE;
    const expiresAt = Date.now() + ELEVATION_WINDOW_SECONDS * 1000;
    elevationGrants.set(`${String(body.sessionHandle)}|${audience}`, expiresAt);
    return json({ expiresAt: new Date(expiresAt).toISOString() });
  };

  const handleAuthzCheck = async (request: Request): Promise<Response> => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind: PrincipalKind = body.principalType === 'SERVICE_ACCOUNT' ? 'service' : 'user';
    const key = `${kind}:${String(body.principalId)}:${String(body.organisationId)}:${String(body.action)}`;
    const decision = grants.has(key) ? 'PERMIT' : 'DENY';
    return json({ decision, reasons: decision === 'DENY' ? ['no matching grant'] : [], authzVersion });
  };

  const handleCatalog = async (request: Request): Promise<Response> => {
    const manifest = (await request.json().catch(() => ({ permissions: [], roles: [] }))) as { permissions?: unknown[]; roles?: unknown[] };
    const permissions = manifest.permissions ?? [];
    const roles = manifest.roles ?? [];
    const forced = new URL(request.url).searchParams.get('force') === 'true';
    lastCatalog = { manifest: { permissions, roles }, authorization: request.headers.get('authorization'), forced };

    /** Identity's D-15 guardrail: a manifest that would delete too much is refused unless forced */
    if (catalogGuardrail && !forced) return json({ code: 'AUTHZ_009', message: 'catalog sync would delete 80% of the application catalog' }, 409);
    return json({ permissionsUpserted: permissions.length, permissionsDeleted: 0, rolesUpserted: roles.length, rolesDeleted: 0, principalsInvalidated: 0 });
  };

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    requestCounts.set(url.pathname, (requestCounts.get(url.pathname) ?? 0) + 1);
    if (failingEndpoints.has(url.pathname)) return new Response('injected failure', { status: 503 });

    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return json({
          issuer,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          token_endpoint: `${issuer}/oauth2/token`,
          authorization_endpoint: `${issuer}/oauth2/authorize`,
          userinfo_endpoint: `${issuer}/oauth2/userinfo`,
          introspection_endpoint: `${issuer}/oauth2/introspect`,
          revocation_endpoint: `${issuer}/oauth2/revoke`,
          end_session_endpoint: `${issuer}/oauth2/logout`,
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'private_key_jwt'],
          ...(options.scopesSupported && { scopes_supported: options.scopesSupported }),
        });
      case '/.well-known/jwks.json':
        return json({ keys: [signer.publicJwk, ...retiredJwks] });
      case '/oauth2/token':
        return handleToken(request);
      case '/api/v1/app-sessions':
        return handleAppSessions(request);
      case '/api/v1/app-sessions/token':
        return handleAppSessionToken(request);
      case '/api/v1/app-sessions/elevation':
        return handleAppSessionElevation(request);
      case '/api/v1/authz/check':
        return handleAuthzCheck(request);
      case '/api/v1/authz/catalog':
        return handleCatalog(request);
      case '/api/v1/authz/service-access':
        return json({ rules: serviceAccessRules });
      default:
        return new Response('not found', { status: 404 });
    }
  };

  const server = Bun.serve({ port: 0, fetch: handle });
  issuer = options.issuer ?? `http://127.0.0.1:${server.port}`;

  const grantKey = (principal: TestPrincipalRef, organisationId: string, action: string): string => `${principal.kind}:${principal.sub}:${organisationId}:${action}`;

  return {
    issuer,
    issueToken,
    signToken: claims => signer.sign(claims),
    createAuthorizationCode: input => {
      const code = crypto.randomUUID();
      authorizationCodes.set(code, input);
      return code;
    },
    grantPermission: (principal, organisationId, action) => void grants.add(grantKey(principal, organisationId, action)),
    revokePermission: (principal, organisationId, action) => void grants.delete(grantKey(principal, organisationId, action)),
    bumpAuthzVersion: () => void (authzVersion += 1),
    rotateKeys: async () => {
      retiredJwks.push(signer.publicJwk);
      signer = await createTestSigner();
    },
    setEndpointFailure: (pathname, fail) => void (fail ? failingEndpoints.add(pathname) : failingEndpoints.delete(pathname)),
    getRequestCount: pathname => requestCounts.get(pathname) ?? 0,
    getLastCatalog: () => lastCatalog,
    setCatalogGuardrail: refuse => void (catalogGuardrail = refuse),
    setUnexchangeableScopes: scopes => {
      unexchangeableScopes.clear();
      for (const scope of scopes) unexchangeableScopes.add(scope);
    },
    setServiceAccess: rules => void (serviceAccessRules = rules),
    getLastTokenRequest: () => lastTokenRequest,
    setSteppedUp: (userId, isSteppedUp) => void (isSteppedUp ? steppedUp.add(userId) : steppedUp.delete(userId)),
    endIdentitySession: userId => {
      for (const [handle, session] of appSessions) {
        if (session.userId !== userId) continue;
        appSessions.delete(handle);
        for (const key of elevationGrants.keys()) if (key.startsWith(`${handle}|`)) elevationGrants.delete(key);
      }
    },
    issueLogoutToken: input => {
      const now = Math.floor(Date.now() / 1000);
      const claims: JwtPayload = {
        iss: issuer,
        aud: options.clientId ?? 'test-client',
        iat: now,
        exp: now + ttl,
        jti: crypto.randomUUID(),
        events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
      };
      if (input.sub) claims.sub = input.sub;
      if (input.sid) claims.sid = input.sid;
      return signer.sign({ ...claims, ...input.claims });
    },
    getAppSessionCount: () => appSessions.size,
    getLastMintRequest: () => lastMintRequest,
    stop: () => void server.stop(true),
  };
}

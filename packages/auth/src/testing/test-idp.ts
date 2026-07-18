/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { Jwk, JwtPayload, PrincipalKind, ServiceAccessRule } from '../interfaces';
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

export interface CapturedCatalog {
  manifest: { permissions: unknown[]; roles: unknown[] };
  authorization: string | null;
}

export interface CapturedTokenRequest {
  body: Record<string, unknown>;
  authorization: string | null;
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

  /** Configures the rules the `/api/v1/authz/service-access` endpoint returns */
  setServiceAccess(rules: ServiceAccessRule[]): void;

  /** Returns the most recent token-endpoint request the mock received, if any */
  getLastTokenRequest(): CapturedTokenRequest | undefined;

  stop(): void;
}

/**
 * Declaring the constants
 */
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 600;
const DEFAULT_AUDIENCE = 'shadow-identity';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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
  let authzVersion = 1;
  let issuer = '';
  let lastCatalog: CapturedCatalog | undefined;
  let lastTokenRequest: CapturedTokenRequest | undefined;
  let serviceAccessRules: ServiceAccessRule[] = [];

  const ttl = options.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS;

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
    lastTokenRequest = { body, authorization: request.headers.get('authorization') };
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
    lastCatalog = { manifest: { permissions, roles }, authorization: request.headers.get('authorization') };
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
        });
      case '/.well-known/jwks.json':
        return json({ keys: [signer.publicJwk, ...retiredJwks] });
      case '/oauth2/token':
        return handleToken(request);
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
    setServiceAccess: rules => void (serviceAccessRules = rules),
    getLastTokenRequest: () => lastTokenRequest,
    stop: () => void server.stop(true),
  };
}

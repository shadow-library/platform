/**
 * Importing npm packages
 */
import { type JsonWebKeyInput, KeyObject, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { IdentityProvider } from '@server/modules/infrastructure/datastore';

import { IdentityProviderService } from './identity-provider.service';

/**
 * Defining types
 */

export interface AuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface UpstreamIdentity {
  subject: string;
  email: string;
}

export class FederationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FederationError';
  }
}

interface JwsHeader {
  alg?: string;
  kid?: string;
}

interface UpstreamJwk {
  kid?: string;
  kty: string;
  [key: string]: unknown;
}

/**
 * Declaring the constants
 *
 * The server-side relying party for inbound federation. Upstream ID tokens verify against the
 * IdP's JWKS with an allow-listed algorithm set (asymmetric only — `none` and HMAC are structurally
 * impossible here) and require `email_verified: true`: an upstream asserting an unverified email
 * must never mint a session for the local account holding that address.
 */
/** ES256 JOSE signatures are raw r||s, so EC keys verify with ieee-p1363 encoding; Ed25519 hashes internally. */
const ALLOWED_ALGORITHMS: Record<string, { digest: string | null }> = {
  RS256: { digest: 'sha256' },
  ES256: { digest: 'sha256' },
  EdDSA: { digest: null },
};
const CLOCK_SKEW_SECONDS = 60;
const FETCH_TIMEOUT_MS = 10_000;
const JWKS_CACHE_TTL_MS = 300_000;

const decodeSegment = (segment: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

@Injectable()
export class UpstreamOidcService {
  private readonly logger = Logger.getLogger(APP_NAME, UpstreamOidcService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly jwksCache = new Map<string, { keys: UpstreamJwk[]; fetchedAt: number }>();

  constructor(private readonly identityProviderService: IdentityProviderService) {}

  get callbackUrl(): string {
    return `${this.issuer}/api/v1/auth/federated/callback`;
  }

  buildAuthorizationUrl(provider: IdentityProvider, request: AuthorizationRequest): string {
    const url = new URL(provider.authorizationEndpoint);
    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.scopes);
    url.searchParams.set('state', request.state);
    url.searchParams.set('nonce', request.nonce);
    url.searchParams.set('code_challenge', request.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /** Redeems the code (form-encoded, client_secret_post) and returns the verified upstream identity. */
  async exchangeAndVerify(provider: IdentityProvider, code: string, codeVerifier: string, nonce: string): Promise<UpstreamIdentity> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl,
      code_verifier: codeVerifier,
      client_id: provider.clientId,
      client_secret: this.identityProviderService.decryptClientSecret(provider),
    });

    let idToken: string;
    try {
      const response = await fetch(provider.tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new FederationError(`token endpoint answered ${response.status}`);
      const payload = (await response.json()) as { id_token?: string };
      if (typeof payload.id_token !== 'string') throw new FederationError('token response carried no id_token');
      idToken = payload.id_token;
    } catch (error) {
      if (error instanceof FederationError) throw error;
      throw new FederationError(`token exchange failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return this.verifyIdToken(provider, idToken, nonce);
  }

  private async verifyIdToken(provider: IdentityProvider, idToken: string, nonce: string): Promise<UpstreamIdentity> {
    const [headerSegment, payloadSegment, signatureSegment] = idToken.split('.');
    if (!headerSegment || !payloadSegment || !signatureSegment) throw new FederationError('malformed id token');

    const header = decodeSegment(headerSegment) as JwsHeader | null;
    const algorithm = header?.alg && ALLOWED_ALGORITHMS[header.alg] ? ALLOWED_ALGORITHMS[header.alg] : undefined;
    if (!header || !algorithm) throw new FederationError(`unsupported id token algorithm '${header?.alg ?? ''}'`);

    const key = await this.resolveKey(provider, header.kid);
    if (!key) throw new FederationError('no matching jwks key');
    const verifyKey = key.asymmetricKeyType === 'ec' ? { key, dsaEncoding: 'ieee-p1363' as const } : key;
    const valid = cryptoVerify(algorithm.digest, Buffer.from(`${headerSegment}.${payloadSegment}`), verifyKey, Buffer.from(signatureSegment, 'base64url'));
    if (!valid) throw new FederationError('id token signature verification failed');

    const claims = decodeSegment(payloadSegment);
    if (!claims) throw new FederationError('malformed id token payload');
    const now = Math.floor(Date.now() / 1000);
    if (claims['iss'] !== provider.issuer) throw new FederationError('issuer mismatch');
    const audience = Array.isArray(claims['aud']) ? claims['aud'] : [claims['aud']];
    if (!audience.includes(provider.clientId)) throw new FederationError('audience mismatch');
    if (typeof claims['exp'] !== 'number' || claims['exp'] <= now - CLOCK_SKEW_SECONDS) throw new FederationError('id token expired');
    if (claims['nonce'] !== nonce) throw new FederationError('nonce mismatch');
    if (typeof claims['sub'] !== 'string' || !claims['sub']) throw new FederationError('missing subject');
    if (typeof claims['email'] !== 'string' || !claims['email'].includes('@')) throw new FederationError('missing email claim');
    if (claims['email_verified'] !== true) throw new FederationError('upstream email is not verified');

    return { subject: claims['sub'], email: claims['email'].toLowerCase() };
  }

  private async resolveKey(provider: IdentityProvider, kid: string | undefined): Promise<KeyObject | null> {
    const jwk = (await this.findJwk(provider, kid, false)) ?? (await this.findJwk(provider, kid, true));
    if (!jwk) return null;
    try {
      return createPublicKey({ key: jwk, format: 'jwk' } as JsonWebKeyInput);
    } catch (error) {
      this.logger.warn('failed to import upstream jwk', { issuer: provider.issuer, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private async findJwk(provider: IdentityProvider, kid: string | undefined, forceRefresh: boolean): Promise<UpstreamJwk | null> {
    const cached = this.jwksCache.get(provider.jwksUri);
    let keys = !forceRefresh && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS ? cached.keys : null;
    if (!keys) {
      try {
        const response = await fetch(provider.jwksUri, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) return null;
        const document = (await response.json()) as { keys?: UpstreamJwk[] };
        keys = Array.isArray(document.keys) ? document.keys : [];
        this.jwksCache.set(provider.jwksUri, { keys, fetchedAt: Date.now() });
      } catch {
        return null;
      }
    }
    const match = kid ? keys.find(key => key.kid === kid) : keys[0];
    return match ?? null;
  }
}

import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type JsonWebKeyInput, KeyObject } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config, Logger, LRUCache } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { IdentityProvider } from '@server/modules/infrastructure/datastore';

import { IdentityProviderService } from './identity-provider.service';

export interface AuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface UpstreamName {
  firstName?: string;
  lastName?: string;
}

export interface UpstreamIdentity {
  subject: string;
  email: string;
  /** Apple only, and only present on the account's first authorization — carry it straight to JIT provisioning. */
  name?: UpstreamName;
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

const ALLOWED_ALGORITHMS: Record<string, { digest: string | null }> = {
  RS256: { digest: 'sha256' },
  ES256: { digest: 'sha256' },
  EdDSA: { digest: null },
};
const CLOCK_SKEW_SECONDS = 60;
const FETCH_TIMEOUT_MS = 10_000;
const JWKS_CACHE_TTL_MS = 300_000;
const JWKS_CACHE_CAPACITY = 32;
const APPLE_TOKEN_AUDIENCE = 'https://appleid.apple.com';
const APPLE_CLIENT_SECRET_TTL_SECONDS = 300;

const decodeSegment = (segment: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

@Injectable()
export class UpstreamOidcService {
  private readonly logger = Logger.getLogger(APP_NAME, UpstreamOidcService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private readonly jwksCache = new LRUCache(JWKS_CACHE_CAPACITY, { ttl: JWKS_CACHE_TTL_MS });

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
    /** Social sign-in is a deliberate act; without this a signed-in browser is bounced straight back with whichever account it happens to hold. Apple has no such param. */
    if (provider.kind !== 'OIDC' && provider.kind !== 'APPLE') url.searchParams.set('prompt', 'select_account');
    /** Apple requires `response_mode=form_post` whenever the requested scope goes beyond bare `openid`, and always POSTs the callback rather than redirecting with a query string. */
    if (provider.kind === 'APPLE') url.searchParams.set('response_mode', 'form_post');
    return url.toString();
  }

  async exchangeAndVerify(provider: IdentityProvider, code: string, codeVerifier: string, nonce: string, appleUser?: string): Promise<UpstreamIdentity> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl,
      code_verifier: codeVerifier,
      client_id: provider.clientId,
      client_secret: provider.kind === 'APPLE' ? this.mintAppleClientSecret(provider) : this.identityProviderService.decryptClientSecret(provider),
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
    return this.verifyIdToken(provider, idToken, nonce, appleUser);
  }

  /**
   * Apple's client secret is not a stored credential: it is an ES256 JWT minted per exchange from the
   * admin-provisioned `.p8` key (held encrypted in `clientSecretCiphertext`, exactly like Google's static
   * secret) and the provider's Developer Team ID / Key ID.
   */
  private mintAppleClientSecret(provider: IdentityProvider): string {
    if (!provider.appleTeamId || !provider.appleKeyId) throw new FederationError('apple provider missing team id or key id');
    const privateKey = createPrivateKey({ key: this.identityProviderService.decryptClientSecret(provider), format: 'pem' });
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: provider.appleKeyId };
    const payload = { iss: provider.appleTeamId, iat: now, exp: now + APPLE_CLIENT_SECRET_TTL_SECONDS, aud: APPLE_TOKEN_AUDIENCE, sub: provider.clientId };
    const signingInput = `${base64url(header)}.${base64url(payload)}`;
    const signature = cryptoSign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return `${signingInput}.${signature.toString('base64url')}`;
  }

  private resolveName(provider: IdentityProvider, appleUser: string | undefined): UpstreamName | undefined {
    if (provider.kind !== 'APPLE' || !appleUser) return undefined;
    try {
      const parsed = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } };
      if (!parsed.name) return undefined;
      return { firstName: parsed.name.firstName, lastName: parsed.name.lastName };
    } catch {
      return undefined;
    }
  }

  private async verifyIdToken(provider: IdentityProvider, idToken: string, nonce: string, appleUser?: string): Promise<UpstreamIdentity> {
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

    return { subject: claims['sub'], email: this.resolveEmail(provider, claims), name: this.resolveName(provider, appleUser) };
  }

  /**
   * Entra ID emits neither `email_verified` nor, for many account types, `email` — the address travels as
   * `preferred_username`. Trusting it is sound only because a Microsoft provider is pinned to one tenant's
   * issuer at registration time, so the tenant that signed the token also owns the mail namespace it
   * asserts. Every other upstream must still prove the address is verified.
   */
  private resolveEmail(provider: IdentityProvider, claims: Record<string, unknown>): string {
    const candidate = typeof claims['email'] === 'string' && claims['email'].includes('@') ? claims['email'] : undefined;
    if (provider.kind === 'MICROSOFT') {
      const fallback = typeof claims['preferred_username'] === 'string' && claims['preferred_username'].includes('@') ? claims['preferred_username'] : undefined;
      const email = candidate ?? fallback;
      if (!email) throw new FederationError('token carried no email or preferred_username claim');
      return email.toLowerCase();
    }

    if (!candidate) throw new FederationError('missing email claim');
    /** Apple has historically sent `email_verified` as the string `"true"`/`"false"` rather than a boolean. */
    const verified = provider.kind === 'APPLE' ? claims['email_verified'] === true || claims['email_verified'] === 'true' : claims['email_verified'] === true;
    if (!verified) throw new FederationError('upstream email is not verified');
    return candidate.toLowerCase();
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
    let keys = forceRefresh ? null : (this.jwksCache.get<UpstreamJwk[]>(provider.jwksUri) ?? null);
    if (!keys) {
      try {
        const response = await fetch(provider.jwksUri, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) return null;
        const document = (await response.json()) as { keys?: UpstreamJwk[] };
        keys = Array.isArray(document.keys) ? document.keys : [];
        this.jwksCache.set(provider.jwksUri, keys);
      } catch {
        return null;
      }
    }
    const match = kid ? keys.find(key => key.kid === kid) : keys[0];
    return match ?? null;
  }
}

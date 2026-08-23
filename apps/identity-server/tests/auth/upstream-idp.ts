import { createSign, generateKeyPairSync, KeyObject } from 'node:crypto';

/**
 * A stand-in for Google or Entra ID. `IdentityProviderService.discover` and `UpstreamOidcService` both
 * reach the upstream through bare `fetch`, so intercepting it exercises discovery, JWKS resolution, the
 * code exchange and id-token verification without a network.
 */
export interface UpstreamIdPOptions {
  issuer: string;
  clientId: string;
}

export interface UpstreamIdP {
  issuer: string;
  clientId: string;
  subject: string;
  email: string;
  /** Replaces the identity claims the token endpoint mints; `iss`/`aud`/`iat`/`exp`/`nonce` are always supplied. */
  setClaims(claims: Record<string, unknown>): void;
  /** The nonce the flow generated, lifted out of the authorization url the start endpoint returned. */
  useNonceFrom(authorizationUrl: string): void;
  /** The form body identity-server posted to the fake token endpoint on the most recent exchange — lets a test inspect the `client_secret` it minted. */
  getLastTokenRequestBody(): Record<string, string> | undefined;
  restore(): void;
}

const base64url = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

const sign = (privateKey: KeyObject, header: object, payload: object): string => {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('sha256').update(signingInput).end().sign(privateKey);
  return `${signingInput}.${base64url(signature)}`;
};

export function installUpstreamIdP(options: UpstreamIdPOptions): UpstreamIdP {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'upstream-test-key';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const issuer = options.issuer.replace(/\/$/, '');
  const subject = 'upstream-subject-1';
  const email = 'upstream@example.com';

  let claims: Record<string, unknown> = { sub: subject, email, email_verified: true };
  let nonce = '';
  let lastTokenRequestBody: Record<string, string> | undefined;

  const originalFetch = globalThis.fetch;
  const respond = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === `${issuer}/.well-known/openid-configuration`) {
      return respond({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
    }
    if (url === `${issuer}/jwks`) return respond({ keys: [jwk] });
    if (url === `${issuer}/token`) {
      lastTokenRequestBody = Object.fromEntries(new URLSearchParams(typeof init?.body === 'string' ? init.body : ''));
      const now = Math.floor(Date.now() / 1000);
      const payload = { iss: issuer, aud: options.clientId, iat: now, exp: now + 300, nonce, ...claims };
      return respond({ id_token: sign(privateKey, { alg: 'RS256', kid, typ: 'JWT' }, payload) });
    }
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;

  return {
    issuer,
    clientId: options.clientId,
    subject,
    email,
    setClaims: next => void (claims = next),
    useNonceFrom: authorizationUrl => void (nonce = new URL(authorizationUrl).searchParams.get('nonce') ?? ''),
    getLastTokenRequestBody: () => lastTokenRequestBody,
    restore: () => void (globalThis.fetch = originalFetch),
  };
}

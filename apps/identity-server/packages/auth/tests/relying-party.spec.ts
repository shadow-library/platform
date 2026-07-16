/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { AuthError } from '@shadow-library/auth';
import { RelyingParty, createPkcePair } from '@shadow-library/auth/rp';
import { TestIdP, createTestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const CLIENT_ID = 'web-app';
const CLIENT_SECRET = 'web-secret';
const REDIRECT_URI = 'https://app.test/auth/callback';

describe('pkce', () => {
  it('should derive the s256 challenge from the verifier', async () => {
    const pair = await createPkcePair();
    expect(pair.challenge).toBe(createHash('sha256').update(pair.verifier).digest('base64url'));
    expect(pair.verifier).not.toBe((await createPkcePair()).verifier);
  });
});

describe('RelyingParty constructor', () => {
  it('should reject invalid configuration outright', () => {
    expect(() => new RelyingParty({ issuer: 'nope', client: { id: CLIENT_ID }, redirectUri: REDIRECT_URI })).toThrow(AuthError);
    expect(() => new RelyingParty({ issuer: 'https://identity.test', client: { id: '' }, redirectUri: REDIRECT_URI })).toThrow(AuthError);
    expect(() => new RelyingParty({ issuer: 'https://identity.test', client: { id: CLIENT_ID }, redirectUri: 'nope' })).toThrow(AuthError);
  });
});

describe('RelyingParty', () => {
  let idp: TestIdP;
  let rp: RelyingParty;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    rp = new RelyingParty({ issuer: idp.issuer, client: { id: CLIENT_ID, secret: CLIENT_SECRET }, redirectUri: REDIRECT_URI });
  });
  afterAll(() => idp.stop());

  it('should build a complete authorization url with pkce, state, and nonce', async () => {
    const request = await rp.createAuthorizationUrl({ scopes: ['openid', 'profile'], resource: 'api://pulse' });
    const url = new URL(request.url);
    expect(url.pathname).toBe('/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('scope')).toBe('openid profile');
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(url.searchParams.get('nonce')).toBe(request.nonce);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(request.codeVerifier).digest('base64url'));
    expect(url.searchParams.get('resource')).toBe('api://pulse');
  });

  it('should exchange a code and validate the id token nonce', async () => {
    const request = await rp.createAuthorizationUrl();
    const code = idp.createAuthorizationCode({ sub: '42', nonce: request.nonce, scopes: ['openid'] });
    const tokens = await rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce });
    expect(tokens.accessToken).toBeString();
    expect(tokens.idTokenClaims).toMatchObject({ sub: '42', aud: CLIENT_ID, nonce: request.nonce });
  });

  it('should reject an id token whose nonce does not match', async () => {
    const request = await rp.createAuthorizationUrl();
    const code = idp.createAuthorizationCode({ sub: '42', nonce: 'stolen-nonce' });
    await expect(rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce })).rejects.toMatchObject({ code: 'NONCE_MISMATCH' });
  });

  it('should surface a failed exchange', async () => {
    await expect(rp.exchangeCode({ code: 'unknown-code', codeVerifier: 'v' })).rejects.toMatchObject({ code: 'EXCHANGE_FAILED' });
  });

  it('should refresh tokens through the token endpoint', async () => {
    const request = await rp.createAuthorizationUrl();
    const code = idp.createAuthorizationCode({ sub: '42', nonce: request.nonce });
    const tokens = await rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce });
    if (!tokens.refreshToken) throw new Error('expected a refresh token');
    const refreshed = await rp.refresh(tokens.refreshToken);
    expect(refreshed.accessToken).toBeString();
  });
});

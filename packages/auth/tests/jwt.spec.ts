/**
 * Importing npm packages
 */
import { beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AuthErrorCode, ClaimExpectations, decodeJwt, JwtPayload, verifyJwt } from '@shadow-library/auth';
import { createTestSigner, TestSigner } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const ISSUER = 'https://identity.test';
const AUDIENCE = 'api://self';

describe('jwt verification', () => {
  let signer: TestSigner;
  let getKey: (kid: string) => Promise<CryptoKey>;

  const expectations: ClaimExpectations = { issuer: ISSUER, audience: AUDIENCE, clockSkewSeconds: 60 };
  const claims = (overrides: JwtPayload = {}): JwtPayload => {
    const now = Math.floor(Date.now() / 1000);
    return { iss: ISSUER, sub: '42', aud: AUDIENCE, iat: now, exp: now + 600, ...overrides };
  };

  beforeAll(async () => {
    signer = await createTestSigner();
    getKey = async (kid: string) => {
      if (kid !== signer.kid) throw AuthErrorCode.KEY_UNKNOWN.create();
      return crypto.subtle.importKey('jwk', signer.publicJwk, 'Ed25519', false, ['verify']);
    };
  });

  const expectCode = async (token: string, code: string, options = expectations) => {
    const error = await verifyJwt(token, getKey, options).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  };

  it('should verify a valid token and return its claims', async () => {
    const payload = await verifyJwt(await signer.sign(claims({ scope: 'posts:read' })), getKey, expectations);
    expect(payload).toMatchObject({ iss: ISSUER, sub: '42', aud: AUDIENCE, scope: 'posts:read' });
  });

  it('should reject a malformed token', async () => {
    await expectCode('not-a-jwt', 'TOKEN_INVALID');
    await expectCode('a.b', 'TOKEN_INVALID');
    await expectCode('!!.!!.!!', 'TOKEN_INVALID');
  });

  it('should reject any algorithm other than eddsa', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: signer.kid })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims())).toString('base64url');
    await expectCode(`${header}.${body}.`, 'TOKEN_INVALID');
    await expectCode(`${header}.${body}.AAAA`, 'ALG_REJECTED');
  });

  it('should reject a tampered payload', async () => {
    const token = await signer.sign(claims());
    const [head, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify(claims({ sub: 'attacker' }))).toString('base64url');
    await expectCode(`${head}.${forged}.${signature}`, 'TOKEN_INVALID');
  });

  it('should reject an expired token but tolerate clock skew', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expectCode(await signer.sign(claims({ exp: now - 120 })), 'TOKEN_EXPIRED');
    const payload = await verifyJwt(await signer.sign(claims({ exp: now - 30 })), getKey, expectations);
    expect(payload.sub).toBe('42');
  });

  it('should reject a token without an exp claim', async () => {
    await expectCode(await signer.sign(claims({ exp: undefined })), 'TOKEN_INVALID');
  });

  it('should reject a token that is not yet valid beyond the skew', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expectCode(await signer.sign(claims({ nbf: now + 300 })), 'TOKEN_INVALID');
    const payload = await verifyJwt(await signer.sign(claims({ nbf: now + 30 })), getKey, expectations);
    expect(payload.sub).toBe('42');
  });

  it('should reject issuer and audience mismatches', async () => {
    await expectCode(await signer.sign(claims({ iss: 'https://evil.test' })), 'ISSUER_MISMATCH');
    await expectCode(await signer.sign(claims({ aud: 'api://other' })), 'AUDIENCE_MISMATCH');
  });

  it('should accept an audience list containing the expected audience', async () => {
    const payload = await verifyJwt(await signer.sign(claims({ aud: ['api://other', AUDIENCE] })), getKey, expectations);
    expect(payload.sub).toBe('42');
  });

  it('should enforce the expected nonce when provided', async () => {
    const token = await signer.sign(claims({ nonce: 'n1' }));
    const payload = await verifyJwt(token, getKey, { ...expectations, nonce: 'n1' });
    expect(payload.nonce).toBe('n1');
    await expectCode(token, 'NONCE_MISMATCH', { ...expectations, nonce: 'n2' });
  });

  it('should reject a token signed by an unknown key', async () => {
    const stranger = await createTestSigner();
    await expectCode(await stranger.sign(claims()), 'KEY_UNKNOWN');
  });

  it('should decode header and payload without verifying', async () => {
    const decoded = decodeJwt(await signer.sign(claims()));
    expect(decoded.header).toMatchObject({ alg: 'EdDSA', kid: signer.kid });
    expect(decoded.payload.sub).toBe('42');
  });
});

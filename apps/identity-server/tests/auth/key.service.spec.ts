/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { EnvKeyProvider, KeyService } from '@server/modules/auth/keys';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('keys').init();
const keyService = () => env.getService(KeyService);

describe('KeyService', () => {
  it('should have generated an active signing key on boot', () => {
    expect(keyService().getActiveKid()).not.toBeNull();
    expect(keyService().getJwks().keys).toHaveLength(1);
    expect(keyService().getJwks().keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519', use: 'sig', alg: 'EdDSA' });
  });

  it('should sign and verify a token round-trip', () => {
    const { token, kid } = keyService().sign({ sub: 'usr_1', scope: 'openid' });
    expect(kid).toBe(keyService().getActiveKid());
    expect(keyService().verify(token)).toMatchObject({ sub: 'usr_1', scope: 'openid' });
  });

  it('should reject a tampered token', () => {
    const { token } = keyService().sign({ sub: 'usr_1' });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'usr_admin' })).toString('base64url');
    expect(keyService().verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it('should reject a token whose header advertises a non-EdDSA algorithm', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: keyService().getActiveKid() })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'usr_1' })).toString('base64url');
    expect(keyService().verify(`${header}.${payload}.`)).toBeNull();
  });

  it('should keep verifying prior tokens across a rotation', async () => {
    const previous = keyService().sign({ sub: 'usr_before_rotation' });
    const previousKid = keyService().getActiveKid();

    const newKid = await keyService().rotate();

    expect(newKid).not.toBe(previousKid);
    expect(keyService().getActiveKid()).toBe(newKid);
    expect(keyService().getJwks().keys).toHaveLength(2);
    expect(keyService().verify(previous.token)).toMatchObject({ sub: 'usr_before_rotation' });

    const after = keyService().sign({ sub: 'usr_after_rotation' });
    expect(after.kid).toBe(newKid);
  });

  it('should stop publishing and verifying a key once it is retired', async () => {
    const previous = keyService().sign({ sub: 'usr_x' });
    await keyService().rotate();
    const retiredCount = await keyService().retireExpiredKeys(new Date(Date.now() + 1000));

    expect(retiredCount).toBe(1);
    expect(keyService().getJwks().keys).toHaveLength(1);
    expect(keyService().verify(previous.token)).toBeNull();
  });

  it('should envelope-encrypt and recover a secret', () => {
    const provider = new EnvKeyProvider();
    const secret = Buffer.from('super-secret-private-key-material');
    const encrypted = provider.encrypt(secret);
    expect(encrypted.ciphertext).not.toContain('super-secret');
    expect(provider.decrypt(encrypted).toString()).toBe(secret.toString());
  });

  it('should serve the public JWKS over HTTP without private material', async () => {
    const response = await env.getRouter().mockRequest().get('/.well-known/jwks.json');
    expect(response.statusCode).toBe(200);
    const body = response.json() as { keys: Record<string, string>[] };
    expect(body.keys.length).toBeGreaterThanOrEqual(1);
    expect(body.keys[0]).toHaveProperty('x');
    expect(JSON.stringify(body)).not.toContain('private');
  });
});

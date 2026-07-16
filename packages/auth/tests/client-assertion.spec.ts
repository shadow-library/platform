/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { TestIdP, createTestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const CLIENT_ID = 'svc-pulse';
const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

describe('service-account client assertion', () => {
  let idp: TestIdP;
  let tokenPath: string;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT_ID, clientSecret: 's3cr3t' });
    tokenPath = path.join(mkdtempSync(path.join(tmpdir(), 'sa-token-')), 'token');
    writeFileSync(tokenPath, 'projected-sa-token\n');
  });
  afterAll(() => idp.stop());

  it('should authenticate with the projected token as a jwt-bearer client assertion instead of a secret', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: CLIENT_ID, assertionPath: tokenPath } });
    const token = await auth.getServiceToken({ scopes: ['posts:read'] });
    expect(token.split('.')).toHaveLength(3);

    const sent = idp.getLastTokenRequest();
    expect(sent?.authorization).toBeNull();
    expect(sent?.body).toMatchObject({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_assertion_type: ASSERTION_TYPE, client_assertion: 'projected-sa-token' });
  });

  it('should re-read the token file on every uncached request, following kubelet rotation', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: CLIENT_ID, assertionPath: tokenPath } });
    await auth.getServiceToken({ scopes: ['a'] });
    writeFileSync(tokenPath, 'rotated-sa-token');
    await auth.getServiceToken({ scopes: ['b'] });
    expect(idp.getLastTokenRequest()?.body.client_assertion).toBe('rotated-sa-token');
  });

  it('should surface a missing token file as TOKEN_REQUEST_FAILED', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: CLIENT_ID, assertionPath: '/does/not/exist' } });
    await expect(auth.getServiceToken()).rejects.toMatchObject({ code: 'TOKEN_REQUEST_FAILED' });
  });
});

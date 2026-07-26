/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The mock advertises a public issuer it is not reachable at, which is the in-cluster shape: identity
 * claims `https://identity.<domain>` while a pod can only dial the Service.
 */
const PUBLIC_ISSUER = 'https://identity.shadow-apps.test';
const AUDIENCE = 'api://pulse';

describe('AuthClient identityUrl (back-channel split)', () => {
  let idp: TestIdP;

  beforeAll(async () => {
    idp = await createTestIdP({ issuer: PUBLIC_ISSUER });
  });
  afterAll(() => idp.stop());

  it('should fetch discovery from identityUrl while the document still claims the public issuer', async () => {
    const auth = new AuthClient({ issuer: PUBLIC_ISSUER, identityUrl: idp.url, audience: AUDIENCE });
    const document = await auth.getDiscovery();
    expect(document.issuer).toBe(PUBLIC_ISSUER);
  });

  it('should rebase back-channel endpoints onto identityUrl', async () => {
    const auth = new AuthClient({ issuer: PUBLIC_ISSUER, identityUrl: idp.url, audience: AUDIENCE });
    const document = await auth.getDiscovery();

    expect(document.jwks_uri).toBe(`${idp.url}/.well-known/jwks.json`);
    expect(document.token_endpoint).toBe(`${idp.url}/oauth2/token`);
    expect(document.introspection_endpoint).toBe(`${idp.url}/oauth2/introspect`);
    expect(document.app_session_endpoint).toBe(`${idp.url}/api/v1/app-sessions`);
  });

  /**
   * The one that matters. A browser redirected to a cluster-internal host cannot resolve it, so
   * rebasing a front-channel endpoint breaks login while every back-channel call keeps working —
   * a failure that looks nothing like its cause.
   */
  it('should leave browser-facing endpoints on the public issuer', async () => {
    const auth = new AuthClient({ issuer: PUBLIC_ISSUER, identityUrl: idp.url, audience: AUDIENCE });
    const document = await auth.getDiscovery();

    expect(document.authorization_endpoint).toBe(`${PUBLIC_ISSUER}/oauth2/authorize`);
    expect(document.end_session_endpoint).toBe(`${PUBLIC_ISSUER}/oauth2/logout`);
    expect(document.step_up_endpoint).toBe(`${PUBLIC_ISSUER}/auth/step-up`);
  });

  it('should verify a token minted by the issuer it cannot address directly', async () => {
    const auth = new AuthClient({ issuer: PUBLIC_ISSUER, identityUrl: idp.url, audience: AUDIENCE });
    const token = await idp.issueToken({ sub: 'user-1', audience: AUDIENCE });

    const principal = await auth.verify(token);
    expect(principal.sub).toBe('user-1');
  });

  it('should resolve a svc:// identityUrl through the SERVICE_URL override', async () => {
    process.env['SERVICE_URL_IDENTITY_SERVER'] = idp.url;
    try {
      const auth = new AuthClient({ issuer: PUBLIC_ISSUER, identityUrl: 'svc://identity-server', audience: AUDIENCE });
      const document = await auth.getDiscovery();
      expect(document.jwks_uri).toBe(`${idp.url}/.well-known/jwks.json`);
    } finally {
      delete process.env['SERVICE_URL_IDENTITY_SERVER'];
    }
  });

  it('should leave every endpoint untouched when identityUrl is not set', async () => {
    const direct = await createTestIdP();
    try {
      const auth = new AuthClient({ issuer: direct.issuer, audience: AUDIENCE });
      const document = await auth.getDiscovery();
      expect(document.jwks_uri).toBe(`${direct.issuer}/.well-known/jwks.json`);
      expect(document.authorization_endpoint).toBe(`${direct.issuer}/oauth2/authorize`);
    } finally {
      direct.stop();
    }
  });
});

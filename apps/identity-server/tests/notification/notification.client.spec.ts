/**
 * Importing npm packages
 */
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { schema } from '@server/modules/infrastructure/datastore';
import { NotificationClient, NotificationTokenService, SendNotification } from '@server/modules/infrastructure/notification';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

interface CapturedRequest {
  authorization: string | null;
  body: Record<string, unknown>;
}

/**
 * Declaring the constants
 *
 * A fake pulse-server is stood up before the app boots and `notification.base-url` is pointed at
 * it, so dispatches run through the real client/transport and every Authorization header is
 * captured for claim assertions.
 */
let responseStatus = 202;
const captured: CapturedRequest[] = [];
const fakePulse = Bun.serve({
  port: 0,
  fetch: async request => {
    captured.push({ authorization: request.headers.get('authorization'), body: (await request.json()) as Record<string, unknown> });
    return Response.json({ id: 'ntf-test' }, { status: responseStatus });
  },
});
Config['cache'].set('notification.base-url', `http://localhost:${fakePulse.port}/api/v1`);

const env = new TestEnvironment('notification_client').init();
afterAll(() => fakePulse.stop(true));

const notification: SendNotification = { templateKey: 'email.otp', recipients: { email: 'jane@example.com' } };
const decodeClaims = (token: string): Record<string, unknown> => JSON.parse(Buffer.from(token.split('.')[1] as string, 'base64url').toString()) as Record<string, unknown>;

describe('NotificationClient', () => {
  let client: NotificationClient;
  let tokenService: NotificationTokenService;

  beforeEach(() => {
    client = env.getService(NotificationClient);
    tokenService = env.getService(NotificationTokenService);
    tokenService.invalidate();
    captured.length = 0;
    responseStatus = 202;
  });

  const lastToken = () => (captured.at(-1)?.authorization ?? '').replace(/^Bearer /, '');

  it('should attach an identity-issued M2M service token to pulse dispatches', async () => {
    await client.send(notification);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.authorization).toStartWith('Bearer ');
    const token = lastToken();
    const claims = decodeClaims(token);
    expect(claims.iss).toBe(Config.get('oauth.issuer'));
    expect(claims.aud).toBe('pulse-server');
    expect(claims.token_type).toBe('service');
    expect(claims.scope).toBe('notifications:send');
    expect(claims.sub).toBe(claims.client_id as string);
    expect(claims.exp as number).toBeGreaterThan(Date.now() / 1000);
    /** Offline signature verification against identity's own JWKS, exactly as pulse validates it. */
    expect(env.getService(KeyService).verify(token)).not.toBeNull();
  });

  it('should mint the token as the seeded identity-server service client', async () => {
    await client.send(notification);

    const claims = decodeClaims(lastToken());
    const [identityClient] = await env.getPostgresClient().select().from(schema.oauthClients).where(eq(schema.oauthClients.name, 'identity-server'));
    expect(identityClient).toBeDefined();
    expect(claims.client_id).toBe(identityClient?.id);
  });

  it('should reuse the cached token across dispatches', async () => {
    await client.send(notification);
    await client.send(notification);

    expect(captured).toHaveLength(2);
    expect(captured[1]?.authorization).toBe(captured[0]?.authorization as string);
  });

  it('should refresh the token once the cached one nears expiry', async () => {
    /** A TTL below the refresh skew makes every cached token immediately stale, forcing a re-mint per dispatch. */
    await env.getPostgresClient().update(schema.oauthClients).set({ accessTokenTtl: 10 }).where(eq(schema.oauthClients.name, 'identity-server'));

    await client.send(notification);
    await client.send(notification);

    const first = decodeClaims((captured[0]?.authorization ?? '').replace(/^Bearer /, ''));
    const second = decodeClaims((captured[1]?.authorization ?? '').replace(/^Bearer /, ''));
    expect(second.jti).not.toBe(first.jti as string);
  });

  it('should drop the cached token when pulse rejects it', async () => {
    await client.send(notification);
    const rejected = decodeClaims(lastToken());

    responseStatus = 401;
    await expect(client.send(notification)).rejects.toThrow('Notification request failed with status 401');

    responseStatus = 202;
    await client.send(notification);
    expect(decodeClaims(lastToken()).jti).not.toBe(rejected.jti as string);
  });
});

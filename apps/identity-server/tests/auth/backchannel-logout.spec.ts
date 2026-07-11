/**
 * Importing npm packages
 */
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { eq, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { BackChannelLogoutService, RefreshTokenService } from '@server/modules/auth/token';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('backchannel').init();

const received: string[] = [];
let failNext = false;
const rp = Bun.serve({
  port: 0,
  fetch: async request => {
    const body = await request.text();
    received.push(body);
    if (failNext) return new Response('down', { status: 500 });
    return new Response('ok');
  },
});

afterAll(() => rp.stop(true));

describe('OIDC back-channel logout', () => {
  let userId: bigint;
  let sessionId: bigint;
  let sessionSecret: string;
  let clientId: string;

  const logoutUri = `http://127.0.0.1:${rp.port}/logout`;

  const enqueueDeliveries = () => env.getPostgresClient().select().from(schema.oidcLogoutDeliveries);

  beforeEach(async () => {
    received.length = 0;
    failNext = false;
    await env.getPostgresClient().delete(schema.oidcLogoutDeliveries);

    const user = await env.getService(UserService).createUserWithPassword({ email: 'bcl@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    const session = await env.getService(SessionService).create({ userId, aal: 'AAL2' });
    sessionId = session.session.id;
    sessionSecret = session.secret;

    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const registered = await env.getService(OAuthClientService).register({
      applicationId: application.id,
      name: 'Logout RP',
      kind: 'WEB_CONFIDENTIAL',
      grantTypes: ['authorization_code', 'refresh_token'],
      backchannelLogoutUri: logoutUri,
    });
    clientId = registered.clientId;
    await env.getService(RefreshTokenService).issue({ userId, sessionId, clientId, scope: 'openid', audience: 'shadow-identity' });
  });

  it('should advertise back-channel logout support in discovery', async () => {
    const response = await env.getRouter().mockRequest().get('/.well-known/openid-configuration');
    expect(response.json()).toMatchObject({ backchannel_logout_supported: true, backchannel_logout_session_supported: true });
  });

  it('should queue a delivery when the user signs out', async () => {
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .post('/api/v1/auth/signout')
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: sessionSecret, 'csrf-token': csrf.cookie });
    expect(response.statusCode).toBe(204);

    const deliveries = await enqueueDeliveries();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ clientId, status: 'PENDING', subject: userId.toString(), sid: sessionId.toString(), logoutUri });
  });

  it('should deliver a spec-compliant logout token to the client', async () => {
    const backchannel = env.getService(BackChannelLogoutService);
    await backchannel.enqueueForSession(sessionId, userId);
    const sent = await backchannel.dispatchPending();
    expect(sent).toBe(1);

    expect(received).toHaveLength(1);
    const params = new URLSearchParams(received[0]);
    const token = params.get('logout_token');
    expect(token).not.toBeNull();

    const claims = env.getService(KeyService).verify(token ?? '');
    expect(claims).not.toBeNull();
    expect(claims).toMatchObject({ aud: clientId, sub: userId.toString(), sid: sessionId.toString() });
    expect((claims?.events as Record<string, unknown>)['http://schemas.openid.net/event/backchannel-logout']).toEqual({});
    expect(claims?.nonce).toBeUndefined();

    const [delivery] = await enqueueDeliveries();
    expect(delivery?.status).toBe('SENT');
  });

  it('should not queue deliveries for clients without a logout uri', async () => {
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const silent = await env
      .getService(OAuthClientService)
      .register({ applicationId: application.id, name: 'Silent RP', kind: 'WEB_CONFIDENTIAL', grantTypes: ['authorization_code'] });
    const session = await env.getService(SessionService).create({ userId });
    await env.getService(RefreshTokenService).issue({ userId, sessionId: session.session.id, clientId: silent.clientId });

    const queued = await env.getService(BackChannelLogoutService).enqueueForSession(session.session.id, userId);
    expect(queued).toBe(0);
  });

  it('should retry failed deliveries with backoff and dead-letter after the budget', async () => {
    failNext = true;
    const backchannel = env.getService(BackChannelLogoutService);
    await backchannel.enqueueForSession(sessionId, userId);

    const sent = await backchannel.dispatchPending();
    expect(sent).toBe(0);
    let [delivery] = await enqueueDeliveries();
    expect(delivery).toMatchObject({ status: 'FAILED', attemptCount: 1 });
    expect(delivery && delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    /**
     * Fast-forward to the final attempt: one more failure crosses the dead-letter budget. The
     * claim compares against the database clock, so the rewind must use it too.
     */
    await env
      .getPostgresClient()
      .update(schema.oidcLogoutDeliveries)
      .set({ attemptCount: 4, nextAttemptAt: sql`now() - interval '1 second'` })
      .where(eq(schema.oidcLogoutDeliveries.id, delivery?.id ?? ''));
    await backchannel.dispatchPending();
    [delivery] = await enqueueDeliveries();
    expect(delivery).toMatchObject({ status: 'DEAD', attemptCount: 5 });
  });

  it('should expose the registered logout uri on the client detail', async () => {
    const detail = await env.getService(OAuthClientService).getClientDetail(clientId);
    expect(detail?.backchannelLogoutUri).toBe(logoutUri);
  });
});

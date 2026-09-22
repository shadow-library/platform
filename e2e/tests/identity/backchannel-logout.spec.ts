/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  CLUSTER_HOST_CANDIDATES,
  fetchJwks,
  type HostReceiver,
  identityDb,
  identityMutate,
  type IdentitySession,
  type IdentityUser,
  mintRefreshToken,
  type OAuthApplication,
  type OAuthTestClient,
  registerOAuthClient,
  requireProductUrl,
  startHostReceiver,
  verifyJwt,
  waitUntil,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';

/**
 * Defining types
 */

interface DeliveryRow {
  readonly id: string;
  readonly clientId: string;
  readonly logoutUri: string;
  readonly subject: string;
  readonly sid: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly dueInMs: number;
  readonly sentAt: Date | null;
}

interface SignedInUser {
  readonly user: IdentityUser;
  readonly session: IdentitySession;
  readonly ctx: APIRequestContext;
  readonly tokenCtx: APIRequestContext;
}

/**
 * Declaring the constants
 *
 * OIDC back-channel logout: ending a session makes identity POST a signed logout token to every client that holds a refresh
 * token for it. The relying party is a real HTTP server on this host, which pods can reach because the delivery `fetch` is
 * unguarded — the SSRF guard that protects webhook delivery is not applied here. Which name reaches the host from inside the
 * cluster varies by container runtime, so the first test that needs one queues a delivery per candidate and keeps whichever
 * one actually arrives.
 *
 * The retry ladder is minutes long by design, so the dead-letter walk fast-forwards `next_attempt_at` in the database between
 * the worker's five-second ticks rather than waiting it out.
 */

const ISSUER = new URL(requireProductUrl('identity')).origin;
const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const PROBE_PATH = '/bcl-probe';

let receiver: HostReceiver;
let clusterHost: Promise<string> | undefined;

function tag(): string {
  return `e2e${randomBytes(3).toString('hex')}`;
}

async function deliveriesFor(clientId: string): Promise<DeliveryRow[]> {
  return identityDb()<DeliveryRow[]>`
    SELECT id::text, client_id AS "clientId", logout_uri AS "logoutUri", subject, sid, status, attempt_count AS "attemptCount",
           (EXTRACT(EPOCH FROM (next_attempt_at - now())) * 1000)::int AS "dueInMs", sent_at AS "sentAt"
    FROM oidc_logout_deliveries WHERE client_id = ${clientId} ORDER BY created_at
  `;
}

async function onlyDelivery(clientId: string): Promise<DeliveryRow> {
  const rows = await deliveriesFor(clientId);
  expect(rows, `exactly one delivery for ${clientId}`).toHaveLength(1);
  return rows[0] as DeliveryRow;
}

function awaitDelivery(clientId: string, accept: (row: DeliveryRow) => boolean, message: string): Promise<DeliveryRow> {
  return waitUntil(async () => (await deliveriesFor(clientId)).find(accept), { message, timeoutMs: 45_000 });
}

/** Lets the worker retry now instead of minutes from now, which is the only way to walk the ladder inside a test. */
async function fastForward(deliveryId: string): Promise<void> {
  await identityDb()`UPDATE oidc_logout_deliveries SET next_attempt_at = now() WHERE id = ${deliveryId}::uuid`;
}

async function signedIn(identity: IdentityHarness, label: string): Promise<SignedInUser> {
  const user = await identity.createUser({ label });
  const { session, ctx } = await identity.signIn(user);
  return { user, session, ctx, tokenCtx: await identity.anonymous() };
}

async function signout(caller: SignedInUser): Promise<void> {
  const response = await identityMutate(caller.ctx, 'post', '/api/v1/auth/signout');
  expect(response.status(), await response.text()).toBe(204);
}

async function relyingParty(identity: IdentityHarness, application: OAuthApplication, suffix: string, logoutPath?: string): Promise<OAuthTestClient> {
  const admin = (await identity.admin()).ctx;
  const backchannelLogoutUri = logoutPath ? receiver.urlFor(await clusterHostFor(identity), logoutPath) : undefined;
  return registerOAuthClient(admin, application, { suffix, ...(backchannelLogoutUri ? { backchannelLogoutUri } : {}) });
}

/**
 * Queues one delivery per candidate host from a single signout and keeps the host the worker actually reached. Memoised per
 * worker; a failure is not cached, so a later test retries rather than inheriting a stale verdict.
 */
async function resolveClusterHost(identity: IdentityHarness): Promise<string> {
  const admin = (await identity.admin()).ctx;
  const application = await identity.createOAuthApp('bcl-probe');
  const caller = await signedIn(identity, 'bcl-probe');

  for (const [index, host] of CLUSTER_HOST_CANDIDATES.entries()) {
    const client = await registerOAuthClient(admin, application, { suffix: `probe${index}`, backchannelLogoutUri: receiver.urlFor(host, `${PROBE_PATH}/${index}`) });
    await mintRefreshToken(caller.ctx, caller.tokenCtx, client);
  }
  await signout(caller);

  const reached = await receiver.waitForRequest(PROBE_PATH, { timeoutMs: 45_000, message: `no candidate of ${CLUSTER_HOST_CANDIDATES.join(', ')} reached this host` });
  const host = CLUSTER_HOST_CANDIDATES[Number(reached.path.split('/').pop())];
  if (!host) throw new Error(`delivery arrived on an unexpected probe path ${reached.path}`);
  return host;
}

function clusterHostFor(identity: IdentityHarness): Promise<string> {
  if (CLUSTER_HOST_CANDIDATES.length === 1) return Promise.resolve(CLUSTER_HOST_CANDIDATES[0] as string);
  return (clusterHost ??= resolveClusterHost(identity).catch((error: unknown) => {
    clusterHost = undefined;
    throw error;
  }));
}

test.beforeAll(async () => {
  receiver = await startHostReceiver();
});

test.afterAll(async () => {
  await receiver?.close();
});

test.describe('identity back-channel logout', () => {
  test('should deliver a verifiable logout token to every client holding a refresh token for the session', async ({ identity }) => {
    const application = await identity.createOAuthApp('bcl-send');
    const path = `/bcl/${tag()}`;
    const rp = await relyingParty(identity, application, 'rp', path);
    const silent = await relyingParty(identity, application, 'silent');
    const caller = await signedIn(identity, 'bcl-send');
    for (const client of [rp, silent]) await mintRefreshToken(caller.ctx, caller.tokenCtx, client);

    await signout(caller);
    const queued = await onlyDelivery(rp.clientId);
    expect(queued).toMatchObject({ subject: caller.user.userId, sid: caller.session.sessionId, logoutUri: receiver.urlFor(await clusterHostFor(identity), path) });
    expect(['PENDING', 'SENDING', 'SENT'], 'a queued delivery is pending until the worker claims it').toContain(queued.status);
    expect(await deliveriesFor(silent.clientId), 'a client without a logout URI is never queued').toEqual([]);

    const delivered = await receiver.waitForRequest(path, { timeoutMs: 45_000 });
    expect(delivered.method).toBe('POST');
    expect(delivered.headers['content-type']).toContain('application/x-www-form-urlencoded');
    const logoutToken = delivered.form.get('logout_token') ?? '';
    const claims = verifyJwt(logoutToken, await fetchJwks(caller.tokenCtx));
    expect(claims).toMatchObject({ iss: ISSUER, aud: rp.clientId, sub: caller.user.userId, sid: caller.session.sessionId, events: { [LOGOUT_EVENT]: {} } });
    expect(claims.nonce, 'a logout token must never carry a nonce').toBeUndefined();
    expect(claims.jti).toBeTruthy();

    const sent = await awaitDelivery(rp.clientId, row => row.status === 'SENT', 'the delivery never reached SENT');
    expect(sent.sentAt).not.toBeNull();
  });

  test('should retry a refusing relying party on a widening backoff and dead-letter it on the fifth failure', async ({ identity }) => {
    test.setTimeout(180_000);
    const application = await identity.createOAuthApp('bcl-retry');
    const [failingPath, healthyPath] = [`/bcl/${tag()}`, `/bcl/${tag()}`];
    receiver.answerWith(failingPath, 503);
    const failing = await relyingParty(identity, application, 'failing', failingPath);
    const caller = await signedIn(identity, 'bcl-retry');
    await mintRefreshToken(caller.ctx, caller.tokenCtx, failing);
    await signout(caller);

    let delivery = await awaitDelivery(failing.clientId, row => row.attemptCount === 1, 'the first attempt never failed');
    expect(delivery.status).toBe('FAILED');
    expect(delivery.dueInMs, 'a failed delivery is rescheduled into the future').toBeGreaterThan(0);

    for (let attempt = 2; attempt <= 5; attempt++) {
      await fastForward(delivery.id);
      delivery = await awaitDelivery(failing.clientId, row => row.attemptCount === attempt, `attempt ${attempt} never ran`);
    }
    expect(delivery.status, 'the fifth failure dead-letters the delivery').toBe('DEAD');
    expect(receiver.received(failingPath).length).toBe(5);

    await fastForward(delivery.id);
    const healthy = await relyingParty(identity, application, 'healthy', healthyPath);
    const second = await signedIn(identity, 'bcl-healthy');
    await mintRefreshToken(second.ctx, second.tokenCtx, healthy);
    await signout(second);

    await awaitDelivery(healthy.clientId, row => row.status === 'SENT', 'a healthy relying party was not served while a dead letter sat beside it');
    expect((await onlyDelivery(failing.clientId)).attemptCount, 'a dead-lettered delivery is never attempted again').toBe(5);
  });
});

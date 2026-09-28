/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  CLUSTER_HOST_CANDIDATES,
  type ConfigKeysProbe,
  fetchJwks,
  type HostReceiver,
  identityDb,
  identityMutate,
  type IdentitySession,
  type IdentityUser,
  mintRefreshToken,
  OAUTH_REDIRECT_URI,
  type OAuthApplication,
  type OAuthTestClient,
  probeConfigKeys,
  registerOAuthClient,
  requireProductUrl,
  startHostReceiver,
  verifyJwt,
  waitUntil,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectRefused } from './helpers';

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
 * token for it. Identity runs every logout URI through the webhook SSRF guard, at registration and again before delivery, so
 * a receiver on this host — plain http, on a private or `.internal` address — is refused unless the deployment sets
 * `WEBHOOKS_ALLOW_INSECURE_TARGETS` for both identity-server (registration) and identity-worker (delivery). Where the guard is
 * strict, which is how dev runs, only the refusal and the https registration beside it are testable; the delivery tests run
 * only in an environment of their own with the flag set. There, which name reaches the host from inside the cluster varies by
 * container runtime, so the first test that needs one queues a delivery per candidate and keeps whichever one actually arrives.
 *
 * The retry ladder is minutes long by design, so the dead-letter walk fast-forwards `next_attempt_at` in the database between
 * the worker's five-second ticks rather than waiting it out.
 */

const INSECURE_TARGETS_KEY = 'WEBHOOKS_ALLOW_INSECURE_TARGETS';
const PUBLIC_LOGOUT_URI = 'https://rp.example.com/backchannel-logout';

const ISSUER = new URL(requireProductUrl('identity')).origin;
const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const PROBE_PATH = '/bcl-probe';

let receiver: HostReceiver;
let clusterHost: Promise<string> | undefined;
let insecureTargets: ConfigKeysProbe;

/** The flag counts only when both the component that registers and the one that delivers read it. */
async function probeInsecureTargets(): Promise<ConfigKeysProbe> {
  const probes = await Promise.all(
    (['server', 'worker'] as const).map(component =>
      probeConfigKeys(
        'identity',
        [
          ['configmap', 'cluster-config'],
          ['configmap', 'common-config'],
          ['configmap', `identity-${component}-config`],
          ['secret', 'common-secrets'],
          ['secret', `identity-${component}-secrets`],
        ],
        [INSECURE_TARGETS_KEY],
      ),
    ),
  );
  return { configured: probes.every(probe => probe.configured), probeFailed: probes.some(probe => probe.probeFailed) };
}

function registerClient(admin: APIRequestContext, application: OAuthApplication, clientId: string, backchannelLogoutUri: string): Promise<APIResponse> {
  return identityMutate(admin, 'post', '/api/v1/admin/clients', {
    clientId,
    applicationId: application.applicationId,
    name: `${clientId} client`,
    kind: 'SPA_PUBLIC',
    isFirstParty: true,
    redirectUris: [OAUTH_REDIRECT_URI],
    grantTypes: ['authorization_code', 'refresh_token'],
    backchannelLogoutUri,
  });
}

async function storedLogoutUris(clientId: string): Promise<(string | null)[]> {
  const rows = await identityDb()<{ uri: string | null }[]>`SELECT backchannel_logout_uri AS uri FROM oauth_clients WHERE id = ${clientId}`;
  return rows.map(row => row.uri);
}

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
  insecureTargets = await probeInsecureTargets();
  receiver = await startHostReceiver();
});

test.afterAll(async () => {
  await receiver?.close();
});

test.describe('identity back-channel logout — the SSRF guard', () => {
  test.beforeEach(() => {
    test.skip(insecureTargets.probeFailed, 'could not read identity config from the cluster');
    test.skip(insecureTargets.configured, `${INSECURE_TARGETS_KEY} is set here, so identity accepts the URIs this test expects refused`);
  });

  test('should refuse a plain-http, private or credentialed logout URI on registration and update, and accept a public https one', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('bcl-guard');
    const refusedUris = [
      receiver.urlFor(CLUSTER_HOST_CANDIDATES[0] ?? 'host.k3d.internal', '/bcl'),
      'http://rp.example.com/backchannel-logout',
      'https://127.0.0.1/bcl',
      'https://10.0.0.1/bcl',
      'https://localhost/bcl',
      'https://host.k3d.internal/bcl',
      'https://user:secret@rp.example.com/bcl',
    ];

    for (const [index, uri] of refusedUris.entries()) {
      const clientId = `${application.name}-refused${index}`;
      await expectRefused(await registerClient(admin, application, clientId, uri), 400, 'ADM_003', `registering ${uri}`);
      expect(await storedLogoutUris(clientId), `no client was created for ${uri}`).toEqual([]);
    }

    const clientId = `${application.name}-rp`;
    const registered = await registerClient(admin, application, clientId, PUBLIC_LOGOUT_URI);
    expect(registered.status(), await registered.text()).toBe(201);
    expect(await storedLogoutUris(clientId)).toEqual([PUBLIC_LOGOUT_URI]);

    for (const uri of refusedUris) {
      await expectRefused(await identityMutate(admin, 'patch', `/api/v1/admin/clients/${clientId}`, { backchannelLogoutUri: uri }), 400, 'ADM_003', `updating to ${uri}`);
    }
    expect(await storedLogoutUris(clientId), 'no refused update was written').toEqual([PUBLIC_LOGOUT_URI]);

    const moved = 'https://rp.example.com/logout/backchannel';
    const updated = await identityMutate(admin, 'patch', `/api/v1/admin/clients/${clientId}`, { backchannelLogoutUri: moved });
    expect(updated.status(), await updated.text()).toBe(200);
    expect(await storedLogoutUris(clientId)).toEqual([moved]);
  });
});

test.describe('identity back-channel logout — delivery', () => {
  test.beforeEach(() => {
    test.skip(insecureTargets.probeFailed, 'could not read identity config from the cluster');
    test.skip(!insecureTargets.configured, `identity refuses a receiver on this host unless ${INSECURE_TARGETS_KEY} is set for identity-server and identity-worker`);
  });

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

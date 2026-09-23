/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  clearIpState,
  clientCredentialsGrant,
  findAuditEventsByActor,
  findAuditEventsByIp,
  identityApi,
  identityDb,
  loginInit,
  type OAuthClientCredentials,
  rateLimitKey,
  readRateLimit,
  recoverInit,
  redisDel,
  redisTtl,
  refreshGrant,
  registerInit,
  runAll,
  signInWithPassword,
  spendRateLimit,
  startLogin,
  uniqueClientIp,
  uniqueEmail,
  verifyChallenge,
} from '../../lib';
import { expect, test as identityTest } from './fixtures';
import { countOutboxRows, expectRefused, flowStepOf } from './helpers';

/**
 * Defining types
 */

interface Budget {
  readonly bucket: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

interface Caller {
  readonly ip: string;
  /** A cookie-less context charged to `ip`. A completed login leaves `__Host-sid` in it, so a second login needs a new one. */
  readonly ctx: APIRequestContext;
}

interface RateLimitScratch {
  /** A fresh client address, wiped before the test and dropped from Redis after it. */
  address(): Promise<string>;
  /** A cookie-less identity context charged to `ip`. */
  context(ip: string): Promise<APIRequestContext>;
  caller(): Promise<Caller>;
  /** A `rl:*` key that is not keyed by an address — dropped after the test, which the address sweep cannot reach. */
  track(...keys: string[]): void;
}

/**
 * Declaring the constants
 *
 * Every budget, block and tally identity keeps is keyed on the caller's address, so this file runs in the `identity-serial`
 * project (one worker, no in-file parallelism — see `playwright.config.ts`) and gives each test addresses of its own out of
 * the benchmarking range. A limit is proven the cheap way where the count is large — pre-spend the window in Redis, then let
 * the next real request cross it — and the whole way where it is small: the `register/init` budget below is reached by six
 * real requests. Every test also proves the legitimate path still works — a fresh address, or another source, gets through —
 * so a pass can never mean "everything is refused".
 *
 * The numbers mirror the server's own (`security.constants.ts`, the `@RateLimit` decorators on `auth.controller.ts`, and
 * `SuspiciousLoginService`); a budget that moves there shows up here as a wrong count rather than a silent pass.
 */

const REGISTER_INIT: Budget = { bucket: 'register-init', limit: 5, windowSeconds: 3_600 };
const LOGIN_INIT: Budget = { bucket: 'login-init', limit: 20, windowSeconds: 3_600 };
const RECOVER_INIT: Budget = { bucket: 'recover-init', limit: 5, windowSeconds: 3_600 };
const CHALLENGE_VERIFY: Budget = { bucket: 'challenge-verify', limit: 60, windowSeconds: 3_600 };
const IP_GENERAL: Budget = { bucket: 'ip-general', limit: 100, windowSeconds: 60 };
const M2M_CLIENT: Budget = { bucket: 'm2m-client', limit: 600, windowSeconds: 60 };
const PUBLIC_CLIENT: Budget = { bucket: 'oauth-public-client', limit: 30, windowSeconds: 60 };

/** `SuspiciousLoginService`: the block fires on the failure that makes the tally exactly this, and lasts an hour. */
const IP_FAILURE = { bucket: 'ipfail', threshold: 30, windowSeconds: 900 };
const IP_BLOCK_TTL_SECONDS = 3_600;

const REGISTER_OTP_TEMPLATE = 'auth.register.otp';
const NEW_SIGNIN_TEMPLATE = 'security.new-signin';
const NEW_DEVICE_LOGIN = 'security.new_device_login';

const test = identityTest.extend<{ limits: RateLimitScratch }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  limits: async ({}, use) => {
    const addresses: string[] = [];
    const contexts: APIRequestContext[] = [];
    const keys: string[] = [];

    const address = async (): Promise<string> => {
      const ip = uniqueClientIp();
      addresses.push(ip);
      await clearIpState(ip);
      return ip;
    };
    const context = async (ip: string): Promise<APIRequestContext> => {
      const ctx = await identityApi(ip);
      contexts.push(ctx);
      return ctx;
    };

    await use({
      address,
      context,
      caller: async () => {
        const ip = await address();
        return { ip, ctx: await context(ip) };
      },
      track: (...tracked) => {
        keys.push(...tracked);
      },
    });

    await runAll([...contexts.map(ctx => () => ctx.dispose()), () => redisDel(...keys), ...addresses.map(ip => () => clearIpState(ip))]);
  },
});

function wrongPassword(): string {
  return `Wrong-${randomBytes(6).toString('hex')}-9a`;
}

function junkRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

function deviceId(label: string): string {
  return `e2e-${label}-${randomBytes(6).toString('hex')}`;
}

/** An address that cannot exist but masks to exactly what `email` masks to — same length, same first and last local-part characters. */
function enumerationTwin(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'z'.repeat(local.length - 2)}${local.slice(-1)}@${domain}`;
}

/** Drops the OTP and challenge an `init` route enqueues for an address, which no account deletion cascades away. */
async function purgeAddressTrail(email: string): Promise<void> {
  const address = email.toLowerCase();
  await identityDb()`DELETE FROM notification_outbox WHERE ((recipients #>> '{}')::jsonb) ->> 'email' = ${address}`;
  await identityDb()`DELETE FROM verification_challenges WHERE lower(target) = ${address}`;
}

/** Retry-After is whatever is left of the window, so it is pinned as a range rather than a value. */
function expectRetryAfterWithin(response: APIResponse, windowSeconds: number): void {
  const retryAfter = Number(response.headers()['retry-after']);
  expect(retryAfter, 'the refusal says how much of the window is left').toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
}

/** Completes a password login for `user` from `ip` on a context of its own, as a real client on that device would. */
async function signIn(limits: RateLimitScratch, user: { email: string; password: string }, ip: string, device: string): Promise<void> {
  const ctx = await limits.context(ip);
  const { response } = await signInWithPassword(ctx, user.email, user.password, { deviceId: device });
  expect(response.status(), await response.text()).toBe(200);
  expect((await flowStepOf(response)).status).toBe('COMPLETED');
}

test.describe.configure({ mode: 'serial' });

test.describe('identity auth endpoint budgets', () => {
  test('should let five register/inits through per address, refuse the sixth and leave other addresses alone', async ({ identity, limits }) => {
    const user = await identity.createUser({ label: 'rl-register' });
    // The twin masks to the same string as the user's address, so only its own local part varies between runs: purge its trail
    // first and last, or a rerun that happens to derive the same twin would count the previous run's OTP.
    const twin = enumerationTwin(user.email);
    const probed = [twin];
    const probeAddress = (): string => {
      const email = uniqueEmail('rl-register');
      probed.push(email);
      return email;
    };

    try {
      await purgeAddressTrail(twin);
      const flooder = await limits.caller();
      const bystander = await limits.caller();

      const known = await registerInit(flooder.ctx, user.email);
      const unknown = await registerInit(flooder.ctx, twin);
      expect(known.status()).toBe(200);
      expect(unknown.status()).toBe(200);
      const withoutFlowId = async (response: APIResponse): Promise<unknown> => ({ ...((await response.json()) as object), flowId: undefined });
      expect(await withoutFlowId(known), 'a registered address must answer exactly as an unknown one does').toEqual(await withoutFlowId(unknown));
      expect(await countOutboxRows('email', user.email, REGISTER_OTP_TEMPLATE), 'the only difference is internal: no OTP for an address already registered').toBe(0);
      expect(await countOutboxRows('email', twin, REGISTER_OTP_TEMPLATE), 'while the unknown address is sent one').toBe(1);

      for (const attempt of [3, 4, 5]) {
        expect((await registerInit(flooder.ctx, probeAddress())).status(), `register/init number ${attempt} is still inside the budget`).toBe(200);
      }

      const refused = await registerInit(flooder.ctx, probeAddress());
      await expectRefused(refused, 429, 'RATE_LIMITED', 'the sixth register/init from one address inside the window');
      expectRetryAfterWithin(refused, REGISTER_INIT.windowSeconds);
      expect(await readRateLimit(REGISTER_INIT.bucket, flooder.ip), 'the refused request is counted too').toBe(REGISTER_INIT.limit + 1);

      expect((await registerInit(bystander.ctx, probeAddress())).status(), 'another address keeps a budget of its own').toBe(200);
    } finally {
      await runAll(probed.map(email => () => purgeAddressTrail(email)));
    }
  });

  test('should refuse login/init past its hourly budget while the address still reaches other routes', async ({ identity, limits }) => {
    const user = await identity.createUser({ label: 'rl-login-init' });
    const flooder = await limits.caller();
    const bystander = await limits.caller();

    try {
      // Twenty real inits would prove nothing the one crossing request does not, so the window is pre-spent to the limit.
      await spendRateLimit(LOGIN_INIT.bucket, flooder.ip, LOGIN_INIT.limit, LOGIN_INIT.windowSeconds);
      const refused = await loginInit(flooder.ctx, user.email);
      await expectRefused(refused, 429, 'RATE_LIMITED', 'the twenty-first login/init from one address inside the window');
      expectRetryAfterWithin(refused, LOGIN_INIT.windowSeconds);

      expect((await recoverInit(flooder.ctx, user.email)).status(), 'recover/init is a bucket of its own, so the same address still reaches it').toBe(200);
      expect((await loginInit(bystander.ctx, user.email)).status(), 'and another address opens login flows normally').toBe(200);
    } finally {
      await purgeAddressTrail(user.email);
    }
  });

  test('should refuse recover/init past its hourly budget while the address still reaches other routes', async ({ identity, limits }) => {
    const user = await identity.createUser({ label: 'rl-recover-init' });
    const flooder = await limits.caller();
    const bystander = await limits.caller();

    try {
      await spendRateLimit(RECOVER_INIT.bucket, flooder.ip, RECOVER_INIT.limit, RECOVER_INIT.windowSeconds);
      const refused = await recoverInit(flooder.ctx, user.email);
      await expectRefused(refused, 429, 'RATE_LIMITED', 'the sixth recover/init from one address inside the window');
      expectRetryAfterWithin(refused, RECOVER_INIT.windowSeconds);
      expect(await readRateLimit(RECOVER_INIT.bucket, flooder.ip), 'the refused request is counted too').toBe(RECOVER_INIT.limit + 1);

      expect((await loginInit(flooder.ctx, user.email)).status(), 'login/init is a bucket of its own, so the same address still reaches it').toBe(200);
      expect((await recoverInit(bystander.ctx, user.email)).status(), 'and another address starts a recovery normally').toBe(200);
    } finally {
      await purgeAddressTrail(user.email);
    }
  });

  test('should hold challenge/verify to a budget of its own without touching login/init', async ({ identity, limits }) => {
    const user = await identity.createUser({ label: 'rl-verify' });
    const caller = await limits.caller();
    const flowId = await startLogin(caller.ctx, user.email);

    const inside = await verifyChallenge(caller.ctx, { flowId, password: wrongPassword() });
    expect(inside.status(), 'a verify inside the budget reaches the credential check').toBe(401);

    await spendRateLimit(CHALLENGE_VERIFY.bucket, caller.ip, CHALLENGE_VERIFY.limit, CHALLENGE_VERIFY.windowSeconds);
    const refused = await verifyChallenge(caller.ctx, { flowId, password: user.password });
    await expectRefused(refused, 429, 'RATE_LIMITED', 'a verify past the hourly budget — even with the right password');
    expectRetryAfterWithin(refused, CHALLENGE_VERIFY.windowSeconds);

    expect((await loginInit(caller.ctx, user.email)).status(), 'login/init is a separate bucket, so the same address still opens flows').toBe(200);

    const fresh = await limits.caller();
    const { response } = await signInWithPassword(fresh.ctx, user.email, user.password);
    expect(response.status(), 'and another address signs in normally').toBe(200);
  });
});

test.describe('identity address blocks', () => {
  test('should block an address on correlated failed logins and refuse every route from it', async ({ identity, limits }) => {
    const first = await identity.createUser({ label: 'rl-block-one' });
    const second = await identity.createUser({ label: 'rl-block-two' });
    const attacker = await limits.caller();
    const bystander = await limits.caller();

    // Twenty-nine arranged failures, then one real one on another account: the block fires on the failure that makes the tally
    // exactly the threshold, and a fresh address guarantees the tally starts at zero.
    await spendRateLimit(IP_FAILURE.bucket, attacker.ip, IP_FAILURE.threshold - 1, IP_FAILURE.windowSeconds);
    const flowId = await startLogin(attacker.ctx, first.email);
    const failed = await verifyChallenge(attacker.ctx, { flowId, password: wrongPassword() });
    expect(failed.status(), await failed.text()).toBe(401);

    const [blocked, ...extra] = await findAuditEventsByIp('security.ip_blocked', attacker.ip);
    expect(blocked, 'the threshold failure blocks the address and audits it').toMatchObject({
      actorType: 'SYSTEM',
      actorId: null,
      outcome: 'SUCCESS',
      detail: { failures: IP_FAILURE.threshold, windowSeconds: IP_FAILURE.windowSeconds, blockTtlSeconds: IP_BLOCK_TTL_SECONDS },
    });
    expect(extra, 'and audits it once').toEqual([]);

    const blockTtl = await redisTtl(`rl:ipblock:${attacker.ip}`);
    expect(blockTtl).toBeGreaterThan(0);
    expect(blockTtl).toBeLessThanOrEqual(IP_BLOCK_TTL_SECONDS);

    const refusals: [string, APIResponse][] = [
      ['login/init from a blocked address', await loginInit(attacker.ctx, second.email)],
      ['a session route, refused before the session is even read', await attacker.ctx.get('/api/v1/me')],
    ];
    for (const [what, response] of refusals) {
      await expectRefused(response, 429, 'RATE_LIMITED', what);
      expectRetryAfterWithin(response, IP_BLOCK_TTL_SECONDS);
    }

    expect((await loginInit(bystander.ctx, second.email)).status(), 'the block is on the address, not on the account it failed against').toBe(200);

    await redisDel(`rl:ipblock:${attacker.ip}`);
    expect((await loginInit(attacker.ctx, second.email)).status(), 'and the address is served again once the block is lifted').toBe(200);
  });
});

test.describe('identity token endpoint budgets', () => {
  test('should charge an authenticated M2M call to its client and an unauthenticated one to its source', async ({ identity, limits }) => {
    const first = await identity.createOAuthApp('rl-m2m-one');
    const second = await identity.createOAuthApp('rl-m2m-two');
    const egress = await limits.caller();
    limits.track(rateLimitKey(M2M_CLIENT.bucket, first.serviceClient.clientId), rateLimitKey(M2M_CLIENT.bucket, second.serviceClient.clientId));

    expect((await clientCredentialsGrant(egress.ctx, first.serviceClient)).status()).toBe(200);
    expect(await readRateLimit(M2M_CLIENT.bucket, first.serviceClient.clientId), 'an authenticated call spends its client budget').toBe(1);
    expect(await readRateLimit(IP_GENERAL.bucket, egress.ip), 'and none of the address budget').toBe(0);

    await spendRateLimit(M2M_CLIENT.bucket, first.serviceClient.clientId, M2M_CLIENT.limit, M2M_CLIENT.windowSeconds);
    const overClientBudget = await clientCredentialsGrant(egress.ctx, first.serviceClient);
    await expectRefused(overClientBudget, 429, 'RATE_LIMITED', 'a client past its own budget');
    expect((await clientCredentialsGrant(egress.ctx, second.serviceClient)).status(), 'a second client behind the same address is unaffected').toBe(200);

    const impostor: OAuthClientCredentials = { clientId: second.serviceClient.clientId, secret: `wrong-${randomBytes(8).toString('hex')}` };
    await expectRefused(await clientCredentialsGrant(egress.ctx, impostor), 401, 'invalid_client', 'a call that never authenticates');
    // The charge is made at `onResponse`, after the reply is on the wire, so it is read by polling rather than once.
    await expect.poll(() => readRateLimit(IP_GENERAL.bucket, egress.ip), { message: 'a failed client authentication is charged to the source address' }).toBe(1);

    const flooded = await limits.caller();
    await spendRateLimit(IP_GENERAL.bucket, flooded.ip, IP_GENERAL.limit, IP_GENERAL.windowSeconds);
    const refused = await clientCredentialsGrant(flooded.ctx, second.serviceClient);
    await expectRefused(refused, 429, 'RATE_LIMITED', 'an authenticated call from an address that has spent the general budget');
    expectRetryAfterWithin(refused, IP_GENERAL.windowSeconds);

    const clean = await limits.caller();
    expect((await clientCredentialsGrant(clean.ctx, second.serviceClient)).status(), 'while another address reaches the same client').toBe(200);
  });

  test('should bucket a public client per source address and leave a confidential one on its shared budget', async ({ identity, limits }) => {
    const publicClient = await identity.createOAuthClient('rl-public');
    const application = await identity.createOAuthApp('rl-confidential');
    const confidential = await identity.createOAuthClientOn(application, { kind: 'WEB_CONFIDENTIAL', suffix: 'conf' });
    const source = await limits.caller();
    const other = await limits.caller();
    limits.track(rateLimitKey(M2M_CLIENT.bucket, confidential.clientId));
    const sourceBucket = `${publicClient.clientId}:${source.ip}`;

    await expectRefused(await refreshGrant(source.ctx, publicClient, junkRefreshToken()), 400, 'invalid_grant', 'a junk refresh on a public client');
    expect(await readRateLimit(PUBLIC_CLIENT.bucket, sourceBucket), 'which is charged to the (client, source) pair').toBe(1);
    expect(await readRateLimit(M2M_CLIENT.bucket, publicClient.clientId), 'never to the budget the client shares with its other callers').toBe(0);
    expect(await readRateLimit(IP_GENERAL.bucket, source.ip), 'and not to the address either: a rejected grant is not a failed authentication').toBe(0);

    await spendRateLimit(PUBLIC_CLIENT.bucket, sourceBucket, PUBLIC_CLIENT.limit, PUBLIC_CLIENT.windowSeconds);
    await expectRefused(await refreshGrant(source.ctx, publicClient, junkRefreshToken()), 429, 'RATE_LIMITED', 'a flood from one source of a public client');
    await expectRefused(await refreshGrant(other.ctx, publicClient, junkRefreshToken()), 400, 'invalid_grant', 'while another source still reaches grant validation');

    await expectRefused(await refreshGrant(source.ctx, confidential, junkRefreshToken()), 400, 'invalid_grant', 'a junk refresh on a confidential client');
    expect(await readRateLimit(M2M_CLIENT.bucket, confidential.clientId), 'a confidential client stays on its shared per-client budget').toBe(1);
    expect(await readRateLimit(PUBLIC_CLIENT.bucket, `${confidential.clientId}:${source.ip}`), 'and is never bucketed per source').toBe(0);
  });

  // App bug: the per-client budgets hold `retryAfterSeconds` and throw without it (rate-limiter.service.ts:80-92), where the
  // middleware sets the header before throwing the same code (rate-limit.middleware.ts:62-63).
  test.fixme('should tell a client refused by its own budget when to retry', async ({ identity, limits }) => {
    const application = await identity.createOAuthApp('rl-m2m-retry');
    const caller = await limits.caller();
    limits.track(rateLimitKey(M2M_CLIENT.bucket, application.serviceClient.clientId));

    await spendRateLimit(M2M_CLIENT.bucket, application.serviceClient.clientId, M2M_CLIENT.limit, M2M_CLIENT.windowSeconds);
    expectRetryAfterWithin(await clientCredentialsGrant(caller.ctx, application.serviceClient), M2M_CLIENT.windowSeconds);
  });
});

test.describe('identity suspicious login detection', () => {
  test('should alert only when a known account signs in from an unseen device or address', async ({ identity, limits }) => {
    const user = await identity.createUser({ label: 'rl-signin' });
    const home = await limits.address();
    const roaming = await limits.address();
    const returning = await limits.address();
    const laptop = deviceId('laptop');
    const phone = deviceId('phone');
    const alerts = (): Promise<{ detail: Record<string, unknown> | null; actorId: string | null }[]> => findAuditEventsByActor(NEW_DEVICE_LOGIN, user.userId);

    await signIn(limits, user, home, laptop);
    expect(await alerts(), 'a first login has nothing to compare itself against').toEqual([]);
    expect(await countOutboxRows('email', user.email, NEW_SIGNIN_TEMPLATE)).toBe(0);

    await signIn(limits, user, home, laptop);
    expect(await alerts(), 'and a repeat on the same device and address is not suspicious either').toEqual([]);
    expect(await countOutboxRows('email', user.email, NEW_SIGNIN_TEMPLATE)).toBe(0);

    await signIn(limits, user, roaming, phone);
    const afterRoaming = await alerts();
    expect(afterRoaming).toHaveLength(1);
    expect(afterRoaming[0]).toMatchObject({ actorId: user.userId, detail: { newDevice: true, newIp: true } });
    expect(await findAuditEventsByIp(NEW_DEVICE_LOGIN, roaming), 'the audit row names the address the login came from').toHaveLength(1);
    expect(await countOutboxRows('email', user.email, NEW_SIGNIN_TEMPLATE), 'one alert, and only one').toBe(1);

    await signIn(limits, user, returning, laptop);
    const afterReturning = await alerts();
    expect(afterReturning).toHaveLength(2);
    expect(afterReturning[1]).toMatchObject({ detail: { newDevice: false, newIp: true } });
    expect(await countOutboxRows('email', user.email, NEW_SIGNIN_TEMPLATE)).toBe(2);
  });
});

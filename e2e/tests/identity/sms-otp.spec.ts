/**
 * Importing npm packages
 */
import { randomInt } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { type AuthModeSnapshot, changeChallenge, loginInit, restoreAuthMode, setAuthMode, snapshotAuthMode, verifyChallenge } from '../../lib';
import { expect, test } from './fixtures';
import { countOutboxRows, expectErrorCode, expectSessionCookie, flowChallenges, flowStepOf, pollSmsOtp } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The `SMS_OTP` auth mode is a global switch, so this file runs in the `identity-serial` project (one worker, no in-file
 * parallelism — see `playwright.config.ts`) and puts the switch back exactly as it found it. Only a phone identifier reacts to
 * it, and no other spec signs in by phone, so flipping it cannot disturb the rest of the suite.
 */

const LOGIN_OTP_TEMPLATE = 'auth.login.otp';

function uniquePhone(): string {
  return `+1999${randomInt(1_000_000, 9_999_999)}`;
}

async function offeredMethods(ctx: APIRequestContext, flowId: string): Promise<{ name: string; metadata?: { maskedPhone?: string } }[]> {
  const response = await ctx.get(`/api/v1/auth/challenge/methods?flowId=${encodeURIComponent(flowId)}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { methods: { name: string; metadata?: { maskedPhone?: string } }[] }).methods;
}

test.describe.configure({ mode: 'serial' });

test.describe('identity SMS OTP login', () => {
  let original: AuthModeSnapshot | undefined;

  test.beforeAll(async () => {
    original = await snapshotAuthMode('SMS_OTP');
  });

  test.afterAll(async () => {
    if (original) await restoreAuthMode(original);
  });

  test('should keep a phone sign-in on the password and refuse to switch to SMS while the mode is off', async ({ identity }) => {
    await setAuthMode((await identity.admin()).ctx, 'SMS_OTP', false);
    const phone = uniquePhone();
    await identity.createUser({ label: 'sms-off', phone, phoneVerified: true });
    const ctx = await identity.anonymous();

    const init = await loginInit(ctx, phone);
    expect(init.status(), await init.text()).toBe(200);
    const { flowId = '', status } = await flowStepOf(init);
    expect(status).toBe('AWAITING_PASSWORD');
    expect(await flowChallenges(flowId)).toEqual([]);
    expect((await offeredMethods(ctx, flowId)).map(method => method.name)).toEqual(['PASSWORD', 'WEBAUTHN']);

    const change = await changeChallenge(ctx, flowId, 'SMS_OTP');
    expect(change.status()).toBe(409);
    await expectErrorCode(change, 'AUTH_002');
    expect(await flowChallenges(flowId), 'a refused switch must not text a code').toEqual([]);
    expect(await countOutboxRows('phone', phone)).toBe(0);
  });

  test('should text the first challenge to a phone identifier while the mode is on and complete with that code', async ({ identity }) => {
    await setAuthMode((await identity.admin()).ctx, 'SMS_OTP', true);
    const phone = uniquePhone();
    const user = await identity.createUser({ label: 'sms-on', phone, phoneVerified: true });
    const ctx = await identity.anonymous();

    const init = await loginInit(ctx, phone);
    expect(init.status(), await init.text()).toBe(200);
    const { flowId = '', status } = await flowStepOf(init);
    expect(status).toBe('AWAITING_SMS_OTP');
    expect(await flowChallenges(flowId)).toEqual([{ type: 'SMS_OTP', target: phone }]);
    expect(await offeredMethods(ctx, flowId)).toContainEqual({ name: 'SMS_OTP', metadata: { maskedPhone: `**${phone.slice(-2)}` } });

    const verify = await verifyChallenge(ctx, { flowId, code: await pollSmsOtp(phone, LOGIN_OTP_TEMPLATE) });
    expect(verify.status(), await verify.text()).toBe(200);
    expect(await flowStepOf(verify)).toEqual({ flowId, status: 'COMPLETED' });
    expectSessionCookie(verify);

    const byEmail = await loginInit(await identity.anonymous(), user.email);
    expect(byEmail.status()).toBe(200);
    expect((await flowStepOf(byEmail)).status, 'an email identifier keeps the password step').toBe('AWAITING_PASSWORD');
  });
});

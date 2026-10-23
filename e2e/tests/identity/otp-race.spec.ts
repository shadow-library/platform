import { type APIRequestContext } from '@playwright/test';

import { identityDb, identityMutate, uniqueEmail } from '../../lib';
import { expect, test } from './fixtures';
import { expectRefused, pollOtp } from './helpers';

interface ChallengeState {
  attemptCount: number;
  consumed: boolean;
}

const ME_EMAILS_PATH = '/api/v1/me/emails';
const EMAIL_VERIFY_TEMPLATE = 'user.email.verification';
const CHALLENGE_ATTEMPT_BUDGET = 3;
const CONCURRENT_GUESSES = 20;

async function claimEmail(ctx: APIRequestContext, email: string): Promise<{ verificationId: string; code: string }> {
  const added = await identityMutate(ctx, 'post', ME_EMAILS_PATH, { email });
  expect(added.status(), await added.text()).toBe(200);
  const { verificationId } = (await added.json()) as { verificationId: string };
  return { verificationId, code: await pollOtp(email, EMAIL_VERIFY_TEMPLATE) };
}

function submitCode(ctx: APIRequestContext, verificationId: string, code: string) {
  return identityMutate(ctx, 'post', `${ME_EMAILS_PATH}/verify`, { verificationId, code });
}

function wrongCodes(code: string, count: number): string[] {
  const codes = new Set<string>();
  for (let offset = 1; codes.size < count; offset++) codes.add(String((Number(code) + offset) % 1_000_000).padStart(6, '0'));
  return [...codes];
}

async function challengeState(verificationId: string): Promise<ChallengeState | undefined> {
  const [row] = await identityDb()<ChallengeState[]>`
    SELECT attempt_count AS "attemptCount", consumed_at IS NOT NULL AS consumed FROM verification_challenges WHERE flow_id = ${verificationId}
  `;
  return row;
}

async function isVerified(ctx: APIRequestContext, email: string): Promise<boolean> {
  const response = await ctx.get(ME_EMAILS_PATH);
  expect(response.status(), await response.text()).toBe(200);
  const { items } = (await response.json()) as { items: { value: string; verifiedAt?: string }[] };
  return items.some(item => item.value === email && item.verifiedAt !== undefined);
}

// Contact-email verify has no flow-level failure counter, so refusals here come only from the challenge's own budget and single-use guard.
test.describe('identity OTP challenge races', () => {
  test('should spend no more than the attempt budget on concurrent wrong guesses and then refuse the correct code', async ({ identity }) => {
    const user = await identity.createUser({ label: 'otp-race-guess' });
    const { ctx } = await identity.signIn(user);
    const email = uniqueEmail('otp-race-guess');
    const { verificationId, code } = await claimEmail(ctx, email);

    const guesses = await Promise.all(wrongCodes(code, CONCURRENT_GUESSES).map(guess => submitCode(ctx, verificationId, guess)));

    for (const guess of guesses) await expectRefused(guess, 401, 'MFA_002');
    expect(await challengeState(verificationId), 'concurrent guesses must not slip past the attempt budget').toEqual({ attemptCount: CHALLENGE_ATTEMPT_BUDGET, consumed: false });
    await expectRefused(await submitCode(ctx, verificationId, code), 401, 'MFA_002', 'the correct code must be refused once the budget is spent');
    expect(await isVerified(ctx, email)).toBe(false);
  });

  test('should accept exactly one of two concurrent submissions of the correct code', async ({ identity }) => {
    const user = await identity.createUser({ label: 'otp-race-double' });
    const { ctx } = await identity.signIn(user);
    const email = uniqueEmail('otp-race-double');
    const { verificationId, code } = await claimEmail(ctx, email);

    const submissions = await Promise.all([submitCode(ctx, verificationId, code), submitCode(ctx, verificationId, code)]);

    expect(submissions.map(response => response.status()).sort()).toEqual([200, 401]);
    const refused = submissions.find(response => response.status() === 401);
    if (refused) await expectRefused(refused, 401, 'MFA_002');
    expect(await challengeState(verificationId)).toMatchObject({ consumed: true });
    expect(await isVerified(ctx, email)).toBe(true);
  });
});

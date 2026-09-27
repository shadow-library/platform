/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { expect, test } from './fixtures';
import { type AccountView, errorCodeOf, getAccount, memoirMutate } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `GET/PATCH /account` and `POST /account/onboarding` (T-17). Every test onboards or mutates its own fresh
 * persona (see `fixtures.ts`) — the accounts here are throwaway, never one of the five seeded personas.
 */

async function expectValidationError(response: APIResponse): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(422);
  expect(await errorCodeOf(response)).toBe('VALIDATION_ERROR');
}

test.describe('memoir account onboarding', () => {
  test('should reject an inverted schedule window and an unresolvable timezone, then normalize currency casing, union enabled currencies, and keep timezone verbatim once onboarding succeeds', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'onboard-normalize' });

    const invertedWindow = await memoirMutate(persona.ctx, 'post', '/api/v1/account/onboarding', {
      data: { defaultCurrency: 'USD', timezone: 'UTC', scheduleStartMin: 1380, scheduleEndMin: 360 },
    });
    await expectValidationError(invertedWindow);

    const unresolvableTimezone = await memoirMutate(persona.ctx, 'post', '/api/v1/account/onboarding', {
      data: { defaultCurrency: 'USD', timezone: 'Not/AZone', scheduleStartMin: 360, scheduleEndMin: 1380 },
    });
    await expectValidationError(unresolvableTimezone);

    const onboarded = await memoirMutate(persona.ctx, 'post', '/api/v1/account/onboarding', {
      data: { defaultCurrency: 'usd', enabledCurrencies: ['eur', 'aud'], timezone: 'Europe/London', scheduleStartMin: 360, scheduleEndMin: 1380 },
    });
    expect(onboarded.status(), await onboarded.text()).toBe(200);
    const account = (await onboarded.json()) as AccountView;
    expect(account.defaultCurrency, 'defaultCurrency is uppercased').toBe('USD');
    expect(new Set(account.enabledCurrencies), 'the default plus the extras, each uppercased').toEqual(new Set(['USD', 'EUR', 'AUD']));
    expect(account.timezone, 'timezone is stored verbatim, no casing/normalization applied').toBe('Europe/London');
    expect(account.onboardingCompletedAt).not.toBeNull();
  });
});

test.describe('memoir re-onboarding', () => {
  test('should reject a second onboarding call 409 ACC_003 without mutating the already-onboarded account', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'reonboard', onboard: true });
    const before = await getAccount(persona.ctx);

    const second = await memoirMutate(persona.ctx, 'post', '/api/v1/account/onboarding', {
      data: { defaultCurrency: 'EUR', timezone: 'Asia/Tokyo', scheduleStartMin: 0, scheduleEndMin: 600 },
    });
    expect(second.status(), await second.text()).toBe(409);
    expect(await errorCodeOf(second)).toBe('ACC_003');

    const after = await getAccount(persona.ctx);
    expect(after.defaultCurrency, 'the refused call must not have changed the currency').toBe(before.defaultCurrency);
    expect(after.timezone, 'the refused call must not have changed the timezone').toBe(before.timezone);
    expect(after.onboardingCompletedAt).toBe(before.onboardingCompletedAt);

    const stillWorks = await memoirMutate(persona.ctx, 'patch', '/api/v1/account', { data: { weekStart: before.weekStart === 3 ? 4 : 3 } });
    expect(stillWorks.status(), await stillWorks.text()).toBe(200);
  });
});

test.describe('memoir account immutable fields', () => {
  const IMMUTABLE_CASES: readonly { field: string; value: unknown }[] = [
    { field: 'authProvider', value: 'apple' },
    { field: 'defaultCurrency', value: 'EUR' },
    { field: 'createdAt', value: new Date().toISOString() },
    { field: 'updatedAt', value: new Date().toISOString() },
  ];

  for (const { field, value } of IMMUTABLE_CASES) {
    test(`should reject PATCH /account changing ${field} with 400 ACC_004, leaving it and updatedAt unchanged`, async ({ memoir }) => {
      const persona = await memoir.persona({ label: `immutable-${field}` });
      const before = await getAccount(persona.ctx);

      const response = await memoirMutate(persona.ctx, 'patch', '/api/v1/account', { data: { [field]: value } });
      expect(response.status(), await response.text()).toBe(400);
      expect(await errorCodeOf(response)).toBe('ACC_004');

      const after = await getAccount(persona.ctx);
      expect(after[field], `${field} must not have moved`).toBe(before[field]);
      expect(after.updatedAt, 'a refused patch must not touch updatedAt').toBe(before.updatedAt);
    });
  }

  test('should still accept an ordinary PATCH once an immutable-field attempt is refused', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'immutable-recovers', onboard: true });
    const refused = await memoirMutate(persona.ctx, 'patch', '/api/v1/account', { data: { authProvider: 'apple' } });
    expect(refused.status(), await refused.text()).toBe(400);

    const response = await memoirMutate(persona.ctx, 'patch', '/api/v1/account', { data: { weekStart: 5 } });
    expect(response.status(), await response.text()).toBe(200);
    expect(((await response.json()) as AccountView).weekStart).toBe(5);
  });
});

test.describe('memoir account pending fields', () => {
  test('should stage timezone/intensityMode as pendingTimezone/pendingIntensityMode without changing the live values', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'pending-stage', onboard: true });
    const before = await getAccount(persona.ctx);
    expect(before.timezone).toBe('UTC');
    expect(before.intensityMode).toBe('standard');
    expect(before.pendingTimezone ?? null).toBeNull();
    expect(before.pendingIntensityMode ?? null).toBeNull();

    const response = await memoirMutate(persona.ctx, 'patch', '/api/v1/account', { data: { timezone: 'Europe/London', intensityMode: 'low_intensity' } });
    expect(response.status(), await response.text()).toBe(200);
    const patched = (await response.json()) as AccountView;
    expect(patched.timezone, 'the live timezone must not move until rollover applies it').toBe('UTC');
    expect(patched.intensityMode, 'the live intensityMode must not move until rollover applies it').toBe('standard');
    expect(patched.pendingTimezone).toBe('Europe/London');
    expect(patched.pendingIntensityMode).toBe('low_intensity');

    const after = await getAccount(persona.ctx);
    expect(after.timezone).toBe('UTC');
    expect(after.intensityMode).toBe('standard');
    expect(after.pendingTimezone).toBe('Europe/London');
    expect(after.pendingIntensityMode).toBe('low_intensity');
  });
});

test.describe('memoir account patch', () => {
  test('should merge partial notificationPrefs, bound weekStart/returnerThresholdDays, and store/clear/reject monthlyBudgetMinor', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'patch-fields', onboard: true });
    const ctx = persona.ctx;

    await test.step('notificationPrefs merges rather than resets', async () => {
      const first = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { notificationPrefs: { weeklyDigest: true } } });
      expect(first.status(), await first.text()).toBe(200);
      expect(((await first.json()) as AccountView).notificationPrefs).toEqual({ weeklyDigest: true, aiReadiness: false, billingReminders: false });

      const second = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { notificationPrefs: { aiReadiness: true } } });
      expect(second.status(), await second.text()).toBe(200);
      expect(((await second.json()) as AccountView).notificationPrefs, 'the earlier weeklyDigest:true must survive an unrelated-category patch').toEqual({
        weeklyDigest: true,
        aiReadiness: true,
        billingReminders: false,
      });
    });

    await test.step('weekStart accepts 0-6 and rejects outside it, leaving the prior value', async () => {
      for (const weekStart of [0, 6]) {
        const response = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { weekStart } });
        expect(response.status(), await response.text()).toBe(200);
        expect(((await response.json()) as AccountView).weekStart).toBe(weekStart);
      }
      const before = await getAccount(ctx);
      for (const weekStart of [-1, 7]) await expectValidationError(await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { weekStart } }));
      expect((await getAccount(ctx)).weekStart).toBe(before.weekStart);

      const recovered = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { weekStart: 3 } });
      expect(recovered.status(), await recovered.text()).toBe(200);
      expect(((await recovered.json()) as AccountView).weekStart, 'a legitimate weekStart still applies after the refused attempts').toBe(3);
    });

    await test.step('returnerThresholdDays accepts 1-90 and rejects outside it, leaving the prior value', async () => {
      for (const returnerThresholdDays of [1, 90]) {
        const response = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { returnerThresholdDays } });
        expect(response.status(), await response.text()).toBe(200);
        expect(((await response.json()) as AccountView).returnerThresholdDays).toBe(returnerThresholdDays);
      }
      const before = await getAccount(ctx);
      for (const returnerThresholdDays of [0, 91]) await expectValidationError(await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { returnerThresholdDays } }));
      expect((await getAccount(ctx)).returnerThresholdDays).toBe(before.returnerThresholdDays);

      const recovered = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { returnerThresholdDays: 14 } });
      expect(recovered.status(), await recovered.text()).toBe(200);
      expect(((await recovered.json()) as AccountView).returnerThresholdDays, 'a legitimate returnerThresholdDays still applies after the refused attempts').toBe(14);
    });

    await test.step('monthlyBudgetMinor is stored, left untouched by an unrelated patch, cleared by null, and rejects a negative or fractional value', async () => {
      const stored = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { monthlyBudgetMinor: 50_000 } });
      expect(stored.status(), await stored.text()).toBe(200);
      expect(((await stored.json()) as AccountView).monthlyBudgetMinor).toBe(50_000);

      const unrelated = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { theme: 'dark' } });
      expect(unrelated.status(), await unrelated.text()).toBe(200);
      expect(((await unrelated.json()) as AccountView).monthlyBudgetMinor).toBe(50_000);

      for (const monthlyBudgetMinor of [-1, 10.5]) await expectValidationError(await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { monthlyBudgetMinor } }));
      expect((await getAccount(ctx)).monthlyBudgetMinor).toBe(50_000);

      const cleared = await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { monthlyBudgetMinor: null } });
      expect(cleared.status(), await cleared.text()).toBe(200);
      expect(((await cleared.json()) as AccountView).monthlyBudgetMinor).toBeNull();
    });
  });
});

test.describe('memoir account defaults', () => {
  test('should default every notification category off on a brand-new account', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'notif-defaults' });
    const account = await getAccount(persona.ctx);
    const categories = Object.entries(account.notificationPrefs);
    expect(categories.length, 'notificationPrefs must carry at least one category').toBeGreaterThan(0);
    for (const [category, enabled] of categories) expect(enabled, `${category} must default off`).toBe(false);
  });
});

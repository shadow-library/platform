import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';

import { AccountModule } from '@modules/account';
import { MemoirAuthModule } from '@modules/auth';
import { SyncModule } from '@modules/sync';
import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, AccountModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_account_spec`;

describe('GET/PATCH /api/v1/account and POST /api/v1/account/onboarding (T-17)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;

  async function getAccount(token: string) {
    return router
      .mockRequest()
      .get('/api/v1/account')
      .headers({ authorization: `Bearer ${token}` });
  }

  async function patchAccount(body: Record<string, unknown>, token: string) {
    return router
      .mockRequest()
      .patch('/api/v1/account')
      .headers({ authorization: `Bearer ${token}` })
      .body(body);
  }

  async function accountRow(token: string): Promise<Record<string, unknown>> {
    const response = await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0', domains: 'account' });
    return response.json().domains.account[0];
  }

  async function onboard(body: Record<string, unknown>, token: string) {
    return router
      .mockRequest()
      .post('/api/v1/account/onboarding')
      .headers({ authorization: `Bearer ${token}` })
      .body(body);
  }

  async function freshUser(sub: string): Promise<string> {
    const token = await userToken(sub);
    await getAccount(token);
    return token;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('GET /account', () => {
    it('should expose the onboarding gate as null until onboarding completes', async () => {
      const token = await freshUser('account-gate-sub');
      const response = await getAccount(token);
      expect(response.statusCode).toBe(200);
      expect(response.json().onboardingCompletedAt).toBeNull();
    });

    it('should default notification_prefs to every category OFF', async () => {
      const token = await freshUser('account-notif-defaults-sub');
      const response = await getAccount(token);
      expect(response.json().notificationPrefs).toEqual({ weeklyDigest: false, aiReadiness: false, billingReminders: false });
    });
  });

  describe('POST /account/onboarding', () => {
    it('should set onboardingCompletedAt, lock the currency, and reject a second call', async () => {
      const token = await freshUser('account-onboard-sub');
      const body = { defaultCurrency: 'usd', enabledCurrencies: ['eur'], timezone: 'Asia/Kolkata', scheduleStartMin: 360, scheduleEndMin: 1380 };

      const first = await onboard(body, token);
      expect(first.statusCode).toBe(200);
      expect(first.json().onboardingCompletedAt).not.toBeNull();
      expect(first.json().defaultCurrency).toBe('USD');
      expect(first.json().enabledCurrencies.sort()).toEqual(['EUR', 'USD']);
      expect(first.json().timezone).toBe('Asia/Kolkata');

      const second = await onboard(body, token);
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ code: 'ACC_003' });
    });

    it('should clear the monthly budget when onboarding changes the currency', async () => {
      const token = await freshUser('account-onboard-budget-currency-sub');
      const before = await getAccount(token);
      expect(before.json().defaultCurrency).not.toBe('JPY');
      await patchAccount({ monthlyBudgetMinor: 160000 }, token);

      const onboarded = await onboard({ defaultCurrency: 'JPY', timezone: 'Asia/Tokyo', scheduleStartMin: 360, scheduleEndMin: 1380 }, token);
      expect(onboarded.statusCode).toBe(200);
      expect(onboarded.json().monthlyBudgetMinor).toBeNull();
      expect((await accountRow(token))['monthlyBudgetMinor']).toBeNull();
    });

    it('should keep the monthly budget when onboarding keeps the currency', async () => {
      const token = await freshUser('account-onboard-budget-same-sub');
      const currency = (await getAccount(token)).json().defaultCurrency as string;
      await patchAccount({ monthlyBudgetMinor: 160000 }, token);

      const onboarded = await onboard({ defaultCurrency: currency.toLowerCase(), timezone: 'UTC', scheduleStartMin: 360, scheduleEndMin: 1380 }, token);
      expect(onboarded.json().monthlyBudgetMinor).toBe(160000);
    });

    it('should reject an inverted schedule window', async () => {
      const token = await freshUser('account-onboard-bad-window-sub');
      const response = await onboard({ defaultCurrency: 'USD', timezone: 'UTC', scheduleStartMin: 800, scheduleEndMin: 400 }, token);
      expect(response.statusCode).toBe(422);
    });

    it('should reject an unresolvable IANA timezone', async () => {
      const token = await freshUser('account-onboard-bad-tz-sub');
      const response = await onboard({ defaultCurrency: 'USD', timezone: 'Nowhere/Imaginary', scheduleStartMin: 360, scheduleEndMin: 1380 }, token);
      expect(response.statusCode).toBe(422);
    });
  });

  describe('PATCH /account immutability', () => {
    it('should reject auth_provider', async () => {
      const token = await freshUser('account-immut-provider-sub');
      const response = await patchAccount({ authProvider: 'apple' }, token);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'ACC_004' });
    });

    it('should reject default_currency even after onboarding', async () => {
      const token = await freshUser('account-immut-currency-sub');
      await onboard({ defaultCurrency: 'USD', timezone: 'UTC', scheduleStartMin: 360, scheduleEndMin: 1380 }, token);
      const response = await patchAccount({ defaultCurrency: 'EUR' }, token);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'ACC_004' });
    });

    it('should reject createdAt and updatedAt', async () => {
      const token = await freshUser('account-immut-timestamps-sub');
      const response = await patchAccount({ createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }, token);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'ACC_004' });
    });
  });

  describe('PATCH /account — deferred-apply preferences', () => {
    it('should stage a timezone change without applying it, visible as pendingTimezone', async () => {
      const token = await freshUser('account-tz-defer-sub');
      const before = await getAccount(token);
      expect(before.json().timezone).toBe('UTC');

      const patched = await patchAccount({ timezone: 'Europe/Berlin' }, token);
      expect(patched.statusCode).toBe(200);
      expect(patched.json().timezone).toBe('UTC');
      expect(patched.json().pendingTimezone).toBe('Europe/Berlin');

      const after = await getAccount(token);
      expect(after.json().timezone).toBe('UTC');
      expect(after.json().pendingTimezone).toBe('Europe/Berlin');
    });

    it('should stage an intensity-mode change without applying it, visible as pendingIntensityMode', async () => {
      const token = await freshUser('account-intensity-defer-sub');
      const before = await getAccount(token);
      expect(before.json().intensityMode).toBe('standard');

      const patched = await patchAccount({ intensityMode: 'low_intensity' }, token);
      expect(patched.statusCode).toBe(200);
      expect(patched.json().intensityMode).toBe('standard');
      expect(patched.json().pendingIntensityMode).toBe('low_intensity');
    });
  });

  describe('PATCH /account — preferences', () => {
    it('should merge a partial notification_prefs update, preserving the other categories', async () => {
      const token = await freshUser('account-notif-patch-sub');
      const first = await patchAccount({ notificationPrefs: { weeklyDigest: true } }, token);
      expect(first.json().notificationPrefs).toEqual({ weeklyDigest: true, aiReadiness: false, billingReminders: false });

      const second = await patchAccount({ notificationPrefs: { aiReadiness: true } }, token);
      expect(second.json().notificationPrefs).toEqual({ weeklyDigest: true, aiReadiness: true, billingReminders: false });
    });

    it('should accept week_start within 0-6 and reject out of bounds', async () => {
      const token = await freshUser('account-week-start-sub');
      const ok = await patchAccount({ weekStart: 6 }, token);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().weekStart).toBe(6);

      const tooLow = await patchAccount({ weekStart: -1 }, token);
      expect(tooLow.statusCode).toBe(422);

      const tooHigh = await patchAccount({ weekStart: 7 }, token);
      expect(tooHigh.statusCode).toBe(422);
    });

    it('should accept returner_threshold_days within 1-90 and reject out of bounds', async () => {
      const token = await freshUser('account-returner-threshold-sub');
      const ok = await patchAccount({ returnerThresholdDays: 14 }, token);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().returnerThresholdDays).toBe(14);

      const tooLow = await patchAccount({ returnerThresholdDays: 0 }, token);
      expect(tooLow.statusCode).toBe(422);

      const tooHigh = await patchAccount({ returnerThresholdDays: 91 }, token);
      expect(tooHigh.statusCode).toBe(422);
    });

    it('should store and clear the monthly budget', async () => {
      const token = await freshUser('account-budget-sub');
      expect((await getAccount(token)).json().monthlyBudgetMinor).toBeNull();

      const stored = await patchAccount({ monthlyBudgetMinor: 160000 }, token);
      expect(stored.statusCode).toBe(200);
      expect(stored.json().monthlyBudgetMinor).toBe(160000);
      expect((await accountRow(token))['monthlyBudgetMinor']).toBe(160000);

      const untouched = await patchAccount({ weekStart: 0 }, token);
      expect(untouched.json().monthlyBudgetMinor).toBe(160000);

      const cleared = await patchAccount({ monthlyBudgetMinor: null }, token);
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().monthlyBudgetMinor).toBeNull();
      expect((await accountRow(token))['monthlyBudgetMinor']).toBeNull();
    });

    it('should reject a negative budget', async () => {
      const token = await freshUser('account-budget-negative-sub');
      await patchAccount({ monthlyBudgetMinor: 5000 }, token);

      const negative = await patchAccount({ monthlyBudgetMinor: -1 }, token);
      expect(negative.statusCode).toBe(422);
      expect(negative.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Validation Error',
        fields: [{ field: 'body.monthlyBudgetMinor', msg: 'monthlyBudgetMinor must be a whole number of minor units, zero or more' }],
      });

      const fractional = await patchAccount({ monthlyBudgetMinor: 12.5 }, token);
      expect(fractional.statusCode).toBe(422);

      expect((await getAccount(token)).json().monthlyBudgetMinor).toBe(5000);
    });
  });
});

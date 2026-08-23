import '@server/bootstrap';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { DeterministicOcrStructuringClient, OCR_STRUCTURING_FORCED_FAILURE, OcrModule, OcrStructuringClient } from '@modules/ocr';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, OcrModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_ocr_spec`;

describe('OCR endpoint & quota (T-27)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalCap = Config.get('quotas.ocr-daily');
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subject = 0;

  function parseRequest(token: string, extractedText = 'total $12.34 at Test Merchant') {
    return router
      .mockRequest()
      .post('/api/v1/ocr/parse')
      .headers({ authorization: `Bearer ${token}` })
      .body({ extractedText });
  }

  function quotaRequest(token: string) {
    return router
      .mockRequest()
      .get('/api/v1/ocr/quota')
      .headers({ authorization: `Bearer ${token}` });
  }

  async function freshUser(sub: string): Promise<{ token: string; accountId: bigint }> {
    subject += 1;
    const token = await userToken(`${sub}-${subject}`);
    await quotaRequest(token);
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.identitySub, `${sub}-${subject}`));
    return { token, accountId: account!.id };
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule, { overrides: [{ token: OcrStructuringClient, useClass: DeterministicOcrStructuringClient }] });
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
  });

  afterEach(() => {
    Config['cache'].set('quotas.ocr-daily', originalCap);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should return a structured result and consume one scan on a successful parse', async () => {
    const { token, accountId } = await freshUser('ocr-happy');
    const response = await parseRequest(token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ amount: '12.34', merchant: 'Test Merchant', category: 'food', confidence: 0.92 });

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    expect(account!.ocrQuotaCount).toBe(1);
  });

  it('should reject quota exhaustion with a 429 carrying the next local-midnight reset time', async () => {
    Config['cache'].set('quotas.ocr-daily', 2);
    const { token, accountId } = await freshUser('ocr-exhaust');

    expect((await parseRequest(token)).statusCode).toBe(200);
    expect((await parseRequest(token)).statusCode).toBe(200);
    const third = await parseRequest(token);

    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('OCR_001');
    expect(third.json().message).toContain('resets at');

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    expect(account!.ocrQuotaCount).toBe(2);

    const quota = await quotaRequest(token);
    expect(quota.json()).toMatchObject({ cap: 2, used: 2, remaining: 0 });
    expect(new Date(quota.json().resetAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should let exactly cap concurrent parse requests succeed and reject the rest, never exceeding the cap', async () => {
    Config['cache'].set('quotas.ocr-daily', 3);
    const { token, accountId } = await freshUser('ocr-concurrent');

    const responses = await Promise.all(Array.from({ length: 10 }, () => parseRequest(token)));
    const succeeded = responses.filter(response => response.statusCode === 200);
    const rejected = responses.filter(response => response.statusCode === 429);

    expect(succeeded).toHaveLength(3);
    expect(rejected).toHaveLength(7);

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    expect(account!.ocrQuotaCount).toBe(3);
  });

  it('should still consume quota when the structuring call fails', async () => {
    const { token, accountId } = await freshUser('ocr-failed-parse');

    const response = await parseRequest(token, OCR_STRUCTURING_FORCED_FAILURE);
    expect(response.statusCode).toBe(503);

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    expect(account!.ocrQuotaCount).toBe(1);
  });

  it("should reset the count at the account's local midnight, not a fixed 24h window", async () => {
    Config['cache'].set('quotas.ocr-daily', 1);
    const { token, accountId } = await freshUser('ocr-day-roll');

    expect((await parseRequest(token)).statusCode).toBe(200);
    expect((await parseRequest(token)).statusCode).toBe(429);

    await db.update(schema.accounts).set({ ocrQuotaDate: '2020-01-01' }).where(eq(schema.accounts.id, accountId));

    const afterRoll = await parseRequest(token);
    expect(afterRoll.statusCode).toBe(200);

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    expect(account!.ocrQuotaCount).toBe(1);
    expect(account!.ocrQuotaDate).not.toBe('2020-01-01');
  });

  describe('unconfigured structuring client', () => {
    let unconfiguredApp: ShadowApplication;
    let unconfiguredRouter: FastifyRouter;

    beforeAll(async () => {
      unconfiguredApp = await ShadowFactory.create(TestAppModule);
      unconfiguredRouter = unconfiguredApp.get(Dispatcher) as FastifyRouter;
    });

    afterAll(async () => {
      await unconfiguredApp.stop();
    });

    it('should return a SERVICE_UNAVAILABLE-class error and still consume the attempt — never fabricate a result', async () => {
      const token = await userToken('ocr-unconfigured-sub');
      await unconfiguredRouter
        .mockRequest()
        .get('/api/v1/ocr/quota')
        .headers({ authorization: `Bearer ${token}` });
      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, 'ocr-unconfigured-sub'));

      const response = await unconfiguredRouter
        .mockRequest()
        .post('/api/v1/ocr/parse')
        .headers({ authorization: `Bearer ${token}` })
        .body({ extractedText: 'total $9.99' });

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('OCR_002');

      const [updated] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, account!.id));
      expect(updated!.ocrQuotaCount).toBe(1);
    });
  });
});

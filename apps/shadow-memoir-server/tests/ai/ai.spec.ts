import '@server/bootstrap';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AiModule } from '@modules/ai';
import { MemoirAuthModule } from '@modules/auth';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, AiModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_ai_spec`;

describe('AI: schema & user surface (T-32)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalFreeCap = Config.get('quotas.ai-free-monthly');
  const originalPaidCap = Config.get('quotas.ai-paid-daily');
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subject = 0;

  function submitTask(token: string, id: string, queryText = 'why do I keep missing evening quests?') {
    return router
      .mockRequest()
      .post('/api/v1/ai/tasks')
      .headers({ authorization: `Bearer ${token}` })
      .body({ id, queryText });
  }

  function cancelTask(token: string, id: string) {
    return router
      .mockRequest()
      .post(`/api/v1/ai/tasks/${id}/cancel`)
      .headers({ authorization: `Bearer ${token}` });
  }

  function getConsents(token: string) {
    return router
      .mockRequest()
      .get('/api/v1/ai/consents')
      .headers({ authorization: `Bearer ${token}` });
  }

  function putConsents(token: string, grants: { dataClass: string; granted: boolean }[]) {
    return router
      .mockRequest()
      .put('/api/v1/ai/consents')
      .headers({ authorization: `Bearer ${token}` })
      .body({ grants });
  }

  function putScheduledQuery(token: string, queryText = 'how am I trending this month?') {
    return router
      .mockRequest()
      .put('/api/v1/ai/scheduled-query')
      .headers({ authorization: `Bearer ${token}` })
      .body({ queryText, active: true });
  }

  function applySuggestion(token: string, resultId: bigint, suggestionIndex: number) {
    return router
      .mockRequest()
      .post(`/api/v1/ai/results/${resultId}/apply`)
      .headers({ authorization: `Bearer ${token}` })
      .body({ suggestionIndex });
  }

  async function freshUser(sub: string): Promise<{ token: string; accountId: bigint }> {
    subject += 1;
    const token = await userToken(`${sub}-${subject}`);
    await getConsents(token);
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.identitySub, `${sub}-${subject}`));
    return { token, accountId: account!.id };
  }

  async function markPaid(accountId: bigint): Promise<void> {
    await db
      .insert(schema.entitlements)
      .values({ accountId, tier: 'paid', state: 'active' })
      .onConflictDoUpdate({ target: schema.entitlements.accountId, set: { tier: 'paid', state: 'active' } });
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
  });

  beforeEach(() => {
    Config['cache'].set('quotas.ai-free-monthly', originalFreeCap);
    Config['cache'].set('quotas.ai-paid-daily', originalPaidCap);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('quotas.ai-free-monthly', originalFreeCap);
    Config['cache'].set('quotas.ai-paid-daily', originalPaidCap);
    await dropDatabase(databaseName);
  });

  describe('submission quota', () => {
    it('should block a free-tier third submission in the calendar month with a paywall error and write zero rows for it', async () => {
      Config['cache'].set('quotas.ai-free-monthly', 2);
      const { token, accountId } = await freshUser('ai-paywall');

      expect((await submitTask(token, Bun.randomUUIDv7())).statusCode).toBe(201);
      expect((await submitTask(token, Bun.randomUUIDv7())).statusCode).toBe(201);

      const thirdId = Bun.randomUUIDv7();
      const third = await submitTask(token, thirdId);
      expect(third.statusCode).toBe(402);
      expect(third.json().code).toBe('AI_001');

      const rows = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId));
      expect(rows).toHaveLength(2);
      expect(rows.some(row => row.id === thirdId)).toBe(false);
    });

    it('should reject a paid-tier submission past the daily soft cap', async () => {
      Config['cache'].set('quotas.ai-paid-daily', 1);
      const { token, accountId } = await freshUser('ai-paid-cap');
      await markPaid(accountId);

      expect((await submitTask(token, Bun.randomUUIDv7())).statusCode).toBe(201);
      const second = await submitTask(token, Bun.randomUUIDv7());
      expect(second.statusCode).toBe(429);
      expect(second.json().code).toBe('AI_002');
    });
  });

  describe('client-UUID dedupe', () => {
    it('should converge a resubmitted task id on the first submission without a duplicate row or double quota consumption', async () => {
      Config['cache'].set('quotas.ai-free-monthly', 5);
      const { token, accountId } = await freshUser('ai-dedupe');
      const id = Bun.randomUUIDv7();

      const first = await submitTask(token, id, 'first phrasing');
      const second = await submitTask(token, id, 'first phrasing');
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(first.json().id).toBe(second.json().id);

      const rows = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.quotaConsumed).toBe(true);
    });

    it('should converge concurrent duplicate-tap submissions of the same id on exactly one task row', async () => {
      Config['cache'].set('quotas.ai-free-monthly', 5);
      const { token, accountId } = await freshUser('ai-dedupe-concurrent');
      const id = Bun.randomUUIDv7();

      const responses = await Promise.all(Array.from({ length: 5 }, () => submitTask(token, id)));
      expect(responses.every(response => response.statusCode === 201)).toBe(true);
      const ids = new Set(responses.map(response => response.json().id));
      expect(ids.size).toBe(1);

      const rows = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId));
      expect(rows).toHaveLength(1);
    });
  });

  describe('cancel', () => {
    it('should refund quota when cancelling a still-pending task', async () => {
      Config['cache'].set('quotas.ai-free-monthly', 1);
      const { token, accountId } = await freshUser('ai-cancel-refund');
      const id = Bun.randomUUIDv7();

      expect((await submitTask(token, id)).statusCode).toBe(201);
      expect((await submitTask(token, Bun.randomUUIDv7())).statusCode).toBe(402);

      const cancelled = await cancelTask(token, id);
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().status).toBe('cancelled');

      const [row] = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.id, id));
      expect(row!.quotaConsumed).toBe(false);

      const resubmitted = await submitTask(token, Bun.randomUUIDv7());
      expect(resubmitted.statusCode).toBe(201);
      void accountId;
    });

    it('should reject cancelling a task the worker has already claimed, leaving it running and quota still consumed', async () => {
      const { token } = await freshUser('ai-cancel-claimed');
      const id = Bun.randomUUIDv7();
      expect((await submitTask(token, id)).statusCode).toBe(201);

      await db.update(schema.aiTasks).set({ status: 'running', claimedBy: 'test-worker', claimedAt: new Date() }).where(eq(schema.aiTasks.id, id));

      const cancelled = await cancelTask(token, id);
      expect(cancelled.statusCode).toBe(409);
      expect(cancelled.json().code).toBe('AI_004');

      const [row] = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.id, id));
      expect(row!.status).toBe('running');
      expect(row!.quotaConsumed).toBe(true);
    });

    it('should return 404 cancelling a task id the caller never submitted', async () => {
      const { token } = await freshUser('ai-cancel-missing');
      const missing = await cancelTask(token, Bun.randomUUIDv7());
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('AI_003');
    });

    it('should keep quota consumption consistent under concurrent submit-and-cancel races', async () => {
      Config['cache'].set('quotas.ai-free-monthly', 3);
      const { token, accountId } = await freshUser('ai-cancel-race');
      const firstId = Bun.randomUUIDv7();
      const secondId = Bun.randomUUIDv7();
      expect((await submitTask(token, firstId)).statusCode).toBe(201);
      expect((await submitTask(token, secondId)).statusCode).toBe(201);

      await Promise.all([cancelTask(token, firstId), submitTask(token, Bun.randomUUIDv7())]);

      const rows = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId));
      const consumedCount = rows.filter(row => row.quotaConsumed).length;
      const liveCount = rows.filter(row => row.status !== 'cancelled' && row.status !== 'failed').length;
      expect(consumedCount).toBe(liveCount);
    });
  });

  describe('consents', () => {
    it('should reflect a consent withdrawal in the very next read', async () => {
      const { token } = await freshUser('ai-consent');

      const granted = await putConsents(token, [{ dataClass: 'journal_reflection_reason', granted: true }]);
      expect(granted.statusCode).toBe(200);
      const grantedEntry = granted.json().consents.find((entry: { dataClass: string }) => entry.dataClass === 'journal_reflection_reason');
      expect(grantedEntry.granted).toBe(true);

      const withdrawn = await putConsents(token, [{ dataClass: 'journal_reflection_reason', granted: false }]);
      const withdrawnEntry = withdrawn.json().consents.find((entry: { dataClass: string }) => entry.dataClass === 'journal_reflection_reason');
      expect(withdrawnEntry.granted).toBe(false);
      expect(withdrawnEntry.withdrawnAt).not.toBeNull();

      const read = await getConsents(token);
      const readEntry = read.json().consents.find((entry: { dataClass: string }) => entry.dataClass === 'journal_reflection_reason');
      expect(readEntry.granted).toBe(false);
    });

    it('should report every known data class as ungranted before any PUT', async () => {
      const { token } = await freshUser('ai-consent-default');
      const response = await getConsents(token);
      expect(response.json().consents).toHaveLength(2);
      expect(response.json().consents.every((entry: { granted: boolean }) => entry.granted === false)).toBe(true);
    });
  });

  describe('scheduled query', () => {
    it('should reject a free-tier PUT to the scheduled query with a paywall error', async () => {
      const { token } = await freshUser('ai-scheduled-free');
      const response = await putScheduledQuery(token);
      expect(response.statusCode).toBe(402);
      expect(response.json().code).toBe('AI_005');
    });

    it('should accept a paid-tier PUT to the scheduled query and allow DELETE', async () => {
      const { token, accountId } = await freshUser('ai-scheduled-paid');
      await markPaid(accountId);

      const put = await putScheduledQuery(token);
      expect(put.statusCode).toBe(200);
      expect(put.json().active).toBe(true);

      const removed = await router
        .mockRequest()
        .delete('/api/v1/ai/scheduled-query')
        .headers({ authorization: `Bearer ${token}` });
      expect(removed.statusCode).toBe(204);

      const [row] = await db.select().from(schema.aiScheduledQueries).where(eq(schema.aiScheduledQueries.accountId, accountId));
      expect(row).toBeUndefined();
    });
  });

  describe('delta domains', () => {
    it('should surface a submitted task, its consent, and its scheduled query through /sync/delta', async () => {
      const { token, accountId } = await freshUser('ai-delta');
      await markPaid(accountId);

      await submitTask(token, Bun.randomUUIDv7());
      await putConsents(token, [{ dataClass: 'health', granted: true }]);
      await putScheduledQuery(token);

      const response = await router
        .mockRequest()
        .get('/api/v1/sync/delta')
        .query({ since: '0' })
        .headers({ authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(200);
      const domains = response.json().domains;
      expect(domains.ai_tasks).toHaveLength(1);
      expect(domains.ai_consents).toHaveLength(1);
      expect(domains.ai_scheduled_queries).toHaveLength(1);
    });
  });

  describe('apply suggestion', () => {
    async function seedResultWithSuggestion(accountId: bigint): Promise<{ resultId: bigint; questId: bigint }> {
      const [quest] = await db
        .insert(schema.quests)
        .values({ accountId, name: 'Evening reading', durationMin: 20, statAffinity: 'mind', strictness: 'routine', recurrence: { type: 'daily' } })
        .returning();
      const taskId = Bun.randomUUIDv7();
      await db.insert(schema.aiTasks).values({ id: taskId, accountId, queryText: 'why do I miss this quest', status: 'done', expectedBy: new Date() });
      const [result] = await db
        .insert(schema.aiResults)
        .values({
          accountId,
          taskId,
          answer: 'You tend to miss this quest after 8pm.',
          suggestions: [{ questId: String(quest!.id), summary: 'Move the quest 30 minutes earlier' }],
          modelId: 'llama3.1',
          promptVersion: 'v1',
        })
        .returning();
      return { resultId: result!.id, questId: quest!.id };
    }

    it('should record applied_suggestions exactly once under a replayed apply call', async () => {
      const { token, accountId } = await freshUser('ai-apply');
      const { resultId, questId } = await seedResultWithSuggestion(accountId);

      const first = await applySuggestion(token, resultId, 0);
      expect(first.statusCode).toBe(200);
      expect(first.json().questId).toBe(String(questId));

      const second = await applySuggestion(token, resultId, 0);
      expect(second.statusCode).toBe(200);
      expect(second.json().id).toBe(first.json().id);

      const rows = await db
        .select()
        .from(schema.appliedSuggestions)
        .where(and(eq(schema.appliedSuggestions.resultId, resultId), eq(schema.appliedSuggestions.suggestionIndex, 0)));
      expect(rows).toHaveLength(1);
    });

    it('should 404 when applying a suggestion index the result does not carry', async () => {
      const { token, accountId } = await freshUser('ai-apply-oob');
      const { resultId } = await seedResultWithSuggestion(accountId);

      const response = await applySuggestion(token, resultId, 5);
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('AI_007');
    });
  });
});

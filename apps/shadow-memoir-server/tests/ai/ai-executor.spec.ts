import '@server/bootstrap';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AiExecutorService, AiWorkerModule, scheduledTaskId } from '@modules/ai-worker';
import { InferenceClient } from '@modules/inference';
import { MemoirAuthModule } from '@modules/auth';
import { DatastoreModule, type PrimaryDatabase, RolePoolService, schema } from '@server/database';
import { ScriptedInferenceClient } from '@tests/fixtures/inference';
import { TEST_ROLE_PASSWORD } from '@tests/fixtures/seed';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

/** `MemoirAuthModule` (reached through `BillingModule`) resolves `ContextService` from the HTTP core, so the worker graph still boots behind a router even though nothing here serves a request. */
const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, AiWorkerModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const INSUFFICIENT_PRIVILEGE = '42501';
const JOURNAL_TEXT = 'the standup ran long again and by the time it ended I had nothing left for the evening run';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_ai_executor_spec`;

function roleUrl(role: string): string {
  const { protocol, hostname, port } = new URL(baseConnectionString);
  return `${protocol}//${role}:${TEST_ROLE_PASSWORD}@${hostname}:${port}/${databaseName}`;
}

/** Drizzle wraps the driver error, so the SQLSTATE the grant layer refused with sits on the cause. */
function sqlState(error: unknown): string | undefined {
  return (error as { cause?: { errno?: string } } | undefined)?.cause?.errno;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? String(entry) : entry));
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

describe('AI batch executor (T-33, ARCHITECTURE §15.2-§15.7)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalAiUrl = Config['cache'].get('database.postgres.ai-url') as string | undefined;
  const originalSchedulerEnabled = Config.get('scheduler.enabled');
  const originalFreeCap = Config.get('quotas.ai-free-monthly');
  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let executor: AiExecutorService;
  let pools: RolePoolService;
  let subject = 0;

  async function createAccount(overrides: Partial<typeof schema.accounts.$inferInsert> = {}): Promise<bigint> {
    subject += 1;
    const [account] = await db
      .insert(schema.accounts)
      .values({ identitySub: `ai-executor-${subject}`, authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC', ...overrides })
      .returning();
    return account!.id;
  }

  async function markPaid(accountId: bigint): Promise<void> {
    await db
      .insert(schema.entitlements)
      .values({ accountId, tier: 'paid', state: 'active' })
      .onConflictDoUpdate({ target: schema.entitlements.accountId, set: { tier: 'paid', state: 'active' } });
  }

  async function markFree(accountId: bigint): Promise<void> {
    await db.update(schema.entitlements).set({ tier: 'free', state: 'lapsed' }).where(eq(schema.entitlements.accountId, accountId));
  }

  /** Submitted a minute in the past by default: the claim predicate is `submitted_at <= now()` evaluated on the database's clock, which a containerized Postgres can hold slightly behind the test process's. */
  async function submitTask(accountId: bigint, queryText = 'why do I keep failing evening quests?', submittedAt = new Date(Date.now() - 60_000)): Promise<string> {
    const id = Bun.randomUUIDv7();
    await db.insert(schema.aiTasks).values({
      id,
      accountId,
      queryText,
      submittedAt,
      expectedBy: new Date(Date.now() + 3_600_000),
      quotaMonth: submittedAt.toISOString().slice(0, 7),
      quotaConsumed: true,
    });
    return id;
  }

  async function taskById(id: string): Promise<typeof schema.aiTasks.$inferSelect> {
    const [row] = await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.id, id));
    return row!;
  }

  async function auditFor(id: string): Promise<(typeof schema.aiTaskAudit.$inferSelect)[]> {
    return db.select().from(schema.aiTaskAudit).where(eq(schema.aiTaskAudit.taskId, id));
  }

  async function seedQuest(accountId: bigint, name = 'Evening run'): Promise<bigint> {
    const [quest] = await db.insert(schema.quests).values({ accountId, name, durationMin: 30, statAffinity: 'body', strictness: 'routine', recurrence: {} }).returning();
    return quest!.id;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    Config['cache'].set('database.postgres.ai-url', roleUrl('memoir_ai'));
    Config['cache'].set('scheduler.enabled', false);

    app = await ShadowFactory.create(TestAppModule, { overrides: [{ token: InferenceClient, useClass: ScriptedInferenceClient }] });
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    executor = app.get(AiExecutorService);
    pools = app.get(RolePoolService);
  });

  beforeEach(() => ScriptedInferenceClient.reset());

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('database.postgres.ai-url', originalAiUrl ?? '');
    Config['cache'].set('scheduler.enabled', originalSchedulerEnabled);
    Config['cache'].set('quotas.ai-free-monthly', originalFreeCap);
    await dropDatabase(databaseName);
  });

  describe('claim and execute', () => {
    it('should claim a pending task, write its result, and mark it done', async () => {
      const accountId = await createAccount();
      const taskId = await submitTask(accountId);

      expect(await executor.drain()).toBe(1);

      const task = await taskById(taskId);
      expect(task.status).toBe('done');
      expect(task.claimedBy).toStartWith('shadow-memoir');
      expect(task.finishedAt).not.toBeNull();

      const [result] = await db.select().from(schema.aiResults).where(eq(schema.aiResults.taskId, taskId));
      expect(result!.answer).toBe(ScriptedInferenceClient.defaultDraft.answer);
      expect(result!.promptVersion).toBe(Config.get('ai.prompt-version'));
      expect(result!.modelId).toBe(Config.get('ai.model'));

      const actions = (await auditFor(taskId)).map(row => row.action);
      expect(actions).toEqual(['claimed', 'read_scope', 'finished']);
    });

    it('should never run a task twice when two claim loops drain the same backlog concurrently', async () => {
      const accountId = await createAccount();
      await markPaid(accountId);
      const taskIds = await Promise.all(Array.from({ length: 6 }, (_, index) => submitTask(accountId, `question ${index}`, new Date(Date.now() - 60_000 - index * 1000))));

      const [first, second] = await Promise.all([executor.drain(), executor.drain()]);
      expect(first + second).toBe(taskIds.length);

      for (const taskId of taskIds) {
        expect((await taskById(taskId)).status).toBe('done');
        expect((await auditFor(taskId)).filter(row => row.action === 'claimed')).toHaveLength(1);
        expect(await db.select().from(schema.aiResults).where(eq(schema.aiResults.taskId, taskId))).toHaveLength(1);
      }
    });
  });

  describe('AI-result-ready notification hook (T-34)', () => {
    it('should enqueue a content-free notification outbox row after a completed task, when the account opted in', async () => {
      const accountId = await createAccount();
      await db
        .update(schema.accounts)
        .set({ notificationPrefs: { aiReadiness: true } })
        .where(eq(schema.accounts.id, accountId));
      const taskId = await submitTask(accountId);

      await executor.drain();

      const [result] = await db.select().from(schema.aiResults).where(eq(schema.aiResults.taskId, taskId));
      const [row] = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.accountId, accountId));
      expect(row).toBeDefined();
      expect(row!.templateKey).toBe('memoir-ai-result-ready');
      expect(row!.variables).toEqual({ resultId: String(result!.id), suggestionCount: (result!.suggestions as unknown[]).length });
    });

    it('should enqueue nothing when the account has not opted in (default OFF)', async () => {
      const accountId = await createAccount();
      await submitTask(accountId);

      await executor.drain();

      expect(await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.accountId, accountId))).toHaveLength(0);
    });
  });

  describe('execution-time revalidation (§15.3)', () => {
    it("should drop a deletion-marked account's task and refund its quota rather than executing it", async () => {
      const accountId = await createAccount({ deletionState: 'pending' });
      const taskId = await submitTask(accountId);

      await executor.drain();

      const task = await taskById(taskId);
      expect(task.status).toBe('cancelled');
      expect(task.quotaConsumed).toBe(false);
      expect(ScriptedInferenceClient.prompts).toHaveLength(0);
      expect((await auditFor(taskId)).map(row => row.action)).toEqual(['claimed', 'refunded']);
    });

    it('should hold a task for upgrade when entitlement lapsed between submission and the run, and resume it on restore', async () => {
      Config['cache'].set('quotas.ai-free-monthly', 2);
      const accountId = await createAccount();
      await markPaid(accountId);
      const submittedAt = new Date(Date.now() - 60_000);
      const taskIds: string[] = [];
      for (let index = 0; index < 3; index++) taskIds.push(await submitTask(accountId, `question ${index}`, new Date(submittedAt.getTime() + index * 1000)));

      await markFree(accountId);
      await executor.drain();

      expect((await taskById(taskIds[0]!)).status).toBe('done');
      expect((await taskById(taskIds[1]!)).status).toBe('done');
      const held = await taskById(taskIds[2]!);
      expect(held.status).toBe('held_upgrade');
      expect(held.quotaConsumed).toBe(true);
      expect(held.claimedAt).toBeNull();

      expect(await executor.resumeHeld()).toBe(0);

      await markPaid(accountId);
      expect(await executor.resumeHeld()).toBe(1);
      expect((await taskById(taskIds[2]!)).status).toBe('pending');

      await executor.drain();
      expect((await taskById(taskIds[2]!)).status).toBe('done');
    });

    it('should hold a scheduled task whose account is no longer paid', async () => {
      const accountId = await createAccount();
      const taskId = Bun.randomUUIDv7();
      await db.insert(schema.aiTasks).values({ id: taskId, accountId, queryText: 'standing question', kind: 'scheduled', expectedBy: new Date(), quotaConsumed: false });

      await executor.drain();
      expect((await taskById(taskId)).status).toBe('held_upgrade');
    });
  });

  describe('consent-scoped read assembly (§15.5, PRD §6.7)', () => {
    it('should exclude journal text from the assembled prompt when the class is not consented', async () => {
      const accountId = await createAccount();
      await db.insert(schema.journalEntries).values({ id: Bun.randomUUIDv7(), accountId, date: daysAgo(1), text: JOURNAL_TEXT, mood: 2 });
      const taskId = await submitTask(accountId);

      await executor.drain();

      expect(ScriptedInferenceClient.prompts[0]!.userPrompt).not.toContain(JOURNAL_TEXT);
      const [readScope] = (await auditFor(taskId)).filter(row => row.action === 'read_scope');
      expect(readScope!.dataClasses).not.toContain('journal_reflection_reason');
    });

    it('should include journal text and reason notes once the class is consented, and say so in the audit row', async () => {
      const accountId = await createAccount();
      const questId = await seedQuest(accountId);
      await db.insert(schema.aiConsents).values({ accountId, dataClass: 'journal_reflection_reason' });
      await db.insert(schema.journalEntries).values({ id: Bun.randomUUIDv7(), accountId, date: daysAgo(1), text: JOURNAL_TEXT, mood: 2 });
      await db.insert(schema.questLogs).values({
        accountId,
        questId,
        date: daysAgo(1),
        state: 'missed',
        statAffinity: 'body',
        strictness: 'routine',
        intensityModeAtLog: 'standard',
        crownSliceWeight: '1.00',
        rulesetVersion: 1,
        reasonNote: 'ran out of time after work',
      });
      const taskId = await submitTask(accountId);

      await executor.drain();

      const prompt = ScriptedInferenceClient.prompts[0]!.userPrompt;
      expect(prompt).toContain(JOURNAL_TEXT);
      expect(prompt).toContain('ran out of time after work');

      const [readScope] = (await auditFor(taskId)).filter(row => row.action === 'read_scope');
      expect(readScope!.dataClasses).toContain('journal_reflection_reason');
      expect(readScope!.rowCounts).toMatchObject({ journal_reflection_reason: 1, quest_logs: 1 });
    });

    it('should reflect a withdrawal made after submission but before the run', async () => {
      const accountId = await createAccount();
      await db.insert(schema.aiConsents).values({ accountId, dataClass: 'journal_reflection_reason' });
      await db.insert(schema.journalEntries).values({ id: Bun.randomUUIDv7(), accountId, date: daysAgo(1), text: JOURNAL_TEXT });
      await submitTask(accountId);

      await db
        .update(schema.aiConsents)
        .set({ withdrawnAt: new Date() })
        .where(and(eq(schema.aiConsents.accountId, accountId), eq(schema.aiConsents.dataClass, 'journal_reflection_reason')));

      await executor.drain();
      expect(ScriptedInferenceClient.prompts[0]!.userPrompt).not.toContain(JOURNAL_TEXT);
    });

    it('should record data classes and row counts only — never content — on the audit row', async () => {
      const accountId = await createAccount();
      await seedQuest(accountId, 'Deep work block');
      const taskId = await submitTask(accountId);

      await executor.drain();

      const [readScope] = (await auditFor(taskId)).filter(row => row.action === 'read_scope');
      expect(readScope!.dataClasses).toEqual(['quests']);
      expect(readScope!.rowCounts).toEqual({ quests: 1 });
      expect(stringify(readScope)).not.toContain('Deep work block');
    });

    it('should bound a free-tier read to the trailing three months while a paid read sees the whole history', async () => {
      const accountId = await createAccount();
      const questId = await seedQuest(accountId);
      for (const date of [daysAgo(5), daysAgo(200)]) {
        await db.insert(schema.questLogs).values({
          accountId,
          questId,
          date,
          state: 'completed',
          statAffinity: 'body',
          strictness: 'routine',
          intensityModeAtLog: 'standard',
          crownSliceWeight: '1.00',
          rulesetVersion: 1,
        });
      }

      const freeTaskId = await submitTask(accountId);
      await executor.drain();
      const [freeScope] = (await auditFor(freeTaskId)).filter(row => row.action === 'read_scope');
      expect(freeScope!.rowCounts).toMatchObject({ quest_logs: 1 });

      await markPaid(accountId);
      const paidTaskId = await submitTask(accountId);
      await executor.drain();
      const [paidScope] = (await auditFor(paidTaskId)).filter(row => row.action === 'read_scope');
      expect(paidScope!.rowCounts).toMatchObject({ quest_logs: 2 });
    });
  });

  describe('guardrails at execution (§28.6)', () => {
    it('should fail the task and refund its quota when the post-filter refuses the answer', async () => {
      const accountId = await createAccount();
      await db.insert(schema.aiConsents).values({ accountId, dataClass: 'journal_reflection_reason' });
      await db.insert(schema.journalEntries).values({ id: Bun.randomUUIDv7(), accountId, date: daysAgo(1), text: JOURNAL_TEXT });
      const taskId = await submitTask(accountId);
      ScriptedInferenceClient.responses = [{ answer: `Your own words: ${JOURNAL_TEXT}`, patterns: [], suggestions: [], limitationNote: null }];

      await executor.drain();

      const task = await taskById(taskId);
      expect(task.status).toBe('failed');
      expect(task.quotaConsumed).toBe(false);
      expect(task.error).toContain('verbatim_quote');
      expect(await db.select().from(schema.aiResults).where(eq(schema.aiResults.taskId, taskId))).toHaveLength(0);
    });

    it('should ship the crisis handoff as an ordinary done result, with nothing in the row or the audit marking the event', async () => {
      const accountId = await createAccount();
      const taskId = await submitTask(accountId, 'I keep thinking I want to die, what should I change?');

      await executor.drain();

      const task = await taskById(taskId);
      expect(task.status).toBe('done');
      expect(task.error).toBeNull();

      const [result] = await db.select().from(schema.aiResults).where(eq(schema.aiResults.taskId, taskId));
      expect(result!.answer).toContain('988');
      expect(result!.suggestions).toEqual([]);

      const audit = await auditFor(taskId);
      expect(audit.map(row => row.action)).toEqual(['claimed', 'read_scope', 'finished']);
      expect(stringify(audit)).not.toMatch(/crisis|self[- ]harm/i);
    });
  });

  describe('failure, retry and recovery', () => {
    it('should requeue a task whose inference attempt failed and refund it once attempts are exhausted', async () => {
      Config['cache'].set('ai.max-attempts', 2);
      const accountId = await createAccount();
      const taskId = await submitTask(accountId);
      ScriptedInferenceClient.responses = [new Error('inference down'), new Error('inference down')];

      await executor.drain();
      let task = await taskById(taskId);
      expect(task.status).toBe('pending');
      expect(task.claimedAt).not.toBeNull();

      await executor.runRetryPoll();
      task = await taskById(taskId);
      expect(task.status).toBe('failed');
      expect(task.quotaConsumed).toBe(false);
      expect((await auditFor(taskId)).some(row => row.action === 'refunded')).toBe(true);

      Config['cache'].set('ai.max-attempts', 3);
    });

    it('should return a stale running claim to pending', async () => {
      const accountId = await createAccount();
      const taskId = await submitTask(accountId);
      await db
        .update(schema.aiTasks)
        .set({ status: 'running', claimedBy: 'dead-worker', claimedAt: new Date(Date.now() - 86_400_000) })
        .where(eq(schema.aiTasks.id, taskId));

      expect(await executor.recoverStuck()).toBe(1);
      expect((await taskById(taskId)).status).toBe('pending');
    });

    it('should only pick up previously-attempted tasks on the retry poll', async () => {
      const accountId = await createAccount();
      const fresh = await submitTask(accountId);

      await executor.drain(true);

      expect((await taskById(fresh)).status).toBe('pending');
      expect(await auditFor(fresh)).toHaveLength(0);
    });
  });

  describe('scheduled-query materialization (§15.7)', () => {
    it('should materialize one task per paid account per night and consume no ad-hoc quota', async () => {
      const accountId = await createAccount();
      await markPaid(accountId);
      await db.insert(schema.aiScheduledQueries).values({ accountId, queryText: 'how did this week go?' });

      const now = new Date();
      expect(await executor.materializeScheduledQueries(now)).toBe(1);

      const [task] = await db
        .select()
        .from(schema.aiTasks)
        .where(eq(schema.aiTasks.id, scheduledTaskId(accountId, now.toISOString().slice(0, 10))));
      expect(task!.kind).toBe('scheduled');
      expect(task!.quotaConsumed).toBe(false);
      expect(task!.quotaMonth).toBeNull();
    });

    it('should be idempotent across reruns of the same night', async () => {
      const accountId = await createAccount();
      await markPaid(accountId);
      await db.insert(schema.aiScheduledQueries).values({ accountId, queryText: 'how did this week go?' });
      const now = new Date();

      expect(await executor.materializeScheduledQueries(now)).toBe(1);
      expect(await executor.materializeScheduledQueries(now)).toBe(0);
      expect(await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId))).toHaveLength(1);
    });

    it('should skip an account that is no longer paid', async () => {
      const accountId = await createAccount();
      await db.insert(schema.aiScheduledQueries).values({ accountId, queryText: 'how did this week go?' });

      expect(await executor.materializeScheduledQueries()).toBe(0);
      expect(await db.select().from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId))).toHaveLength(0);
    });
  });

  describe('worker pool privileges (§5.4, §28.4)', () => {
    it("should refuse a Hero write attempted through the executor's own memoir_ai pool", async () => {
      const accountId = await createAccount();
      const pool = pools.getPool('memoir_ai');

      let thrown: unknown;
      await pool
        .insert(schema.heroEvents)
        .values({ accountId, dedupeKey: 'ai-forged', type: 'quest_complete', xpDelta: 10, coinsDelta: 5, date: daysAgo(0), rulesetVersion: 1 })
        .catch(error => (thrown = error));
      expect(sqlState(thrown)).toBe(INSUFFICIENT_PRIVILEGE);

      thrown = undefined;
      await pool
        .update(schema.accounts)
        .set({ totalXp: 9999n })
        .where(eq(schema.accounts.id, accountId))
        .catch(error => (thrown = error));
      expect(sqlState(thrown)).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

import '@server/bootstrap';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Injectable, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { StorageService } from '@shadow-library/modules';

import { AccountModule } from '@modules/account';
import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { DeletionModule, DeletionRepository, DeletionService, DeletionSweepService, IdentityCloseClient, type IdentityCloseOutcome } from '@modules/deletion';
import { ReceiptsModule } from '@modules/receipts';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { manifestLogRedactionFormat } from '@server/database/log-redaction';
import { pseudoAccountId } from '@server/telemetry';
import { TEST_ROLE_PASSWORD } from '@tests/fixtures/seed';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { AUDIENCE, userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, AccountModule, ReceiptsModule, DeletionModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule, CommandsModule] })
class TestAppModule {}

/** The seam T-30 leaves for identity: the spec drives it directly instead of standing up an identity server. */
let identityCloseOutcome: IdentityCloseOutcome = 'unconfigured';
let identityCloseCalls: string[] = [];

@Injectable()
class StubIdentityCloseClient extends IdentityCloseClient {
  async close(identitySub: string): Promise<IdentityCloseOutcome> {
    identityCloseCalls.push(identitySub);
    return identityCloseOutcome;
  }
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_deletion_spec`;
const DATE = '2026-08-24';

function roleUrl(role: string): string {
  const { protocol, hostname, port } = new URL(baseConnectionString);
  return `${protocol}//${role}:${TEST_ROLE_PASSWORD}@${hostname}:${port}/${databaseName}`;
}

describe('Resumable account deletion (T-30, ARCHITECTURE §21)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-deletion-'));
  const logFile = path.join(logDir, `${Config.get('app.name')}-0.log`);

  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let storage: StorageService;
  let deletionRepository: DeletionRepository;
  let deletionService: DeletionService;
  let sweeps: DeletionSweepService;

  function destructiveToken(sub: string): Promise<string> {
    return userToken(sub, { scopes: ['memoir:sync', 'memoir:account', 'memoir:destructive'], claims: { aal: 'AAL2' } });
  }

  function startDeletion(token: string) {
    return router
      .mockRequest()
      .post('/api/v1/account/deletion')
      .headers({ authorization: `Bearer ${token}` });
  }

  function deletionStatus(token: string) {
    return router
      .mockRequest()
      .get('/api/v1/account/deletion')
      .headers({ authorization: `Bearer ${token}` });
  }

  async function resolveAccount(sub: string): Promise<bigint> {
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/account')
      .headers({ authorization: `Bearer ${token}` });
    const [account] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    return (account as { id: bigint }).id;
  }

  async function putObject(ref: string): Promise<void> {
    const url = storage.getPresignedUploadUrl(ref, { contentType: 'image/jpeg' });
    await fetch(url, { method: 'PUT', body: new TextEncoder().encode('bytes'), headers: { 'Content-Type': 'image/jpeg' } });
  }

  /**
   * One row in each FK-interesting corner of the purge order — the append-only trails (`hero_events`,
   * `ai_task_audit`, `applied_suggestions`), a child of `quests`, a child of `metrics`, and all three
   * `ON DELETE`-less references (`applied_suggestions` → `ai_results`/`quests`, `ai_results` →
   * `ai_tasks`, `expenses` → `subscriptions`) — so a table missing from the order, or ordered after
   * something that points at it, surfaces as a leftover or an FK error rather than as a green pass.
   */
  async function seedAccountData(accountId: bigint): Promise<void> {
    const [quest] = await db
      .insert(schema.quests)
      .values({
        accountId,
        name: 'Seeded quest',
        startTimeMin: 360,
        durationMin: 30,
        statAffinity: 'body',
        strictness: 'anchor',
        recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', end: { kind: 'never' }, exceptions: [] },
      })
      .returning({ id: schema.quests.id });
    const questId = (quest as { id: bigint }).id;

    const [metric] = await db
      .insert(schema.metrics)
      .values({ accountId, name: 'Seeded metric', unit: 'kg', valueType: 'number', direction: 'higher' })
      .returning({ id: schema.metrics.id });
    const metricId = (metric as { id: bigint }).id;

    const [subscription] = await db
      .insert(schema.subscriptions)
      .values({
        accountId,
        name: 'Seeded subscription',
        amountMinor: 1000n,
        amountText: '10.00',
        currency: 'USD',
        frequency: 'monthly',
        billingDay: 1,
        nextDueDate: DATE,
        categoryId: 'other',
        monthlyEquivalentMinor: 1000n,
      })
      .returning({ id: schema.subscriptions.id });
    const subscriptionId = (subscription as { id: bigint }).id;

    await db.insert(schema.questLogs).values({
      accountId,
      questId,
      date: DATE,
      state: 'completed',
      xpAwarded: 12,
      coinsAwarded: 2,
      statAffinity: 'body',
      strictness: 'anchor',
      intensityModeAtLog: 'standard',
      crownSliceWeight: '1.50',
      rulesetVersion: 1,
    });
    await db.insert(schema.questStreaks).values({ accountId, questId, currentRunDays: 1, bestRunDays: 1, shieldsAvailable: 0, completionsTowardShield: 0 });
    await db.insert(schema.heroEvents).values({ accountId, dedupeKey: `seed_${accountId}`, type: 'quest_complete', date: DATE, xpDelta: 10, coinsDelta: 1, rulesetVersion: 1 });
    await db.insert(schema.metricEntries).values({ accountId, metricId, date: DATE, value: '1' });
    await db.insert(schema.expenses).values({
      id: Bun.randomUUIDv7(),
      accountId,
      amountMinor: 500n,
      amountText: '5.00',
      currency: 'USD',
      categoryId: 'other',
      occurredOn: DATE,
      linkedSubscriptionId: subscriptionId,
    });
    await db.insert(schema.journalEntries).values({ id: Bun.randomUUIDv7(), accountId, date: DATE, text: 'seeded' });
    await db.insert(schema.achievementsEarned).values({ accountId, achievementId: 'first-step' });

    const taskId = Bun.randomUUIDv7();
    await db.insert(schema.aiTasks).values({ id: taskId, accountId, queryText: 'seeded question', expectedBy: new Date() });
    const [result] = await db
      .insert(schema.aiResults)
      .values({ accountId, taskId, answer: 'seeded answer', modelId: 'llama3.1', promptVersion: 'v1' })
      .returning({ id: schema.aiResults.id });
    await db.insert(schema.aiTaskAudit).values({ accountId, taskId, action: 'claimed' });
    await db.insert(schema.appliedSuggestions).values({ accountId, resultId: (result as { id: bigint }).id, suggestionIndex: 0, questId, questSnapshotBefore: {} });
    await db.insert(schema.aiScheduledQueries).values({ accountId, queryText: 'seeded standing question' });
    await db.insert(schema.aiConsents).values({ accountId, dataClass: 'journal_reflection_reason' });
    await db.insert(schema.exportJobs).values({ id: Bun.randomUUIDv7(), accountId });
  }

  async function countRows(accountId: bigint): Promise<number> {
    const logs = await db.select({ id: schema.questLogs.id }).from(schema.questLogs).where(eq(schema.questLogs.accountId, accountId));
    const events = await db.select({ id: schema.heroEvents.id }).from(schema.heroEvents).where(eq(schema.heroEvents.accountId, accountId));
    const expenses = await db.select({ id: schema.expenses.id }).from(schema.expenses).where(eq(schema.expenses.accountId, accountId));
    const journals = await db.select({ id: schema.journalEntries.id }).from(schema.journalEntries).where(eq(schema.journalEntries.accountId, accountId));
    const entries = await db.select({ id: schema.metricEntries.id }).from(schema.metricEntries).where(eq(schema.metricEntries.accountId, accountId));
    const exportJobs = await db.select({ id: schema.exportJobs.id }).from(schema.exportJobs).where(eq(schema.exportJobs.accountId, accountId));
    return logs.length + events.length + expenses.length + journals.length + entries.length + exportJobs.length + (await countAiRows(accountId));
  }

  async function countAiRows(accountId: bigint): Promise<number> {
    const tasks = await db.select({ id: schema.aiTasks.id }).from(schema.aiTasks).where(eq(schema.aiTasks.accountId, accountId));
    const results = await db.select({ id: schema.aiResults.id }).from(schema.aiResults).where(eq(schema.aiResults.accountId, accountId));
    const audit = await db.select({ id: schema.aiTaskAudit.id }).from(schema.aiTaskAudit).where(eq(schema.aiTaskAudit.accountId, accountId));
    const applied = await db.select({ id: schema.appliedSuggestions.id }).from(schema.appliedSuggestions).where(eq(schema.appliedSuggestions.accountId, accountId));
    const scheduled = await db.select({ accountId: schema.aiScheduledQueries.accountId }).from(schema.aiScheduledQueries).where(eq(schema.aiScheduledQueries.accountId, accountId));
    const consents = await db.select({ dataClass: schema.aiConsents.dataClass }).from(schema.aiConsents).where(eq(schema.aiConsents.accountId, accountId));
    return tasks.length + results.length + audit.length + applied.length + scheduled.length + consents.length;
  }

  async function setState(accountId: bigint, state: 'pending' | 'blobs_deleted' | 'data_deleted' | 'identity_closed', startedMinutesAgo = 60): Promise<void> {
    await db
      .update(schema.accounts)
      .set({ deletionState: state, deletionStartedAt: new Date(Date.now() - startedMinutesAgo * 60_000) })
      .where(eq(schema.accounts.id, accountId));
  }

  /** `start` hands steps 3–6 to a background driver, so HTTP-level assertions wait for the machine to stop moving rather than racing it. */
  async function settle(accountId: bigint): Promise<string> {
    let previous = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = (await deletionRepository.findState(accountId)) ?? 'done';
      if (state === previous || state === 'done') return state;
      previous = state;
      await Bun.sleep(20);
    }
    return previous;
  }

  async function captureLines(action: () => Promise<unknown>): Promise<Record<string, unknown>[]> {
    const before = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    await action();
    await Bun.sleep(150);
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(before) : '';
    return tail
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as Record<string, unknown>);
  }

  beforeAll(async () => {
    Config['cache'].set('log.dir', logDir);
    Logger['logger'].level = 'info';
    Logger.attachTransport('file:json', manifestLogRedactionFormat());

    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    Config['cache'].set('database.postgres.deleter-url', roleUrl('memoir_deleter'));
    app = await ShadowFactory.create(TestAppModule, { overrides: [{ token: IdentityCloseClient, useClass: StubIdentityCloseClient }] });
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DeletionRepository)['db'] as PrimaryDatabase;
    storage = app.get(StorageService);
    deletionRepository = app.get(DeletionRepository);
    deletionService = app.get(DeletionService);
    sweeps = app.get(DeletionSweepService);

    /** The bucket outlives the cloned database, and account ids restart with it — objects a previous run left behind would otherwise read as this run's. */
    for (const prefix of ['r/', 'exports/']) for (const key of await storage.list(prefix)) await storage.delete(key);
  });

  beforeEach(() => {
    identityCloseOutcome = 'unconfigured';
    identityCloseCalls = [];
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('POST /api/v1/account/deletion — guards', () => {
    it('should answer IAM_003 when the presented token is not elevated', async () => {
      const token = await userToken('deletion-aal1-sub', { scopes: ['memoir:sync', 'memoir:account', 'memoir:destructive'] });
      const response = await startDeletion(token);
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('IAM_003');
    });

    it('should refuse an elevated token that lacks the memoir:destructive scope', async () => {
      const token = await userToken('deletion-noscope-sub', { scopes: ['memoir:sync', 'memoir:account'], claims: { aal: 'AAL2' } });
      const response = await startDeletion(token);
      expect(response.statusCode).toBe(403);
      expect(response.json().code).not.toBe('IAM_003');
    });

    it('should refuse a token minted for another audience', async () => {
      const token = await userToken('deletion-audience-sub', { audience: 'api://other', scopes: ['memoir:destructive'], claims: { aal: 'AAL2' } });
      const response = await startDeletion(token);
      expect(response.statusCode).toBeGreaterThanOrEqual(401);
      expect(AUDIENCE).toBe('api://shadow-memoir');
    });
  });

  describe('POST /api/v1/account/deletion — the marker', () => {
    it('should mark the account pending and answer 202', async () => {
      const sub = 'deletion-marker-sub';
      const accountId = await resolveAccount(sub);
      const response = await startDeletion(await destructiveToken(sub));

      expect(response.statusCode).toBe(202);
      expect(response.json().deletionState).toBe('pending');
      await settle(accountId);

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account?.deletionStartedAt).not.toBeNull();
    });

    it('should treat a second start request as a no-op that reports the state already in flight', async () => {
      const sub = 'deletion-second-start-sub';
      const accountId = await resolveAccount(sub);
      await startDeletion(await destructiveToken(sub));
      const settled = await settle(accountId);
      const [before] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));

      const second = await startDeletion(await destructiveToken(sub));
      expect(second.statusCode).toBe(202);
      expect(second.json().deletionState).toBe(settled);

      const [after] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(after?.deletionStartedAt?.toISOString()).toBe(before?.deletionStartedAt?.toISOString() as string);
    });

    it('should keep the deletion state readable while the machine is in flight', async () => {
      const sub = 'deletion-status-sub';
      const accountId = await resolveAccount(sub);
      await startDeletion(await destructiveToken(sub));
      const settled = await settle(accountId);

      const response = await deletionStatus(await destructiveToken(sub));
      expect(response.statusCode).toBe(200);
      expect(response.json().deletionState).toBe(settled);
    });
  });

  describe('AccountContext refusal from the first marker', () => {
    it('should refuse a sync pull with ACC_002 once deletion has started', async () => {
      const sub = 'deletion-sync-sub';
      const accountId = await resolveAccount(sub);
      await startDeletion(await destructiveToken(sub));
      await settle(accountId);

      const token = await userToken(sub);
      const response = await router
        .mockRequest()
        .get('/api/v1/sync/delta')
        .query({ domains: 'account', since: '0' })
        .headers({ authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('ACC_002');
    });

    it('should refuse a command submission with ACC_002 once deletion has started', async () => {
      const sub = 'deletion-commands-sub';
      const accountId = await resolveAccount(sub);
      await startDeletion(await destructiveToken(sub));
      await settle(accountId);

      const token = await userToken(sub);
      const response = await router
        .mockRequest()
        .post('/api/v1/sync/commands')
        .headers({ authorization: `Bearer ${token}` })
        .body({ commands: [{ commandId: Bun.randomUUIDv7(), type: 'quest.create', payload: {}, localDate: DATE }] });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('ACC_002');
    });

    it('should refuse the account surface with ACC_002 once deletion has started', async () => {
      const sub = 'deletion-account-sub';
      const accountId = await resolveAccount(sub);
      await startDeletion(await destructiveToken(sub));
      await settle(accountId);

      const token = await userToken(sub);
      const response = await router
        .mockRequest()
        .get('/api/v1/account')
        .headers({ authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('ACC_002');
    });
  });

  describe('Step 3 — blob prefix wipe', () => {
    it('should delete every object under the account prefixes and leave another account untouched', async () => {
      const accountId = await resolveAccount('deletion-blobs-sub');
      const otherId = await resolveAccount('deletion-blobs-other-sub');
      const mine = `r/${accountId}/${Bun.randomUUIDv7()}.jpg`;
      const myExport = `exports/${accountId}/${Bun.randomUUIDv7()}.zip`;
      const theirs = `r/${otherId}/${Bun.randomUUIDv7()}.jpg`;
      await Promise.all([putObject(mine), putObject(myExport), putObject(theirs)]);

      await setState(accountId, 'pending');
      await deletionService.drive(accountId);

      expect(await storage.exists(mine)).toBe(false);
      expect(await storage.exists(myExport)).toBe(false);
      expect(await storage.exists(theirs)).toBe(true);
    });

    it('should be a no-op when re-entered with the prefixes already empty', async () => {
      const accountId = await resolveAccount('deletion-blobs-reentry-sub');
      await setState(accountId, 'pending');
      await deletionService.drive(accountId);
      await setState(accountId, 'pending');
      await deletionService.drive(accountId);
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
    });
  });

  describe('Step 4 — relational purge', () => {
    it('should purge every owned row and leave another account intact', async () => {
      const accountId = await resolveAccount('deletion-purge-sub');
      const otherId = await resolveAccount('deletion-purge-other-sub');
      await seedAccountData(accountId);
      await seedAccountData(otherId);
      expect(await countRows(accountId)).toBeGreaterThan(0);

      await setState(accountId, 'blobs_deleted');
      await deletionService.drive(accountId);

      expect(await countRows(accountId)).toBe(0);
      expect(await countRows(otherId)).toBeGreaterThan(0);
      expect(await deletionRepository.hasResidualRows(accountId)).toBe(false);
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
    });

    it('should purge every AI table, including the ones referencing quests and ai_tasks', async () => {
      const accountId = await resolveAccount('deletion-purge-ai-sub');
      const otherId = await resolveAccount('deletion-purge-ai-other-sub');
      await seedAccountData(accountId);
      await seedAccountData(otherId);
      expect(await countAiRows(accountId)).toBe(6);

      await setState(accountId, 'blobs_deleted');
      await deletionService.drive(accountId);

      expect(await countAiRows(accountId)).toBe(0);
      expect(await countAiRows(otherId)).toBe(6);
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
    });

    it('should survive being re-entered after the rows are already gone', async () => {
      const accountId = await resolveAccount('deletion-purge-reentry-sub');
      await seedAccountData(accountId);
      await setState(accountId, 'blobs_deleted');
      await deletionService.drive(accountId);
      await setState(accountId, 'blobs_deleted');
      await deletionService.drive(accountId);
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
    });

    it('should leave the accounts row standing until step 6', async () => {
      const accountId = await resolveAccount('deletion-purge-account-row-sub');
      await seedAccountData(accountId);
      await setState(accountId, 'blobs_deleted');
      await deletionService.drive(accountId);

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account).toBeDefined();
    });
  });

  describe('Step 5 — identity close', () => {
    it('should halt at data_deleted and emit the operator-runbook signal when no close surface is configured', async () => {
      const accountId = await resolveAccount('deletion-identity-unconfigured-sub');
      await setState(accountId, 'data_deleted');

      expect(await deletionService.drive(accountId)).toBe('data_deleted');
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
      expect(identityCloseCalls).toHaveLength(1);
    });

    it('should halt at data_deleted when identity is configured but unavailable', async () => {
      identityCloseOutcome = 'unavailable';
      const accountId = await resolveAccount('deletion-identity-unavailable-sub');
      await setState(accountId, 'data_deleted');

      expect(await deletionService.drive(accountId)).toBe('data_deleted');
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
    });

    it('should advance to identity_closed and finish once identity answers', async () => {
      identityCloseOutcome = 'closed';
      const sub = 'deletion-identity-closed-sub';
      const accountId = await resolveAccount(sub);
      await setState(accountId, 'data_deleted');

      expect(await deletionService.drive(accountId)).toBe('done');
      expect(identityCloseCalls).toEqual([sub]);

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account).toBeUndefined();
    });
  });

  describe('Step 6 — final row removal', () => {
    it('should remove the accounts row and report done', async () => {
      const accountId = await resolveAccount('deletion-final-sub');
      await setState(accountId, 'identity_closed');

      expect(await deletionService.drive(accountId)).toBe('done');
      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account).toBeUndefined();
    });

    it('should report done for an account whose row is already gone', async () => {
      const accountId = await resolveAccount('deletion-final-gone-sub');
      await setState(accountId, 'identity_closed');
      await deletionService.drive(accountId);
      expect(await deletionService.drive(accountId)).toBe('done');
    });

    it('should refuse to remove the row from any state other than identity_closed', async () => {
      const accountId = await resolveAccount('deletion-final-guard-sub');
      await setState(accountId, 'data_deleted');
      expect(await deletionRepository.removeAccount(accountId)).toBeNull();
      expect(await deletionRepository.findState(accountId)).toBe('data_deleted');
    });
  });

  describe('Kill-and-resume', () => {
    const states = ['pending', 'blobs_deleted', 'data_deleted', 'identity_closed'] as const;

    for (const state of states) {
      it(`should resume a deletion killed at ${state} and drive it to completion`, async () => {
        identityCloseOutcome = 'closed';
        const accountId = await resolveAccount(`deletion-resume-${state}-sub`);
        await seedAccountData(accountId);
        /** Only a kill before step 3 leaves objects standing; from `blobs_deleted` on, the prefix is already empty by construction. */
        if (state === 'pending') await putObject(`r/${accountId}/${Bun.randomUUIDv7()}.jpg`);
        await setState(accountId, state);

        await sweeps.sweep();

        const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
        expect(account).toBeUndefined();
        expect(await countRows(accountId)).toBe(0);
        expect(await storage.list(`r/${accountId}/`)).toHaveLength(0);
      });
    }

    it('should resume a deletion that halted at data_deleted once identity becomes reachable', async () => {
      const accountId = await resolveAccount('deletion-resume-identity-sub');
      await seedAccountData(accountId);
      await setState(accountId, 'pending');

      expect(await deletionService.drive(accountId)).toBe('data_deleted');

      identityCloseOutcome = 'closed';
      await sweeps.sweep();

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account).toBeUndefined();
    });

    it('should leave a deletion younger than the resume threshold to its own driver', async () => {
      identityCloseOutcome = 'closed';
      const accountId = await resolveAccount('deletion-resume-fresh-sub');
      await setState(accountId, 'pending', 0);

      await sweeps.sweep();

      expect(await deletionRepository.findState(accountId)).toBe('pending');
    });

    it('should ignore accounts that never started a deletion', async () => {
      identityCloseOutcome = 'closed';
      const accountId = await resolveAccount('deletion-resume-untouched-sub');
      await seedAccountData(accountId);

      await sweeps.sweep();

      expect(await deletionRepository.findState(accountId)).toBe('none');
      expect(await countRows(accountId)).toBeGreaterThan(0);
    });
  });

  describe('Re-entry idempotence', () => {
    it('should reach the same terminal outcome when the whole machine runs twice', async () => {
      identityCloseOutcome = 'closed';
      const accountId = await resolveAccount('deletion-idempotent-sub');
      await seedAccountData(accountId);
      await putObject(`r/${accountId}/${Bun.randomUUIDv7()}.jpg`);
      await setState(accountId, 'pending');

      expect(await deletionService.drive(accountId)).toBe('done');
      expect(await deletionService.drive(accountId)).toBe('done');
      expect(await countRows(accountId)).toBe(0);
    });

    it('should converge when two drivers race the same account', async () => {
      identityCloseOutcome = 'closed';
      const accountId = await resolveAccount('deletion-race-sub');
      await seedAccountData(accountId);
      await setState(accountId, 'pending');

      const outcomes = await Promise.all([deletionService.drive(accountId), deletionService.drive(accountId)]);
      expect(outcomes).toEqual(['done', 'done']);

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account).toBeUndefined();
    });
  });

  describe('Operator signals', () => {
    it('should emit the operator-runbook metric when the identity close is blocked', async () => {
      const accountId = await resolveAccount('deletion-signal-blocked-sub');
      await setState(accountId, 'data_deleted');

      const lines = await captureLines(() => deletionService.drive(accountId));
      const blocked = lines.find(line => line['metric'] === 'deletion.identity_close_blocked');
      expect(blocked).toBeDefined();
      expect(blocked!['pseudoAccountId']).toBe(pseudoAccountId(accountId));
      expect(blocked!['outcome']).toBe('unconfigured');
    });

    it('should write a final audit line carrying only a pseudonymous id and timestamps', async () => {
      identityCloseOutcome = 'closed';
      const sub = 'deletion-signal-audit-sub';
      const accountId = await resolveAccount(sub);
      await setState(accountId, 'identity_closed');

      const lines = await captureLines(() => deletionService.drive(accountId));
      const audit = lines.find(line => line['metric'] === 'deletion.completed');
      expect(audit).toBeDefined();
      expect(audit!['pseudoAccountId']).toBe(pseudoAccountId(accountId));
      expect(audit!['deletionStartedAt']).toBeString();
      expect(audit!['completedAt']).toBeString();
      expect(audit!['accountCreatedAt']).toBeString();
      expect(JSON.stringify(audit)).not.toContain(sub);
      expect(
        Object.keys(audit!)
          .filter(key => !['label', 'level', 'message', 'namespace', 'metric', 'value'].includes(key))
          .sort(),
      ).toEqual(['accountCreatedAt', 'completedAt', 'deletionStartedAt', 'pseudoAccountId']);
    });
  });

  describe('Purge batch budget', () => {
    it('should stay at blobs_deleted when a pass runs out of batches, and finish on the next entry', async () => {
      const originalBatchSize = Config.get('deletion.purge-batch-size');
      const originalMaxBatches = Config.get('deletion.purge-max-batches');
      Config['cache'].set('deletion.purge-batch-size', 1);
      Config['cache'].set('deletion.purge-max-batches', 1);

      const accountId = await resolveAccount('deletion-batch-budget-sub');
      await seedAccountData(accountId);
      await setState(accountId, 'blobs_deleted');

      expect(await deletionService.drive(accountId)).toBe('blobs_deleted');
      expect(await deletionRepository.hasResidualRows(accountId)).toBe(true);

      Config['cache'].set('deletion.purge-batch-size', originalBatchSize);
      Config['cache'].set('deletion.purge-max-batches', originalMaxBatches);

      expect(await deletionService.drive(accountId)).toBe('data_deleted');
      expect(await countRows(accountId)).toBe(0);
    });
  });

  describe('Guarded transitions', () => {
    it('should move no row when the guard names a state the account has left', async () => {
      const accountId = await resolveAccount('deletion-guard-sub');
      await setState(accountId, 'blobs_deleted');
      expect(await deletionRepository.advance(accountId, 'pending', 'blobs_deleted')).toBe(false);
      expect(await deletionRepository.findState(accountId)).toBe('blobs_deleted');
    });

    it('should mark pending exactly once', async () => {
      const accountId = await resolveAccount('deletion-mark-once-sub');
      expect(await deletionRepository.markPending(accountId)).toBe(true);
      expect(await deletionRepository.markPending(accountId)).toBe(false);
    });
  });
});

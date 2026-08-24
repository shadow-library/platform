import '@server/bootstrap';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { QuestsModule } from '@modules/quests';
import { ReconciliationModule, ReconciliationService } from '@modules/reconciliation';
import { currentRuleset } from '@modules/rules';
import { SchedulerModule } from '@modules/scheduler';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { manifestLogRedactionFormat } from '@server/database/log-redaction';
import { pseudoAccountId } from '@server/telemetry';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule, ReconciliationModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule, SchedulerModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_reconciliation_spec`;

const ruleset = currentRuleset();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Reconciliation, hardening & runbooks (T-35)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalScheduler = Config.get('scheduler.enabled');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-reconciliation-'));
  const logFile = path.join(logDir, `${Config.get('app.name')}-0.log`);

  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let service: ReconciliationService;
  let subCounter = 0;

  async function newAccount(): Promise<bigint> {
    subCounter += 1;
    const sub = `reconciliation-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    return account!.id;
  }

  function logSize(): number {
    return fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  }

  function logTail(offset: number): string {
    return fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(offset) : '';
  }

  async function capture(action: () => Promise<void>): Promise<string> {
    const before = logSize();
    await action();
    await sleep(150);
    return logTail(before);
  }

  function jsonLines(text: string): Record<string, unknown>[] {
    return text
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as Record<string, unknown>);
  }

  beforeAll(async () => {
    fs.mkdirSync(logDir, { recursive: true });
    Config['cache'].set('log.dir', logDir);
    Config['cache'].set('scheduler.enabled', false);
    Logger['logger'].level = 'info';
    Logger.attachTransport('file:json', manifestLogRedactionFormat());

    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    service = app.get(ReconciliationService);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('scheduler.enabled', originalScheduler);
    await dropDatabase(databaseName);
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  describe('mirror drift sweep', () => {
    it('should alert on an injected mirror drift and never repair the mirror', async () => {
      const accountId = await newAccount();
      await db.update(schema.accounts).set({ coins: 500 }).where(eq(schema.accounts.id, accountId));

      const lines = await capture(() => service.runDriftSweep());
      const driftLines = jsonLines(lines).filter(line => line['metric'] === 'reconciliation.drift');
      const mine = driftLines.find(line => line['accountPseudoId'] === pseudoAccountId(accountId));

      expect(mine).toBeDefined();
      expect(mine!['fields']).toContain('coins');

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      expect(account!.coins).toBe(500);
    });

    it('should not flag an account whose mirror matches its hero_events sum', async () => {
      const accountId = await newAccount();
      const lines = await capture(() => service.runDriftSweep());
      const mine = jsonLines(lines)
        .filter(line => line['metric'] === 'reconciliation.drift')
        .find(line => line['accountPseudoId'] === pseudoAccountId(accountId));
      expect(mine).toBeUndefined();
    });
  });

  describe('wedged-rollover detection', () => {
    it('should surface an account whose last_hp_date lags behind a later command_log entry', async () => {
      const accountId = await newAccount();
      const lagDays = Config.get('reconciliation.wedged-last-hp-lag-days');
      const staleDate = new Date(Date.now() - (lagDays + 5) * 86_400_000).toISOString().slice(0, 10);
      await db.update(schema.accounts).set({ lastHpDate: staleDate }).where(eq(schema.accounts.id, accountId));
      await db.insert(schema.commandLog).values({ accountId, commandId: Bun.randomUUIDv7(), type: 'test.wedged-probe', status: 'applied', appliedAt: new Date() });

      const lines = await capture(() => service.runDriftSweep());
      const wedgedLine = jsonLines(lines).find(line => line['metric'] === 'reconciliation.wedged_accounts');

      expect(wedgedLine).toBeDefined();
      expect(wedgedLine!['accountPseudoIds']).toContain(pseudoAccountId(accountId));
    });

    it('should not flag an account whose last_hp_date is current', async () => {
      const accountId = await newAccount();
      const lines = await capture(() => service.runDriftSweep());
      const wedgedLine = jsonLines(lines).find(line => line['metric'] === 'reconciliation.wedged_accounts');
      expect(wedgedLine!['accountPseudoIds']).not.toContain(pseudoAccountId(accountId));
    });
  });

  describe('quest streak sample rebuild-and-compare', () => {
    it('should flag an injected divergence between the stored projection and the rebuilt one', async () => {
      const accountId = await newAccount();
      const [quest] = await db
        .insert(schema.quests)
        .values({
          accountId,
          name: 'Morning run',
          startTimeMin: 360,
          durationMin: 30,
          statAffinity: 'body',
          strictness: 'anchor',
          recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', end: { kind: 'never' }, exceptions: [] },
        })
        .returning();
      const questId = quest!.id;

      const today = new Date();
      for (let offset = 2; offset >= 0; offset--) {
        const date = new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
        await db.insert(schema.questLogs).values({
          accountId,
          questId,
          date,
          state: 'completed',
          xpAwarded: 12,
          coinsAwarded: 2,
          statAffinity: 'body',
          strictness: 'anchor',
          intensityModeAtLog: 'standard',
          crownSliceWeight: '1.50',
          rulesetVersion: ruleset.version,
        });
      }
      // The true rebuild of 3 consecutive `completed` days is `currentRunDays = 3`; this stores something else on purpose.
      await db.insert(schema.questStreaks).values({ accountId, questId, currentRunDays: 999, bestRunDays: 999, shieldsAvailable: 0, completionsTowardShield: 0 });

      const lines = await capture(() => service.runStreakSampleSweep());
      const divergenceLine = jsonLines(lines).find(line => line['metric'] === 'quest_streak.divergence');

      expect(divergenceLine).toBeDefined();
      const diverged = divergenceLine!['diverged'] as { accountPseudoId: string; questId: string }[];
      expect(diverged.some(entry => entry.accountPseudoId === pseudoAccountId(accountId) && entry.questId === String(questId))).toBe(true);
    });
  });

  describe('command_log prune sweep', () => {
    const originalRetention = Config.get('reconciliation.command-log-retention-days');
    const originalBatchSize = Config.get('reconciliation.command-log-prune-batch-size');
    const originalMaxBatches = Config.get('reconciliation.command-log-prune-max-batches');

    afterEach(() => {
      Config['cache'].set('reconciliation.command-log-retention-days', originalRetention);
      Config['cache'].set('reconciliation.command-log-prune-batch-size', originalBatchSize);
      Config['cache'].set('reconciliation.command-log-prune-max-batches', originalMaxBatches);
    });

    it('should delete rows older than retention, keep younger rows, and respect the batch limit', async () => {
      Config['cache'].set('reconciliation.command-log-retention-days', 90);
      Config['cache'].set('reconciliation.command-log-prune-batch-size', 2);
      Config['cache'].set('reconciliation.command-log-prune-max-batches', 2);

      const accountId = await newAccount();
      const old = new Date(Date.now() - 100 * 86_400_000);
      const recent = new Date(Date.now() - 10 * 86_400_000);
      const oldIds = Array.from({ length: 5 }, () => Bun.randomUUIDv7());
      const recentIds = Array.from({ length: 3 }, () => Bun.randomUUIDv7());

      for (const commandId of oldIds) await db.insert(schema.commandLog).values({ accountId, commandId, type: 'test.prune-old', status: 'applied', appliedAt: old });
      for (const commandId of recentIds) await db.insert(schema.commandLog).values({ accountId, commandId, type: 'test.prune-recent', status: 'applied', appliedAt: recent });

      const lines = await capture(() => service.runCommandLogPrune());
      const pruneLine = jsonLines(lines).find(line => line['metric'] === 'command_log.pruned');
      expect(pruneLine).toBeDefined();
      expect(pruneLine!['hitBatchLimit']).toBe(true); // batchSize(2) x maxBatches(2) = 4 of the 5 old rows

      const remaining = await db
        .select()
        .from(schema.commandLog)
        .where(and(eq(schema.commandLog.accountId, accountId), eq(schema.commandLog.type, 'test.prune-old')));
      expect(remaining).toHaveLength(1);

      const survivors = await db
        .select()
        .from(schema.commandLog)
        .where(and(eq(schema.commandLog.accountId, accountId), eq(schema.commandLog.type, 'test.prune-recent')));
      expect(survivors).toHaveLength(3);

      const second = await capture(() => service.runCommandLogPrune());
      const secondLine = jsonLines(second).find(line => line['metric'] === 'command_log.pruned');
      expect(secondLine!['hitBatchLimit']).toBe(false);

      const finalOld = await db
        .select()
        .from(schema.commandLog)
        .where(and(eq(schema.commandLog.accountId, accountId), eq(schema.commandLog.type, 'test.prune-old')));
      expect(finalOld).toHaveLength(0);
    });
  });
});

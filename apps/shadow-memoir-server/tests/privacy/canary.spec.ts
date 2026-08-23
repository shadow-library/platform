import '@server/bootstrap';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { bigserial, pgTable, varchar } from 'drizzle-orm/pg-core';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandBus, CommandsModule } from '@modules/commands';
import { FinanceModule } from '@modules/finance';
import { MetricsModule } from '@modules/metrics';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, getSensitivityManifest, type PrimaryDatabase, schema, sensitive } from '@server/database';
import { manifestLogRedactionFormat } from '@server/database/log-redaction';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

/**
 * The canary CI test (ARCHITECTURE §24, T-28). Fixture rows carry a unique canary string in every
 * `sensitive()`-registered column; representative flows (commands, a mapped constraint violation, a
 * validation error, a synthetic handler crash, telemetry emission, a sync delta pull) are driven while
 * every log line the process writes is captured, and none of them may contain the canary. The manifest
 * drives coverage — a column joins this suite by being wrapped in `sensitive()`, not by being named here.
 */

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule, FinanceModule, MetricsModule, CommandsModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_canary_spec`;

const DATE = '2026-08-24';
const CANARY = `CANARY${Bun.randomUUIDv7().replaceAll('-', '')}`;
const SYNTHETIC_CRASH = 'test.synthetic_crash';

/** The real, schema-registered manifest entries — excludes throwaway fixture tables other spec files register into the same process-global manifest. */
const APP_TABLES = new Set(['reschedule_events', 'recovery_quests', 'quests', 'quest_logs', 'accounts', 'expenses', 'subscriptions', 'metrics', 'metric_entries']);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Privacy canary suite (T-28)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-canary-'));
  const logFile = path.join(logDir, `${Config.get('app.name')}-0.log`);

  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let bearer: string;
  let accountId: bigint;
  let commandBus: CommandBus;
  const coveredKeys = new Set<string>();

  function envelope(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
  }

  async function submit(commands: Record<string, unknown>[]): Promise<{ status: number; outcomes: any[] }> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ commands });
    return { status: response.statusCode, outcomes: response.json()?.outcomes ?? [] };
  }

  function logSize(): number {
    return fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  }

  function logTail(offset: number): string {
    if (!fs.existsSync(logFile)) return '';
    return fs.readFileSync(logFile, 'utf8').slice(offset);
  }

  /** Runs `action`, waits for the file transport to flush, and returns every byte the process logged meanwhile. */
  async function capture(action: () => Promise<void>): Promise<string> {
    const before = logSize();
    await action();
    await sleep(150);
    return logTail(before);
  }

  beforeAll(async () => {
    fs.mkdirSync(logDir, { recursive: true });
    Config['cache'].set('log.dir', logDir);
    /** Matches the production log posture (§24: "winston JSON on stdout in prod") rather than this suite's dev-mode default of `debug`, so the captured stream is what actually ships, not verbose dev-only SQL/request tracing. */
    Logger['logger'].level = 'info';
    Logger.attachTransport('file:json', manifestLogRedactionFormat());

    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    commandBus = app.get(CommandBus);
    bearer = await userToken('canary-sub');

    commandBus.registerHandler(SYNTHETIC_CRASH, async ({ envelope }) => {
      const note = envelope.payload['note'];
      void note;
      throw new Error('synthetic crash for T-28 canary coverage');
    });

    await submit([envelope('expense.create', { id: Bun.randomUUIDv7(), amountMinor: 1, amountText: '0.01', currency: 'USD', categoryId: 'food', occurredOn: DATE })]);
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, 'canary-sub'));
    accountId = account!.id;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  it('should not leak canary merchant/note through an expense.create command', async () => {
    const lines = await capture(async () => {
      await submit([
        envelope('expense.create', {
          id: Bun.randomUUIDv7(),
          amountMinor: 500,
          amountText: '5.00',
          currency: 'USD',
          categoryId: 'food',
          occurredOn: DATE,
          merchant: CANARY,
          note: CANARY,
        }),
      ]);
    });
    coveredKeys.add('expenses.merchant');
    coveredKeys.add('expenses.note');
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak a canary subscription note through a subscription.create command', async () => {
    const lines = await capture(async () => {
      await submit([
        envelope('subscription.create', {
          name: 'Streaming',
          amountMinor: 999,
          amountText: '9.99',
          currency: 'USD',
          frequency: 'monthly',
          billingDay: 1,
          nextDueDate: DATE,
          categoryId: 'subs',
          note: CANARY,
        }),
      ]);
    });
    coveredKeys.add('subscriptions.note');
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak a canary email/displayName written directly to the accounts row', async () => {
    const lines = await capture(async () => {
      await db
        .update(schema.accounts)
        .set({ email: `${CANARY}@example.com`, displayName: CANARY })
        .where(eq(schema.accounts.id, accountId));
      await submit([envelope('expense.create', { id: Bun.randomUUIDv7(), amountMinor: 10, amountText: '0.10', currency: 'USD', categoryId: 'food', occurredOn: DATE })]);
    });
    coveredKeys.add('accounts.email');
    coveredKeys.add('accounts.display_name');
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak canary quest/quest-log/mechanic-event free text from raw-inserted fixtures (no command module yet)', async () => {
    const lines = await capture(async () => {
      const [quest] = await db
        .insert(schema.quests)
        .values({ accountId, name: CANARY, durationMin: 10, statAffinity: 'discipline', strictness: 'anchor', recurrence: { type: 'daily' } })
        .returning();

      await db.insert(schema.questLogs).values({
        accountId,
        questId: quest!.id,
        date: DATE,
        state: 'completed',
        statAffinity: 'discipline',
        strictness: 'anchor',
        intensityModeAtLog: 'standard',
        crownSliceWeight: '1.00',
        rulesetVersion: 1,
        reasonNote: CANARY,
        reflectionText: CANARY,
      });

      await db.insert(schema.rescheduleEvents).values({ accountId, questId: quest!.id, date: DATE, toMin: 480, reasonNote: CANARY });

      await db.insert(schema.recoveryQuests).values({ accountId, date: DATE, sourceQuestName: CANARY, expiresAt: new Date(Date.now() + 86_400_000), reflectionText: CANARY });
    });

    coveredKeys.add('quests.name');
    coveredKeys.add('quest_logs.reason_note');
    coveredKeys.add('quest_logs.reflection_text');
    coveredKeys.add('reschedule_events.reason_note');
    coveredKeys.add('recovery_quests.source_quest_name');
    coveredKeys.add('recovery_quests.reflection_text');
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak a canary metric name through a metric.create command (T-23)', async () => {
    const lines = await capture(async () => {
      await submit([envelope('metric.create', { name: CANARY, valueType: 'number', direction: 'neutral' })]);
    });
    coveredKeys.add('metrics.name');
    expect(lines).not.toContain(CANARY);
  });

  it("should redact metric_entries.value the same way as any other manifest column, driven at the formatter directly since it's numeric and cannot carry a canary string through the real command path (T-23)", () => {
    const format = manifestLogRedactionFormat();
    const info = { level: 'info', message: 'unrelated', value: CANARY };
    format.transform(info, {});
    coveredKeys.add('metric_entries.value');
    expect(info.value).not.toBe(CANARY);
  });

  it('should not leak canary values through an unmapped constraint violation (duplicate expense id)', async () => {
    const id = Bun.randomUUIDv7();
    await submit([envelope('expense.create', { id, amountMinor: 100, amountText: '1.00', currency: 'USD', categoryId: 'food', occurredOn: DATE, merchant: CANARY })]);

    const lines = await capture(async () => {
      const result = await submit([
        envelope('expense.create', { id, amountMinor: 200, amountText: '2.00', currency: 'USD', categoryId: 'food', occurredOn: DATE, merchant: CANARY, note: CANARY }),
      ]);
      expect(result.status).toBe(500);
    });
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak a canary through a validation error (missing required field)', async () => {
    const lines = await capture(async () => {
      const result = await submit([envelope('expense.create', { id: Bun.randomUUIDv7(), currency: 'USD', categoryId: 'food', occurredOn: DATE, merchant: CANARY })]);
      expect(result.outcomes[0]?.status).toBe('failed');
    });
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak a canary through a synthetic handler crash', async () => {
    const lines = await capture(async () => {
      const result = await submit([envelope(SYNTHETIC_CRASH, { note: CANARY })]);
      expect(result.status).toBeGreaterThanOrEqual(500);
    });
    expect(lines).not.toContain(CANARY);
  });

  it('should not leak a canary through a delta pull after canary-laden entities were written', async () => {
    const lines = await capture(async () => {
      const response = await router
        .mockRequest()
        .get('/api/v1/sync/delta')
        .query({ since: '0' })
        .headers({ authorization: `Bearer ${bearer}` });
      expect(response.statusCode).toBe(200);
    });
    expect(lines).not.toContain(CANARY);
  });

  it('should cover every real, manifest-registered sensitive column', () => {
    const missing = getSensitivityManifest()
      .filter(entry => APP_TABLES.has(entry.table))
      .filter(entry => !coveredKeys.has(`${entry.table}.${entry.column}`));
    expect(missing).toEqual([]);
  });

  it('should automatically redact a brand-new sensitive() column with no schema/code changes elsewhere', () => {
    const fixtureTable = pgTable('canary_autojoin_fixture', { id: bigserial('id', { mode: 'bigint' }).primaryKey(), secretField: varchar('secret_field', { length: 64 }) });
    sensitive(fixtureTable.secretField, 'most-sensitive');

    /** Rebuilt from the manifest exactly as `main.ts`/`worker.ts` build it — proves the new column joins the same redaction path production wires up, with no code change outside the schema file. */
    const format = manifestLogRedactionFormat();
    const info = { level: 'info', message: 'unrelated', secretField: CANARY };
    format.transform(info, {});

    expect(info.secretField).not.toBe(CANARY);
  });
});

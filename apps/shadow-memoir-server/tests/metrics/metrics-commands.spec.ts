import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { MetricsModule } from '@modules/metrics';
import { QuestsModule } from '@modules/quests';
import { SyncModule } from '@modules/sync';
import { accounts, DatastoreModule, metricEntries, metrics, type PrimaryDatabase, questConsequences, questLogs } from '@server/database';
import { TelemetryService } from '@server/telemetry';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule, MetricsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_metrics_commands_spec`;

const DATE = '2026-08-24';

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

function dailyRecurrence(startDate: string): Record<string, unknown> {
  return { frequency: 'daily', interval: 1, startDate, end: { kind: 'never' }, exceptions: [] };
}

describe('Metrics & manual health tracking (T-23)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subCounter = 0;

  function envelope(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
  }

  async function submit(commands: Record<string, unknown>[], token: string): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
    return (response.json() as { outcomes: Outcome[] }).outcomes;
  }

  async function submitOne(type: string, payload: Record<string, unknown>, token: string): Promise<Outcome> {
    const [outcome] = await submit([envelope(type, payload)], token);
    return outcome!;
  }

  /** `AccountContext.resolve`'s upsert-on-first-contact runs in the auth guard, ahead of any command. */
  async function newUser(): Promise<{ token: string; accountId: bigint }> {
    subCounter += 1;
    const sub = `metrics-commands-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identitySub, sub));
    return { token, accountId: account!.id };
  }

  async function builtinMetric(accountId: bigint, name: string): Promise<typeof metrics.$inferSelect> {
    const rows = await db.select().from(metrics).where(eq(metrics.accountId, accountId));
    const found = rows.find(candidate => candidate.name === name);
    if (!found) throw new Error(`built-in metric '${name}' was not seeded`);
    return found;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('built-in seeding', () => {
    it('should seed the 4 built-in health metrics on first metrics touch', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'Push-ups', valueType: 'count', direction: 'higher' }, token);

      const rows = await db.select().from(metrics).where(eq(metrics.accountId, accountId));
      const health = rows
        .filter(row => row.isHealth)
        .map(row => row.name)
        .sort();
      expect(health).toEqual(['Calories burned', 'Sleep duration', 'Steps', 'Water'].sort());
      expect(rows.every(row => (row.isHealth ? row.builtin : true))).toBe(true);
    });

    it('should seed built-ins idempotently when two commands race on the same fresh account', async () => {
      const { token, accountId } = await newUser();
      const first = envelope('metric.create', { name: 'Metric A', valueType: 'number', direction: 'neutral' });
      const second = envelope('metric.create', { name: 'Metric B', valueType: 'number', direction: 'neutral' });
      await Promise.all([submit([first], token), submit([second], token)]);

      const rows = await db.select().from(metrics).where(eq(metrics.accountId, accountId));
      expect(rows.filter(row => row.isHealth)).toHaveLength(4);
    });
  });

  describe('custom metric CRUD', () => {
    it('should create, update, and soft-delete a custom metric', async () => {
      const { token, accountId } = await newUser();
      const created = await submitOne('metric.create', { name: 'Pages read', valueType: 'count', direction: 'higher', unit: 'pages' }, token);
      expect(created.status).toBe('applied');
      const id = created.result['id'] as string;

      const updated = await submitOne('metric.update', { id, unit: 'chapters' }, token);
      expect(updated.status).toBe('applied');
      const [row] = await db
        .select()
        .from(metrics)
        .where(eq(metrics.id, BigInt(id)));
      expect(row?.unit).toBe('chapters');
      expect(row?.accountId).toBe(accountId);

      const deleted = await submitOne('metric.delete', { id }, token);
      expect(deleted.status).toBe('applied');
      const [afterDelete] = await db
        .select()
        .from(metrics)
        .where(eq(metrics.id, BigInt(id)));
      expect(afterDelete?.active).toBe(false);
    });

    it('should refuse to update or delete a built-in metric', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');

      const updateOutcome = await submitOne('metric.update', { id: String(steps.id), unit: 'paces' }, token);
      expect(updateOutcome.status).toBe('failed');
      expect(updateOutcome.error?.code).toBe('MET_003');

      const deleteOutcome = await submitOne('metric.delete', { id: String(steps.id) }, token);
      expect(deleteOutcome.status).toBe('failed');
      expect(deleteOutcome.error?.code).toBe('MET_003');
    });

    it('should warn (not delete) a metric still declared on a quest consequence, then detach on confirmation (S6)', async () => {
      const { token, accountId } = await newUser();
      const created = await submitOne('metric.create', { name: 'Deadlifts', valueType: 'count', direction: 'higher' }, token);
      const metricId = BigInt(created.result['id'] as string);

      const questOutcome = await submitOne(
        'quest.create',
        { name: 'Lift day', durationMinutes: 45, statAffinity: 'body', strictness: 'goal', recurrence: dailyRecurrence(DATE) },
        token,
      );
      const questId = BigInt(questOutcome.result['id'] as string);
      await db.insert(questConsequences).values({ accountId, questId, metricId, fullValue: '5', partialMode: 'none' });

      const warned = await submitOne('metric.delete', { id: String(metricId) }, token);
      expect(warned.status).toBe('failed');
      expect(warned.error?.code).toBe('MET_004');
      const [stillActive] = await db.select().from(metrics).where(eq(metrics.id, metricId));
      expect(stillActive?.active).toBe(true);

      const detached = await submitOne('metric.delete', { id: String(metricId), detach: true }, token);
      expect(detached.status).toBe('applied');
      expect(detached.result['detachedQuestCount']).toBe(1);
      const remainingConsequences = await db.select().from(questConsequences).where(eq(questConsequences.metricId, metricId));
      expect(remainingConsequences).toHaveLength(0);
      const [deactivated] = await db.select().from(metrics).where(eq(metrics.id, metricId));
      expect(deactivated?.active).toBe(false);
    });
  });

  describe('RegisterMetricEntry uniqueness (§10.3)', () => {
    it('should overwrite a manual entry logged twice on the same day', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');

      await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 3000 }, token);
      await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 9000 }, token);

      const rows = await db.select().from(metricEntries).where(eq(metricEntries.metricId, steps.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.value).toBe('9000');
    });

    it('should not overwrite between different non-quest sources on the same day', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');

      await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 100, source: 'manual' }, token);
      await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 200, source: 'food' }, token);

      const rows = await db.select().from(metricEntries).where(eq(metricEntries.metricId, steps.id));
      expect(rows).toHaveLength(2);
    });

    it('should not overwrite quest-sourced entries against each other, but should converge a replay of the same quest log onto one row', async () => {
      const { token, accountId } = await newUser();
      const created = await submitOne('metric.create', { name: 'Reading minutes', valueType: 'number', direction: 'higher' }, token);
      const metricId = BigInt(created.result['id'] as string);

      const questOutcome = await submitOne(
        'quest.create',
        { name: 'Read a book', durationMinutes: 20, statAffinity: 'mind', strictness: 'goal', recurrence: dailyRecurrence(DATE) },
        token,
      );
      const questId = BigInt(questOutcome.result['id'] as string);

      const [logA] = await db
        .insert(questLogs)
        .values({
          accountId,
          questId,
          date: DATE,
          state: 'completed',
          statAffinity: 'mind',
          strictness: 'goal',
          intensityModeAtLog: 'standard',
          crownSliceWeight: '1.00',
          rulesetVersion: 1,
        })
        .returning();
      const [logB] = await db
        .insert(questLogs)
        .values({
          accountId,
          questId,
          date: '2026-08-25',
          state: 'completed',
          statAffinity: 'mind',
          strictness: 'goal',
          intensityModeAtLog: 'standard',
          crownSliceWeight: '1.00',
          rulesetVersion: 1,
        })
        .returning();

      await submitOne('metric.register', { metricId: String(metricId), date: DATE, value: 30, source: 'quest_log', questLogId: String(logA!.id) }, token);
      await submitOne('metric.register', { metricId: String(metricId), date: '2026-08-25', value: 45, source: 'quest_log', questLogId: String(logB!.id) }, token);
      const replay = await submitOne('metric.register', { metricId: String(metricId), date: DATE, value: 999, source: 'quest_log', questLogId: String(logA!.id) }, token);

      const rows = await db.select().from(metricEntries).where(eq(metricEntries.metricId, metricId));
      expect(rows).toHaveLength(2);
      const forLogA = rows.find(row => row.questLogId === logA!.id);
      expect(forLogA?.value).toBe('30');
      expect(replay.result['id']).toBe(String(forLogA!.id));
    });
  });

  describe('threshold-crossed completion offers (ARCHITECTURE §18)', () => {
    async function questWithThreshold(token: string, metricId: bigint, thresholdValue: number): Promise<bigint> {
      const outcome = await submitOne(
        'quest.create',
        {
          name: 'Walk it off',
          durationMinutes: 30,
          statAffinity: 'body',
          strictness: 'goal',
          recurrence: dailyRecurrence(DATE),
          healthThreshold: { metricId: String(metricId), value: thresholdValue, comparison: 'gte' },
        },
        token,
      );
      return BigInt(outcome.result['id'] as string);
    }

    it('should surface no offer when the threshold has not been crossed', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');
      await questWithThreshold(token, steps.id, 8000);

      const outcome = await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 4000 }, token);
      expect(outcome.result['offers']).toEqual([]);
    });

    it('should surface an offer when the threshold is crossed and no quest log exists for that day', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');
      const questId = await questWithThreshold(token, steps.id, 8000);

      const outcome = await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 9000 }, token);
      const offers = outcome.result['offers'] as Record<string, unknown>[];
      expect(offers).toHaveLength(1);
      expect(offers[0]).toMatchObject({ questId: String(questId), metricId: String(steps.id), thresholdValue: 8000, currentValue: 9000 });
    });

    it('should never auto-complete the quest — a crossed threshold never writes a quest_logs row by itself', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');
      const questId = await questWithThreshold(token, steps.id, 8000);

      await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 9000 }, token);
      const logs = await db.select().from(questLogs).where(eq(questLogs.questId, questId));
      expect(logs).toHaveLength(0);
    });

    it('should suppress the offer once a terminal quest log already exists for that occurrence', async () => {
      const { token, accountId } = await newUser();
      await submitOne('metric.create', { name: 'trigger-seed', valueType: 'number', direction: 'neutral' }, token);
      const steps = await builtinMetric(accountId, 'Steps');
      const questId = await questWithThreshold(token, steps.id, 8000);

      await db.insert(questLogs).values({
        accountId,
        questId,
        date: DATE,
        state: 'skipped',
        statAffinity: 'body',
        strictness: 'goal',
        intensityModeAtLog: 'standard',
        crownSliceWeight: '1.00',
        rulesetVersion: 1,
      });

      const outcome = await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 9000 }, token);
      expect(outcome.result['offers']).toEqual([]);
    });
  });

  describe('telemetry exclusion for health-class entries', () => {
    it('should emit metric_entry_recorded for a non-health custom metric but nothing at all for a health metric', async () => {
      const { token, accountId } = await newUser();
      const telemetry = app.get(TelemetryService);
      const emitSpy = spyOn(telemetry, 'emit');

      /** `sync_batch_submitted` fires for every batch regardless of command type (`SyncService`) — irrelevant to this test, filtered out below. */
      function metricEvents(): unknown[] {
        return emitSpy.mock.calls.map(call => call[0]).filter(event => (event as { name: string }).name === 'metric_entry_recorded');
      }

      const created = await submitOne('metric.create', { name: 'Push-ups', valueType: 'count', direction: 'higher' }, token);
      const metricId = created.result['id'] as string;
      emitSpy.mockClear();

      await submitOne('metric.register', { metricId, date: DATE, value: 20 }, token);
      expect(metricEvents()).toHaveLength(1);

      emitSpy.mockClear();
      const steps = await builtinMetric(accountId, 'Steps');
      await submitOne('metric.register', { metricId: String(steps.id), date: DATE, value: 9000 }, token);
      expect(metricEvents()).toHaveLength(0);

      emitSpy.mockRestore();
    });
  });
});

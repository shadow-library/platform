import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { FinanceModule } from '@modules/finance';
import { MetricsModule } from '@modules/metrics';
import { ProgressionModule } from '@modules/progression';
import { QuestsModule } from '@modules/quests';
import { QuickLogsModule } from '@modules/quick-logs';
import { SyncModule } from '@modules/sync';
import { accounts, DatastoreModule, type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';
import fixtures from './fixtures/wire-commands.json';

const TestHttpModule = FastifyModule.forRoot({
  imports: [MemoirAuthModule, SyncModule, QuestsModule, FinanceModule, QuickLogsModule, MetricsModule, ProgressionModule],
  host: 'localhost',
  port: 0,
});

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_wire_compat_spec`;

interface WirePayload {
  type: string;
  payload: Record<string, unknown>;
}

interface Scenario {
  scenario: string;
  wire: WirePayload;
  performedAt?: string;
}

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

const scenarios = fixtures as unknown as Scenario[];

function scenarioFor(name: string): Scenario {
  const found = scenarios.find(entry => entry.scenario === name);
  if (!found) throw new Error(`fixture scenario '${name}' not found`);
  return found;
}

/** The fixture addresses server-assigned rows with literal `{placeholder}` strings; substituted here once the real ids are known. */
function substitute(payload: Record<string, unknown>, ids: Record<string, string>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== 'string') next[key] = value;
    else next[key] = Object.entries(ids).reduce((text, [placeholder, id]) => text.replace(`{${placeholder}}`, id), value);
  }
  return next;
}

/**
 * FE-4: proves the web's `toWireCommand` output (pinned in `wire-commands.json`, a byte-identical copy of
 * `apps/shadow-memoir-web/tests/fixtures/wire-commands.json`) is exactly what T-18's quest command handlers
 * accept, and that the delta rows they produce carry the camelCase field names `projection.ts` reads.
 * Neither workspace imports the other's `src` — the server's `tsconfig.json` has no path alias into the web
 * app and `command-wire.ts` pulls in the whole `@/lib/data` barrel (React, `@shadow-library/ui`, …) — so the
 * JSON fixture, generated from and pinned against the web's real `toWireCommand`, is what keeps both sides
 * honest about the wire shape instead of a cross-workspace import.
 */
describe('Web wire compatibility (FE-4)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let token: string;
  let db: PrimaryDatabase;

  function envelope(wire: WirePayload, performedAt?: string): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type: wire.type, payload: wire.payload, localDate: '2026-02-15', ...(performedAt ? { performedAt } : {}) };
  }

  async function submit(commands: Record<string, unknown>[]): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
    return (response.json() as { outcomes: Outcome[] }).outcomes;
  }

  async function domains(): Promise<Record<string, Record<string, unknown>[]>> {
    const response = await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    return (response.json() as { domains: Record<string, Record<string, unknown>[]> }).domains;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    token = await userToken('wire-compat-sub');
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should apply every pinned wire command against the real command handlers', async () => {
    const create = scenarioFor('quest.create');
    const [createOutcome] = await submit([{ ...envelope(create.wire), payload: { ...create.wire.payload, entityRef: 'wire-compat-ref' } }]);
    expect(createOutcome!.status).toBe('applied');
    expect(createOutcome!.result['entityRef']).toBe('wire-compat-ref');
    const questId = BigInt(createOutcome!.result['id'] as string);

    const occurrenceScenarios = ['quest.update', 'quest.complete', 'quest.partial', 'quest.skip', 'quest.postpone', 'quest.reschedule'];
    const batch = occurrenceScenarios.map(name => {
      const entry = scenarioFor(name);
      return envelope({ type: entry.wire.type, payload: substitute(entry.wire.payload, { questId: String(questId) }) }, entry.performedAt);
    });
    const outcomes = await submit(batch);

    expect(outcomes.map(outcome => outcome.status)).toEqual(occurrenceScenarios.map(() => 'applied'));

    const recurrenceUpdate = scenarioFor('quest.updateRecurrence');
    const [secondCreate] = await submit([{ ...envelope(create.wire), payload: { ...create.wire.payload, entityRef: 'wire-compat-ref-2' } }]);
    const secondQuestId = BigInt(secondCreate!.result['id'] as string);
    const [recurrenceOutcome] = await submit([
      envelope({ type: recurrenceUpdate.wire.type, payload: substitute(recurrenceUpdate.wire.payload, { questId: String(secondQuestId) }) }),
    ]);
    expect(recurrenceOutcome!.status).toBe('applied');
  });

  /**
   * The four FE-5 domains, driven in the order their ids become known: the metric catalogue has to be
   * seeded before `metric.register` can address a metric, the account has to hold coins before
   * `cosmetic.purchase` can spend them, and `meal.logPreset` / `subscription.*` each need the id the
   * server assigned to the row a previous command created.
   */
  it('should apply every pinned finance, quick-log, metric and progression wire command', async () => {
    const [seeded] = await submit([envelope({ type: 'metric.create', payload: { name: 'Wire proof metric', valueType: 'number', direction: 'higher' } })]);
    expect(seeded!.status).toBe('applied');

    const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identitySub, 'wire-compat-sub'));
    await db.update(accounts).set({ coins: 500 }).where(eq(accounts.id, account!.id));

    const catalogue = await domains();
    const metricId = String(catalogue['metrics']!.find(row => row['name'] === 'Steps')!['id']);

    const finance = ['expense.create', 'expense.update', 'expense.delete'].map(name => envelope(scenarioFor(name).wire));
    expect((await submit(finance)).map(outcome => outcome.status)).toEqual(['applied', 'applied', 'applied']);

    const [created] = await submit([envelope(scenarioFor('subscription.create').wire)]);
    expect(created!.status).toBe('applied');
    const subscriptionId = String(created!.result['id']);

    const cycle = ['subscription.confirmCycle', 'subscription.setActive'].map(name => {
      const entry = scenarioFor(name);
      return envelope({ type: entry.wire.type, payload: substitute(entry.wire.payload, { subscriptionId }) });
    });
    expect((await submit(cycle)).map(outcome => outcome.status)).toEqual(['applied', 'applied']);

    const quickLogs = ['journal.save', 'meal.log', 'weight.save', 'sidequest.log'].map(name => envelope(scenarioFor(name).wire));
    expect((await submit(quickLogs)).map(outcome => outcome.status)).toEqual(['applied', 'applied', 'applied', 'applied']);

    const [preset] = await submit([envelope(scenarioFor('meal.savePreset').wire)]);
    expect(preset!.status).toBe('applied');
    const presetId = String(preset!.result['id']);

    const fromPreset = scenarioFor('meal.logPreset');
    const [logged] = await submit([envelope({ type: fromPreset.wire.type, payload: substitute(fromPreset.wire.payload, { presetId }) })]);
    expect(logged!.status).toBe('applied');

    const register = scenarioFor('health.save');
    const [registered] = await submit([envelope({ type: register.wire.type, payload: substitute(register.wire.payload, { metricId }) })]);
    expect(registered!.status).toBe('applied');
    expect(Array.isArray(registered!.result['offers'])).toBe(true);

    const progression = ['title.display', 'cosmetic.purchase', 'cosmetic.equip'].map(name => envelope(scenarioFor(name).wire));
    expect((await submit(progression)).map(outcome => outcome.status)).toEqual(['applied', 'applied', 'applied']);
  });

  it("should hand back FE-5 delta rows the web's projection.ts can ingest by field name", async () => {
    const rows = await domains();

    const expense = rows['expenses']!.find(row => row['linkedSubscriptionId'] !== null);
    expect(expense).toBeDefined();
    for (const key of ['id', 'amountMinor', 'amountText', 'currency', 'fxRate', 'homeAmountMinor', 'categoryId', 'merchant', 'note', 'occurredOn', 'loggedAt', 'source']) {
      expect(Object.prototype.hasOwnProperty.call(expense, key)).toBe(true);
    }

    const subscription = rows['subscriptions']!.find(row => row['name'] === 'Wire proof subscription');
    for (const key of ['id', 'name', 'amountMinor', 'amountText', 'currency', 'frequency', 'billingDay', 'nextDueDate', 'lastConfirmedDate', 'categoryId', 'reminderLead']) {
      expect(Object.prototype.hasOwnProperty.call(subscription, key)).toBe(true);
    }
    expect(subscription!['categoryId']).toBe('subs');
    expect(subscription!['active']).toBe(false);

    expect(rows['expense_categories']!.some(row => row['key'] === 'groceries')).toBe(true);

    const journal = rows['journal_entries']![0];
    for (const key of ['id', 'date', 'text', 'mood', 'tags', 'rewarded', 'loggedAt']) expect(Object.prototype.hasOwnProperty.call(journal, key)).toBe(true);

    const meal = rows['meals']!.find(row => row['name'] === 'Wire proof meal');
    for (const key of ['id', 'date', 'name', 'calories', 'mealType', 'note', 'presetId', 'rewarded', 'loggedAt']) {
      expect(Object.prototype.hasOwnProperty.call(meal, key)).toBe(true);
    }

    const weight = rows['weights']![0];
    for (const key of ['date', 'kg', 'rewarded', 'loggedAt']) expect(Object.prototype.hasOwnProperty.call(weight, key)).toBe(true);

    const sideQuest = rows['side_quests']![0];
    for (const key of ['id', 'date', 'name', 'statAffinity', 'xpAwarded', 'coinsAwarded', 'statTicked', 'rewarded', 'loggedAt']) {
      expect(Object.prototype.hasOwnProperty.call(sideQuest, key)).toBe(true);
    }

    const steps = rows['metrics']!.find(row => row['name'] === 'Steps');
    expect(steps!['isHealth']).toBe(true);

    const entry = rows['metric_entries']![0];
    for (const key of ['id', 'metricId', 'date', 'value', 'source', 'createdAt']) expect(Object.prototype.hasOwnProperty.call(entry, key)).toBe(true);

    expect(rows['meal_presets']!.some(row => row['name'] === 'Wire proof preset')).toBe(true);
    expect(rows['cosmetic_unlocks']!.some(row => row['cosmeticId'] === 'badge_bronze' && row['equipped'] === true)).toBe(true);
  });

  it("should hand back delta rows the web's projection.ts can ingest by field name", async () => {
    const response = await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { domains: Record<string, Record<string, unknown>[]> };

    const quest = body.domains['quests']!.find(row => row['name'] === 'Wire proof quest (renamed)');
    expect(quest).toBeDefined();
    for (const key of [
      'id',
      'name',
      'startTimeMin',
      'durationMin',
      'statAffinity',
      'strictness',
      'optionalStreakOptIn',
      'recurrence',
      'moduleLink',
      'reminderEnabled',
      'reminderLeadMin',
      'healthThreshold',
      'active',
      'createdAt',
      'updatedAt',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(quest, key)).toBe(true);
    }
    expect((quest!['recurrence'] as { daysOfWeek: number[] }).daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const questLog = body.domains['quest_logs']!.find(row => row['date'] === '2026-02-19');
    expect(questLog).toBeDefined();
    for (const key of ['questId', 'date', 'state', 'xpAwarded', 'coinsAwarded', 'reasonTag', 'reasonNote', 'rescheduledToMin', 'postponedToDate']) {
      expect(Object.prototype.hasOwnProperty.call(questLog, key)).toBe(true);
    }
    expect(questLog!['state']).toBe('rescheduled');
    expect(questLog!['rescheduledToMin']).toBe(540);
  });
});

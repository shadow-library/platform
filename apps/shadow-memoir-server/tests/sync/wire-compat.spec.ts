import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';

import { MemoirAuthModule } from '@modules/auth';
import { QuestsModule } from '@modules/quests';
import { SyncModule } from '@modules/sync';
import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';
import fixtures from './fixtures/wire-commands.json';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule], host: 'localhost', port: 0 });

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

/** The fixture addresses quest A/B with the literal placeholder `{questId}`; substituted here once the real id is known. */
function forQuest(payload: Record<string, unknown>, questId: bigint): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) next[key] = typeof value === 'string' ? value.replace('{questId}', String(questId)) : value;
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

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
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
      return envelope({ type: entry.wire.type, payload: forQuest(entry.wire.payload, questId) }, entry.performedAt);
    });
    const outcomes = await submit(batch);

    expect(outcomes.map(outcome => outcome.status)).toEqual(occurrenceScenarios.map(() => 'applied'));

    const recurrenceUpdate = scenarioFor('quest.updateRecurrence');
    const [secondCreate] = await submit([{ ...envelope(create.wire), payload: { ...create.wire.payload, entityRef: 'wire-compat-ref-2' } }]);
    const secondQuestId = BigInt(secondCreate!.result['id'] as string);
    const [recurrenceOutcome] = await submit([envelope({ type: recurrenceUpdate.wire.type, payload: forQuest(recurrenceUpdate.wire.payload, secondQuestId) })]);
    expect(recurrenceOutcome!.status).toBe('applied');
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

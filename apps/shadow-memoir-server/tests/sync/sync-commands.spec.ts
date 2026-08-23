import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { CommandBus, HeroLedger } from '@modules/commands';
import { MemoirAuthModule } from '@modules/auth';
import { SyncModule } from '@modules/sync';
import { AppErrorCode } from '@server/classes';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { serviceToken, userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_sync_commands_spec`;

const DATE = '2026-08-24';
const GRANT_COMMAND = 'TestGrant';
const CREATE_COMMAND = 'TestCreateQuest';
const READ_COMMAND = 'TestCountQuests';
const FAILING_COMMAND = 'TestFailure';

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

describe('POST /api/v1/sync/commands (T-16)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let bearer: string;
  let handlerRuns = 0;

  function envelope(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
  }

  async function submit(commands: Record<string, unknown>[], token = bearer) {
    return router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    bearer = await userToken('sync-commands-sub');

    const commandBus = app.get(CommandBus);
    const heroLedger = app.get(HeroLedger);

    commandBus.registerHandler(GRANT_COMMAND, async ({ accountId, envelope, tx }) => {
      handlerRuns += 1;
      const [grant] = await heroLedger.grant(tx, accountId, [{ dedupeKey: `test_${envelope.commandId}`, type: 'side_quest', date: envelope.localDate, xpDelta: 7 }]);
      return { status: 'applied', result: { xp: grant!.xpDelta, run: handlerRuns } };
    });

    commandBus.registerHandler(CREATE_COMMAND, async ({ accountId, envelope, tx }) => {
      const [quest] = await tx
        .insert(schema.quests)
        .values({ accountId, name: String(envelope.payload['name']), durationMin: 30, statAffinity: 'body', strictness: 'routine', recurrence: {} })
        .returning({ id: schema.quests.id });
      return { status: 'applied', result: { entityRef: envelope.payload['entityRef'], id: String(quest!.id) } };
    });

    commandBus.registerHandler(READ_COMMAND, async ({ accountId, tx }) => {
      const rows = await tx.select({ id: schema.quests.id }).from(schema.quests).where(eq(schema.quests.accountId, accountId));
      return { status: 'applied', result: { count: rows.length } };
    });

    commandBus.registerHandler(FAILING_COMMAND, () => Promise.reject(AppErrorCode.QST_001.create()));
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should apply a batch in order and return one outcome per command', async () => {
    const batch = [envelope(CREATE_COMMAND, { name: 'first', entityRef: 'ref-a' }), envelope(READ_COMMAND), envelope(CREATE_COMMAND, { name: 'second', entityRef: 'ref-b' })];
    const response = await submit(batch);

    expect(response.statusCode).toBe(200);
    const outcomes = response.json().outcomes as Outcome[];
    expect(outcomes).toHaveLength(3);
    expect(outcomes.every(outcome => outcome.status === 'applied')).toBe(true);
    expect(outcomes[1]!.result['count']).toBe(1);
  });

  it('should return the entity_ref to id mapping the handler recorded', async () => {
    const command = envelope(CREATE_COMMAND, { name: 'mapped', entityRef: 'ref-mapped' });
    const outcomes = (await submit([command])).json().outcomes as Outcome[];

    expect(outcomes[0]!.result['entityRef']).toBe('ref-mapped');
    expect(outcomes[0]!.result['id']).toMatch(/^\d+$/);
  });

  it('should carry the sync epoch on the response', async () => {
    const response = await submit([envelope(READ_COMMAND)]);
    expect(response.headers['x-sync-epoch']).toBe(Config.get('sync.epoch'));
  });

  it('should replay a resent batch verbatim without running its handlers again', async () => {
    const batch = [envelope(GRANT_COMMAND), envelope(GRANT_COMMAND)];

    const first = (await submit(batch)).json().outcomes as Outcome[];
    const second = (await submit(batch)).json().outcomes as Outcome[];

    expect(first.map(outcome => outcome.replayed)).toEqual([false, false]);
    expect(second.map(outcome => outcome.replayed)).toEqual([true, true]);
    expect(second.map(outcome => outcome.result)).toEqual(first.map(outcome => outcome.result));

    const events = await db.select().from(schema.heroEvents);
    const dedupeKeys = batch.map(command => `test_${command['commandId'] as string}`);
    expect(events.filter(event => dedupeKeys.includes(event.dedupeKey))).toHaveLength(2);
  });

  it('should reject a batch larger than 100 commands', async () => {
    const batch = Array.from({ length: 101 }, () => envelope(READ_COMMAND));
    const response = await submit(batch);
    expect(response.statusCode).toBe(422);
  });

  it('should reject an empty batch', async () => {
    const response = await submit([]);
    expect(response.statusCode).toBe(422);
  });

  it('should reject a batch naming an unregistered command type with 400 before applying any of it', async () => {
    const unknown = envelope('NoSuchCommand');
    const response = await submit([envelope(CREATE_COMMAND, { name: 'never-created', entityRef: 'ref-never' }), unknown]);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'CMD_001' });

    const quests = await db.select().from(schema.quests).where(eq(schema.quests.name, 'never-created'));
    expect(quests).toHaveLength(0);
  });

  it('should stop the batch at a failing command and leave nothing of it behind', async () => {
    const failing = envelope(FAILING_COMMAND);
    const trailing = envelope(CREATE_COMMAND, { name: 'after-failure', entityRef: 'ref-after' });
    const outcomes = (await submit([envelope(READ_COMMAND), failing, trailing])).json().outcomes as Outcome[];

    expect(outcomes).toHaveLength(2);
    expect(outcomes[1]).toMatchObject({ commandId: failing['commandId'], status: 'failed', error: { code: 'QST_001' } });

    const claimed = await db
      .select()
      .from(schema.commandLog)
      .where(eq(schema.commandLog.commandId, failing['commandId'] as string));
    expect(claimed).toHaveLength(0);
    const quests = await db.select().from(schema.quests).where(eq(schema.quests.name, 'after-failure'));
    expect(quests).toHaveLength(0);
  });

  it('should reject a service-typed token on the command endpoint', async () => {
    const response = await submit([envelope(READ_COMMAND)], await serviceToken());
    expect(response.statusCode).toBe(403);
  });

  it('should reject an unauthenticated request', async () => {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .body({ commands: [envelope(READ_COMMAND)] });
    expect(response.statusCode).toBe(401);
  });
});

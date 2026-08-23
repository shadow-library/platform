import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Module, ShadowApplication } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { CommandBus, type CommandEnvelope, CommandsModule, HeroLedger } from '@modules/commands';
import { AppErrorCode } from '@server/classes';
import { accounts, commandLog, DatastoreModule, heroEvents, type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule, CommandsModule] })
class CommandBusTestModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_command_bus_spec`;

const DATE = '2026-08-24';
const GRANT_COMMAND = 'TestGrant';
const FAILING_COMMAND = 'TestFailure';
const REJECTING_COMMAND = 'TestRejection';

describe('CommandBus (T-15)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let databaseService: DatabaseService;
  let commandBus: CommandBus;
  let db: PrimaryDatabase;
  let subCounter = 0;
  let commandCounter = 0;
  let handlerRuns = 0;

  async function createAccount(): Promise<bigint> {
    subCounter += 1;
    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: `sub-command-bus-${subCounter}`, authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning({ id: accounts.id }),
    );
    return account!.id;
  }

  function envelope(type: string, payload: Record<string, unknown> = {}): CommandEnvelope {
    commandCounter += 1;
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE, performedAt: `${DATE}T09:0${commandCounter % 10}:00.000Z` };
  }

  function readEvents(accountId: bigint): Promise<(typeof heroEvents.$inferSelect)[]> {
    return db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId));
  }

  function readCommands(accountId: bigint): Promise<(typeof commandLog.$inferSelect)[]> {
    return db.select().from(commandLog).where(eq(commandLog.accountId, accountId));
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = new ShadowApplication(CommandBusTestModule);
    await app.init();
    databaseService = app.get(DatabaseService);
    commandBus = app.get(CommandBus);
    db = databaseService.getPostgresClient() as PrimaryDatabase;

    const heroLedger = app.get(HeroLedger);
    commandBus.registerHandler(GRANT_COMMAND, async ({ accountId, envelope, tx }) => {
      handlerRuns += 1;
      const xpDelta = Number(envelope.payload['xpDelta'] ?? 7);
      const [outcome] = await heroLedger.grant(tx, accountId, [{ dedupeKey: `test_${envelope.commandId}`, type: 'side_quest', date: envelope.localDate, xpDelta }]);
      return { status: 'applied', result: { xp: outcome!.xpDelta, eventId: String(outcome!.eventId), run: handlerRuns } };
    });
    commandBus.registerHandler(FAILING_COMMAND, async ({ accountId, envelope, tx }) => {
      await heroLedger.grant(tx, accountId, [{ dedupeKey: `failing_${envelope.commandId}`, type: 'side_quest', date: envelope.localDate, xpDelta: 3 }]);
      throw AppErrorCode.CMD_001.create({ type: envelope.type });
    });
    commandBus.registerHandler(REJECTING_COMMAND, async () => ({ status: 'rejected', result: { reason: 'quest already terminal' } }));
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('registerHandler', () => {
    it('should refuse a second handler for a type already registered', () => {
      expect(() => commandBus.registerHandler(GRANT_COMMAND, async () => ({ status: 'applied', result: {} }))).toThrow();
    });

    it('should report every registered type so the sync endpoint can validate against it', () => {
      expect(commandBus.registeredTypes()).toContain(GRANT_COMMAND);
    });
  });

  describe('execute', () => {
    it('should reject a command type with no registered handler', async () => {
      const accountId = await createAccount();

      const thrown = await commandBus.execute(accountId, envelope('NoSuchCommand')).catch(error => error);

      expect(AppError.is(thrown, AppErrorCode.CMD_001)).toBe(true);
      expect(await readCommands(accountId)).toHaveLength(0);
    });

    it('should dispatch to the handler and record its result body on the command log', async () => {
      const accountId = await createAccount();
      const command = envelope(GRANT_COMMAND, { xpDelta: 9 });

      const outcome = await commandBus.execute(accountId, command);
      const [recorded] = await readCommands(accountId);

      expect(outcome.status).toBe('applied');
      expect(outcome.replayed).toBe(false);
      expect(outcome.result['xp']).toBe(9);
      expect(recorded?.commandId).toBe(command.commandId);
      expect(recorded?.type).toBe(GRANT_COMMAND);
      expect(recorded?.result).toEqual(outcome.result);
    });

    it('should return the recorded body when a committed command is resent after a lost response', async () => {
      const accountId = await createAccount();
      const command = envelope(GRANT_COMMAND, { xpDelta: 11 });

      const first = await commandBus.execute(accountId, command);
      const resent = await commandBus.execute(accountId, command);

      expect(resent.replayed).toBe(true);
      expect(resent.status).toBe(first.status);
      expect(resent.result).toEqual(first.result);
      expect(await readEvents(accountId)).toHaveLength(1);
      expect(await readCommands(accountId)).toHaveLength(1);
    });

    it('should converge five replays of the same command to one effect and one identical body', async () => {
      const accountId = await createAccount();
      const command = envelope(GRANT_COMMAND, { xpDelta: 6 });

      const outcomes = [];
      for (let attempt = 0; attempt < 5; attempt++) outcomes.push(await commandBus.execute(accountId, command));
      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));

      expect(outcomes.map(outcome => outcome.result)).toEqual(Array(5).fill(outcomes[0]!.result));
      expect(outcomes.filter(outcome => outcome.replayed)).toHaveLength(4);
      expect(await readEvents(accountId)).toHaveLength(1);
      expect(account?.totalXp).toBe(6n);
    });

    it('should apply the same command exactly once when two connections race it', async () => {
      const accountId = await createAccount();
      const command = envelope(GRANT_COMMAND, { xpDelta: 4 });

      const outcomes = await Promise.all([commandBus.execute(accountId, command), commandBus.execute(accountId, command)]);
      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));

      expect(outcomes.filter(outcome => outcome.replayed)).toHaveLength(1);
      expect(outcomes[0]!.result).toEqual(outcomes[1]!.result);
      expect(await readEvents(accountId)).toHaveLength(1);
      expect(await readCommands(accountId)).toHaveLength(1);
      expect(account?.totalXp).toBe(4n);
    });

    it('should apply each of eight concurrent copies of one command exactly once', async () => {
      const accountId = await createAccount();
      const command = envelope(GRANT_COMMAND, { xpDelta: 5 });

      const outcomes = await Promise.all(Array.from({ length: 8 }, () => commandBus.execute(accountId, command)));

      expect(outcomes.filter(outcome => outcome.replayed)).toHaveLength(7);
      expect(await readEvents(accountId)).toHaveLength(1);
      expect((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0]?.totalXp).toBe(5n);
    });

    it('should serialize distinct commands for one account behind the advisory lock', async () => {
      const accountId = await createAccount();
      const commands = Array.from({ length: 6 }, () => envelope(GRANT_COMMAND, { xpDelta: 3 }));

      await Promise.all(commands.map(command => commandBus.execute(accountId, command)));

      expect(await readEvents(accountId)).toHaveLength(6);
      expect((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0]?.totalXp).toBe(18n);
    });

    it('should leave no claim behind when the handler fails', async () => {
      const accountId = await createAccount();
      const command = envelope(FAILING_COMMAND);

      const thrown = await commandBus.execute(accountId, command).catch(error => error);

      expect(AppError.is(thrown, AppErrorCode.CMD_001)).toBe(true);
      expect(await readCommands(accountId)).toHaveLength(0);
      expect(await readEvents(accountId)).toHaveLength(0);
    });

    it('should replay a failed command cleanly once its cause is gone', async () => {
      const accountId = await createAccount();
      await commandBus.execute(accountId, envelope(FAILING_COMMAND)).catch(() => undefined);

      const outcome = await commandBus.execute(accountId, envelope(GRANT_COMMAND, { xpDelta: 2 }));

      expect(outcome.status).toBe('applied');
      expect(await readCommands(accountId)).toHaveLength(1);
    });

    it('should record a rejected outcome and return it verbatim on replay', async () => {
      const accountId = await createAccount();
      const command = envelope(REJECTING_COMMAND);

      const first = await commandBus.execute(accountId, command);
      const replayed = await commandBus.execute(accountId, command);

      expect(first.status).toBe('rejected');
      expect(replayed.status).toBe('rejected');
      expect(replayed.replayed).toBe(true);
      expect(replayed.result).toEqual({ reason: 'quest already terminal' });
    });

    it('should scope the command id to the account so two accounts may replay the same id', async () => {
      const first = await createAccount();
      const second = await createAccount();
      const command = envelope(GRANT_COMMAND, { xpDelta: 1 });

      const firstOutcome = await commandBus.execute(first, command);
      const secondOutcome = await commandBus.execute(second, command);

      expect(firstOutcome.replayed).toBe(false);
      expect(secondOutcome.replayed).toBe(false);
      expect(await readEvents(second)).toHaveLength(1);
    });
  });
});

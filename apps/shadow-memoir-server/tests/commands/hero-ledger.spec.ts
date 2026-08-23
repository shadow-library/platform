import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq, sql } from 'drizzle-orm';
import { Module, ShadowApplication } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { CommandsModule, type GrantIntent, type GrantOutcome, HeroLedger } from '@modules/commands';
import { currentRuleset, levelFor, type StatAffinity, xpThresholdForLevel } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import { accounts, type DatabaseTransaction, DatastoreModule, heroEvents, type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule, CommandsModule] })
class HeroLedgerTestModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_hero_ledger_spec`;

const DATE = '2026-08-24';
const AFFINITIES: StatAffinity[] = ['discipline', 'body', 'wealth', 'mind'];

describe('HeroLedger (T-15)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let databaseService: DatabaseService;
  let heroLedger: HeroLedger;
  let db: PrimaryDatabase;
  let subCounter = 0;

  async function createAccount(): Promise<bigint> {
    subCounter += 1;
    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: `sub-hero-ledger-${subCounter}`, authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning({ id: accounts.id }),
    );
    return account!.id;
  }

  function grant(accountId: bigint, intents: GrantIntent[]): Promise<GrantOutcome[]> {
    return db.transaction((tx: DatabaseTransaction) => heroLedger.grant(tx, accountId, intents));
  }

  function readAccount(accountId: bigint): Promise<typeof accounts.$inferSelect> {
    return db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .then(rows => rows[0]!);
  }

  function readEvents(accountId: bigint): Promise<(typeof heroEvents.$inferSelect)[]> {
    return db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId)).orderBy(heroEvents.id);
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = new ShadowApplication(HeroLedgerTestModule);
    await app.init();
    databaseService = app.get(DatabaseService);
    heroLedger = app.get(HeroLedger);
    db = databaseService.getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('grant', () => {
    it('should append the event and move the account mirrors in the same transaction', async () => {
      const accountId = await createAccount();

      const [outcome] = await grant(accountId, [
        { dedupeKey: 'questlog_1_xp', type: 'quest_complete', date: DATE, xpDelta: 12, coinsDelta: 2, statAffinity: 'body', statDelta: 1 },
      ]);
      const account = await readAccount(accountId);

      expect(outcome?.status).toBe('applied');
      expect(account.totalXp).toBe(12n);
      expect(account.coins).toBe(2);
      expect(account.statBody).toBe(1);
      expect(account.statDiscipline).toBe(0);
    });

    it('should stamp the current ruleset version on every event it writes', async () => {
      const accountId = await createAccount();

      await grant(accountId, [{ dedupeKey: 'questlog_2_xp', type: 'quest_complete', date: DATE, xpDelta: 5 }]);
      const [event] = await readEvents(accountId);

      expect(event?.rulesetVersion).toBe(currentRuleset().version);
    });

    it('should converge a replayed dedupe key to the recorded deltas without moving the mirrors again', async () => {
      const accountId = await createAccount();
      const intent: GrantIntent = { dedupeKey: 'questlog_3_xp', type: 'quest_complete', date: DATE, xpDelta: 10, coinsDelta: 1, statAffinity: 'mind', statDelta: 1 };

      const [first] = await grant(accountId, [intent]);
      const [second] = await grant(accountId, [{ ...intent, xpDelta: 999, coinsDelta: 99 }]);
      const account = await readAccount(accountId);

      expect(first?.status).toBe('applied');
      expect(second?.status).toBe('duplicate');
      expect(second?.eventId).toBe(first!.eventId);
      expect(second?.xpDelta).toBe(10);
      expect(second?.coinsDelta).toBe(1);
      expect(account.totalXp).toBe(10n);
      expect(account.coins).toBe(1);
      expect(await readEvents(accountId)).toHaveLength(1);
    });

    it('should converge five replays of the same grant to a single event', async () => {
      const accountId = await createAccount();
      const intent: GrantIntent = { dedupeKey: 'sidequest_a1', type: 'side_quest', date: DATE, xpDelta: 8, coinsDelta: 1 };

      for (let attempt = 0; attempt < 5; attempt++) await grant(accountId, [intent]);
      const account = await readAccount(accountId);

      expect(await readEvents(accountId)).toHaveLength(1);
      expect(account.totalXp).toBe(8n);
      expect(account.coins).toBe(1);
    });

    it('should append a levelup event keyed per level when the grant crosses a threshold', async () => {
      const accountId = await createAccount();
      const threshold = xpThresholdForLevel(currentRuleset(), 2);

      const [outcome] = await grant(accountId, [{ dedupeKey: 'questlog_4_xp', type: 'quest_complete', date: DATE, xpDelta: threshold }]);
      const events = await readEvents(accountId);
      const account = await readAccount(accountId);

      expect(outcome?.leveledUp).toBe(true);
      expect(account.level).toBe(2);
      expect(events).toHaveLength(2);
      expect(events[1]?.type).toBe('level_up');
      expect(events[1]?.dedupeKey).toBe('levelup_2');
      expect(events[1]?.levelAfter).toBe(2);
      expect(events[1]?.xpDelta).toBe(0);
    });

    it('should key one levelup event per level crossed when a grant spans several', async () => {
      const accountId = await createAccount();
      const threshold = xpThresholdForLevel(currentRuleset(), 3);

      await grant(accountId, [{ dedupeKey: 'questlog_5_xp', type: 'quest_complete', date: DATE, xpDelta: threshold }]);
      const events = await readEvents(accountId);

      expect(events.filter(event => event.type === 'level_up').map(event => event.dedupeKey)).toEqual(['levelup_2', 'levelup_3']);
      expect((await readAccount(accountId)).level).toBe(3);
    });

    it('should not append a second levelup event for a level already recorded', async () => {
      const accountId = await createAccount();
      const threshold = xpThresholdForLevel(currentRuleset(), 2);

      await grant(accountId, [{ dedupeKey: 'questlog_6_xp', type: 'quest_complete', date: DATE, xpDelta: threshold }]);
      await grant(accountId, [{ dedupeKey: 'levelup_2', type: 'level_up', date: DATE }]);
      const events = await readEvents(accountId);

      expect(events.filter(event => event.type === 'level_up')).toHaveLength(1);
    });

    it('should stop the levelup derivation at depth one', async () => {
      const accountId = await createAccount();

      await grant(accountId, [{ dedupeKey: 'questlog_7_xp', type: 'quest_complete', date: DATE, xpDelta: xpThresholdForLevel(currentRuleset(), 2) }]);
      const derived = await readEvents(accountId).then(events => events.filter(event => event.type === 'level_up'));

      expect(derived).toHaveLength(1);
      expect(derived[0]?.xpDelta).toBe(0);
      expect(derived[0]?.coinsDelta).toBe(0);
    });

    it('should record a coin spend as a negative delta against the balance', async () => {
      const accountId = await createAccount();
      await grant(accountId, [{ dedupeKey: 'questlog_8_xp', type: 'quest_complete', date: DATE, coinsDelta: 5 }]);

      await grant(accountId, [{ dedupeKey: 'coinspend_cloak', type: 'coin_spend', date: DATE, coinsDelta: -3 }]);
      const account = await readAccount(accountId);

      expect(account.coins).toBe(2);
    });

    it('should refuse a coin spend beyond the balance rather than driving the mirror negative', async () => {
      const accountId = await createAccount();
      await grant(accountId, [{ dedupeKey: 'questlog_9_xp', type: 'quest_complete', date: DATE, coinsDelta: 2 }]);

      const thrown = await grant(accountId, [{ dedupeKey: 'coinspend_crown', type: 'coin_spend', date: DATE, coinsDelta: -5 }]).catch(error => error);
      const account = await readAccount(accountId);

      expect(AppError.is(thrown, AppErrorCode.HRO_001)).toBe(true);
      expect(account.coins).toBe(2);
      expect(await readEvents(accountId)).toHaveLength(1);
    });

    it('should converge a replayed coin spend to the recorded charge exactly once', async () => {
      const accountId = await createAccount();
      await grant(accountId, [{ dedupeKey: 'questlog_10_xp', type: 'quest_complete', date: DATE, coinsDelta: 10 }]);
      const intent: GrantIntent = { dedupeKey: 'coinspend_hood', type: 'coin_spend', date: DATE, coinsDelta: -4 };

      await grant(accountId, [intent]);
      const [replayed] = await grant(accountId, [intent]);

      expect(replayed?.status).toBe('duplicate');
      expect(replayed?.coinsDelta).toBe(-4);
      expect((await readAccount(accountId)).coins).toBe(6);
    });

    it('should keep the account mirrors equal to the summed event stream after a fuzzed sequence', async () => {
      const accountId = await createAccount();
      const keys = Array.from({ length: 12 }, (_, index) => `fuzz_${index}`);
      const intents: GrantIntent[] = [];
      for (let index = 0; index < 120; index++) {
        const affinity = AFFINITIES[Math.floor(Math.random() * AFFINITIES.length)]!;
        intents.push({
          dedupeKey: keys[Math.floor(Math.random() * keys.length)]!,
          type: 'quest_complete',
          date: DATE,
          xpDelta: Math.floor(Math.random() * 26),
          coinsDelta: Math.floor(Math.random() * 4),
          statAffinity: affinity,
          statDelta: 1,
        });
      }

      for (const intent of intents) await grant(accountId, [intent]);

      const [sums] = await db
        .select({
          xp: sql<string>`coalesce(sum(${heroEvents.xpDelta}), 0)`,
          coins: sql<string>`coalesce(sum(${heroEvents.coinsDelta}), 0)`,
          discipline: sql<string>`coalesce(sum(${heroEvents.statDelta}) filter (where ${heroEvents.statAffinity} = 'discipline'), 0)`,
          body: sql<string>`coalesce(sum(${heroEvents.statDelta}) filter (where ${heroEvents.statAffinity} = 'body'), 0)`,
          wealth: sql<string>`coalesce(sum(${heroEvents.statDelta}) filter (where ${heroEvents.statAffinity} = 'wealth'), 0)`,
          mind: sql<string>`coalesce(sum(${heroEvents.statDelta}) filter (where ${heroEvents.statAffinity} = 'mind'), 0)`,
        })
        .from(heroEvents)
        .where(eq(heroEvents.accountId, accountId));
      const account = await readAccount(accountId);

      expect(account.totalXp).toBe(BigInt(sums!.xp));
      expect(account.coins).toBe(Number(sums!.coins));
      expect(account.statDiscipline).toBe(Number(sums!.discipline));
      expect(account.statBody).toBe(Number(sums!.body));
      expect(account.statWealth).toBe(Number(sums!.wealth));
      expect(account.statMind).toBe(Number(sums!.mind));
      expect(account.level).toBe(levelFor(currentRuleset(), Number(account.totalXp)));
    });

    it('should leave nothing behind when the enclosing transaction rolls back', async () => {
      const accountId = await createAccount();

      const thrown = await db
        .transaction(async (tx: DatabaseTransaction) => {
          await heroLedger.grant(tx, accountId, [{ dedupeKey: 'rolled_back', type: 'quest_complete', date: DATE, xpDelta: 20 }]);
          throw AppError.internal('aborting the enclosing command transaction');
        })
        .catch(error => error);

      expect(thrown).toBeDefined();
      expect(await readEvents(accountId)).toHaveLength(0);
      expect((await readAccount(accountId)).totalXp).toBe(0n);
    });

    it('should scope dedupe keys to the account so two accounts can hold the same key', async () => {
      const first = await createAccount();
      const second = await createAccount();
      const intent: GrantIntent = { dedupeKey: 'journalxp_2026-08-24', type: 'journal', date: DATE, xpDelta: 5 };

      const [firstOutcome] = await grant(first, [intent]);
      const [secondOutcome] = await grant(second, [intent]);

      expect(firstOutcome?.status).toBe('applied');
      expect(secondOutcome?.status).toBe('applied');
      expect(
        await db
          .select()
          .from(heroEvents)
          .where(and(eq(heroEvents.dedupeKey, intent.dedupeKey), eq(heroEvents.accountId, second))),
      ).toHaveLength(1);
    });
  });
});

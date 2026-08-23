import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq, sql } from 'drizzle-orm';
import { Module, ShadowApplication } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  accounts,
  achievementsEarned,
  comebackEvents,
  cosmeticUnlocks,
  dailyStates,
  DatastoreModule,
  heroEvents,
  type PrimaryDatabase,
  questLogs,
  quests,
  questStreaks,
  recoveryQuests,
  rescheduleEvents,
  returnerEvents,
  shieldConsumptions,
  titlesEarned,
} from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule] })
class GameSchemaTestModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_game_schema_spec`;

const DATE = '2026-08-24';

describe('game schema (T-13)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let databaseService: DatabaseService;
  let db: PrimaryDatabase;
  let accountId: bigint;
  let questId: bigint;

  async function capture(operation: () => Promise<unknown>): Promise<unknown> {
    let thrown: unknown;
    await databaseService.run(operation).catch(error => (thrown = error));
    return thrown;
  }

  function newQuestLog(overrides: Partial<typeof questLogs.$inferInsert> = {}): typeof questLogs.$inferInsert {
    return {
      accountId,
      questId,
      date: DATE,
      state: 'missed',
      statAffinity: 'discipline',
      strictness: 'routine',
      intensityModeAtLog: 'standard',
      crownSliceWeight: '1.00',
      rulesetVersion: 1,
      ...overrides,
    };
  }

  function newHeroEvent(dedupeKey: string, overrides: Partial<typeof heroEvents.$inferInsert> = {}): typeof heroEvents.$inferInsert {
    return { accountId, dedupeKey, type: 'quest_complete', date: DATE, rulesetVersion: 1, ...overrides };
  }

  function newDailyState(date: string, overrides: Partial<typeof dailyStates.$inferInsert> = {}): typeof dailyStates.$inferInsert {
    return { accountId, date, intensityMode: 'standard', hpStart: 5, hpEnd: 5, hpMax: 5, crownPeriodStart: date, rulesetVersion: 1, ...overrides };
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = new ShadowApplication(GameSchemaTestModule);
    await app.init();
    databaseService = app.get(DatabaseService);
    db = databaseService.getPostgresClient() as PrimaryDatabase;

    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: 'sub-game-schema', authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning(),
    );
    accountId = account!.id;

    const [quest] = await databaseService.run(() =>
      db
        .insert(quests)
        .values({ accountId, name: 'Morning run', durationMin: 30, statAffinity: 'body', strictness: 'routine', recurrence: { frequency: 'daily', interval: 1 } })
        .returning(),
    );
    questId = quest!.id;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('hero_events', () => {
    it('should collapse a replayed grant to a no-op through the dedupe unique constraint', async () => {
      await databaseService.run(() => db.insert(heroEvents).values(newHeroEvent('questlog_1_xp')));

      const replayed = await databaseService.run(() => db.insert(heroEvents).values(newHeroEvent('questlog_1_xp')).onConflictDoNothing().returning());
      const rows = await databaseService.run(() => db.select().from(heroEvents).where(eq(heroEvents.dedupeKey, 'questlog_1_xp')));

      expect(replayed).toHaveLength(0);
      expect(rows).toHaveLength(1);
    });

    it('should reject a negative coins_delta for a grant type via the Invariant 1 check constraint', async () => {
      const thrown = await capture(() => db.insert(heroEvents).values(newHeroEvent('coin_grant_bad', { type: 'coin_grant', coinsDelta: -5 })));

      expect(AppError.is(thrown)).toBe(true);
      expect((thrown as AppError).isInternal).toBe(true);
    });

    it('should accept a negative coins_delta for a coin_spend event', async () => {
      const [row] = await databaseService.run(() =>
        db
          .insert(heroEvents)
          .values(newHeroEvent('coinspend_cloak', { type: 'coin_spend', coinsDelta: -5 }))
          .returning(),
      );

      expect(row?.coinsDelta).toBe(-5);
    });

    it('should reject a negative xp_delta via the monotonic-xp check constraint', async () => {
      const thrown = await capture(() => db.insert(heroEvents).values(newHeroEvent('xp_bad', { xpDelta: -1 })));

      expect(AppError.is(thrown)).toBe(true);
    });
  });

  describe('quest_logs', () => {
    it('should converge a system miss and a user completion onto one occurrence row', async () => {
      await databaseService.run(() => db.insert(questLogs).values(newQuestLog()));

      await databaseService.run(() =>
        db
          .insert(questLogs)
          .values(newQuestLog({ state: 'completed', xpAwarded: 10 }))
          .onConflictDoUpdate({
            target: [questLogs.accountId, questLogs.questId, questLogs.date],
            set: { state: 'completed', xpAwarded: 10 },
            setWhere: eq(questLogs.state, 'missed'),
          }),
      );

      const rows = await databaseService.run(() =>
        db
          .select()
          .from(questLogs)
          .where(and(eq(questLogs.questId, questId), eq(questLogs.date, DATE))),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ state: 'completed', xpAwarded: 10 });
    });

    it('should never let a later system miss overwrite a user terminal state', async () => {
      await databaseService.run(() =>
        db
          .insert(questLogs)
          .values(newQuestLog())
          .onConflictDoUpdate({
            target: [questLogs.accountId, questLogs.questId, questLogs.date],
            set: { state: 'missed', xpAwarded: 0 },
            setWhere: eq(questLogs.state, 'missed'),
          }),
      );

      const rows = await databaseService.run(() =>
        db
          .select()
          .from(questLogs)
          .where(and(eq(questLogs.questId, questId), eq(questLogs.date, DATE))),
      );

      expect(rows[0]).toMatchObject({ state: 'completed', xpAwarded: 10 });
    });

    it('should reject a duplicate occurrence inserted without conflict handling', async () => {
      const thrown = await capture(() => db.insert(questLogs).values(newQuestLog()));

      expect(AppError.is(thrown)).toBe(true);
      expect((thrown as AppError).isInternal).toBe(true);
    });
  });

  describe('daily_states', () => {
    it('should make a racing rollover of the same day a no-op through the composite primary key', async () => {
      await databaseService.run(() => db.insert(dailyStates).values(newDailyState('2026-08-20')));

      const raced = await databaseService.run(() =>
        db
          .insert(dailyStates)
          .values(newDailyState('2026-08-20', { hpEnd: 1 }))
          .onConflictDoNothing()
          .returning(),
      );
      const rows = await databaseService.run(() => db.select().from(dailyStates).where(eq(dailyStates.date, '2026-08-20')));

      expect(raced).toHaveLength(0);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.hpEnd).toBe(5);
    });

    it('should leave a terminalized day untouched under the rollover_at IS NULL writer convention', async () => {
      await databaseService.run(() => db.insert(dailyStates).values(newDailyState('2026-08-21', { rolloverAt: new Date(), rolloverEngineVersion: 'v1' })));

      const updated = await databaseService.run(() =>
        db
          .update(dailyStates)
          .set({ missedCount: 9 })
          .where(and(eq(dailyStates.date, '2026-08-21'), sql`${dailyStates.rolloverAt} IS NULL`))
          .returning(),
      );
      const [row] = await databaseService.run(() => db.select().from(dailyStates).where(eq(dailyStates.date, '2026-08-21')));

      expect(updated).toHaveLength(0);
      expect(row?.missedCount).toBe(0);
    });

    it('should still accept writes to an open day', async () => {
      await databaseService.run(() => db.insert(dailyStates).values(newDailyState('2026-08-22')));

      const updated = await databaseService.run(() =>
        db
          .update(dailyStates)
          .set({ missedCount: 3 })
          .where(and(eq(dailyStates.date, '2026-08-22'), sql`${dailyStates.rolloverAt} IS NULL`))
          .returning(),
      );

      expect(updated[0]?.missedCount).toBe(3);
    });
  });

  describe('reschedule_events', () => {
    it('should reject a second move of the same occurrence through the mapped domain error', async () => {
      await databaseService.run(() => db.insert(rescheduleEvents).values({ accountId, questId, date: DATE, fromMin: 420, toMin: 480 }));

      const thrown = await capture(() => db.insert(rescheduleEvents).values({ accountId, questId, date: DATE, fromMin: 480, toMin: 540 }));

      expect(AppError.is(thrown, AppErrorCode.QST_001)).toBe(true);
    });
  });

  describe('recovery_quests', () => {
    it('should spawn at most one recovery per day', async () => {
      const values = { accountId, date: DATE, sourceQuestId: questId, sourceQuestName: 'Morning run', expiresAt: new Date() };
      await databaseService.run(() => db.insert(recoveryQuests).values(values));

      const respawned = await databaseService.run(() => db.insert(recoveryQuests).values(values).onConflictDoNothing().returning());
      const rows = await databaseService.run(() => db.select().from(recoveryQuests).where(eq(recoveryQuests.date, DATE)));

      expect(respawned).toHaveLength(0);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.state).toBe('pending');
    });
  });

  describe('comeback_events', () => {
    it('should record one event per kind per day and no-op on a repeat of the same kind', async () => {
      await databaseService.run(() => db.insert(comebackEvents).values({ accountId, date: DATE, kind: 'armed', intensityMode: 'standard' }));

      const refired = await databaseService.run(() =>
        db.insert(comebackEvents).values({ accountId, date: DATE, kind: 'armed', intensityMode: 'standard' }).onConflictDoNothing().returning(),
      );
      const [fired] = await databaseService.run(() =>
        db.insert(comebackEvents).values({ accountId, date: DATE, kind: 'fired', intensityMode: 'standard' }).onConflictDoNothing().returning(),
      );

      expect(refired).toHaveLength(0);
      expect(fired?.kind).toBe('fired');
    });
  });

  describe('returner_events', () => {
    it('should fire one ritual per return day', async () => {
      const values = { accountId, date: DATE, returnDate: DATE, lastActiveDate: '2026-08-10', daysAbsent: 14, intensityMode: 'standard' } as const;
      await databaseService.run(() => db.insert(returnerEvents).values(values));

      const refired = await databaseService.run(() => db.insert(returnerEvents).values(values).onConflictDoNothing().returning());

      expect(refired).toHaveLength(0);
    });
  });

  describe('shield_consumptions', () => {
    it('should let one break consume at most one shield', async () => {
      await databaseService.run(() => db.insert(shieldConsumptions).values({ accountId, questId, date: DATE }));

      const second = await databaseService.run(() => db.insert(shieldConsumptions).values({ accountId, questId, date: DATE }).onConflictDoNothing().returning());
      const rows = await databaseService.run(() => db.select().from(shieldConsumptions).where(eq(shieldConsumptions.date, DATE)));

      expect(second).toHaveLength(0);
      expect(rows).toHaveLength(1);
    });
  });

  describe('achievements_earned', () => {
    it('should grant an achievement once', async () => {
      await databaseService.run(() => db.insert(achievementsEarned).values({ accountId, achievementId: 'first_quest' }));

      const regrant = await databaseService.run(() => db.insert(achievementsEarned).values({ accountId, achievementId: 'first_quest' }).onConflictDoNothing().returning());

      expect(regrant).toHaveLength(0);
    });
  });

  describe('titles_earned', () => {
    it('should grant a title once', async () => {
      await databaseService.run(() => db.insert(titlesEarned).values({ accountId, titleId: 'steady_builder' }));

      const regrant = await databaseService.run(() => db.insert(titlesEarned).values({ accountId, titleId: 'steady_builder' }).onConflictDoNothing().returning());

      expect(regrant).toHaveLength(0);
    });
  });

  describe('cosmetic_unlocks', () => {
    it('should reject a repeat purchase through the mapped domain error so a raced buy charges once', async () => {
      await databaseService.run(() => db.insert(cosmeticUnlocks).values({ accountId, cosmeticId: 'midnight_cloak', source: 'coin' }));

      const thrown = await capture(() => db.insert(cosmeticUnlocks).values({ accountId, cosmeticId: 'midnight_cloak', source: 'coin' }));

      expect(AppError.is(thrown, AppErrorCode.CSM_001)).toBe(true);
    });
  });

  describe('quest_streaks', () => {
    it('should hold one projection row per quest through the composite primary key', async () => {
      await databaseService.run(() => db.insert(questStreaks).values({ accountId, questId, currentRunDays: 3 }));

      const raced = await databaseService.run(() => db.insert(questStreaks).values({ accountId, questId, currentRunDays: 1 }).onConflictDoNothing().returning());
      const rows = await databaseService.run(() => db.select().from(questStreaks).where(eq(questStreaks.questId, questId)));

      expect(raced).toHaveLength(0);
      expect(rows[0]?.currentRunDays).toBe(3);
    });

    it('should reject a shield count above the per-quest cap', async () => {
      const thrown = await capture(() => db.update(questStreaks).set({ shieldsAvailable: 3 }).where(eq(questStreaks.questId, questId)));

      expect(AppError.is(thrown)).toBe(true);
    });
  });

  describe('sync_seq', () => {
    it('should draw every syncable game table default from the one global sequence', async () => {
      const [log] = await databaseService.run(() => db.select().from(questLogs).where(eq(questLogs.date, DATE)));
      const [quest] = await databaseService.run(() => db.select().from(quests).where(eq(quests.id, questId)));

      expect(log?.syncSeq).toBeGreaterThan(0n);
      expect(quest?.syncSeq).toBeGreaterThan(0n);
    });
  });
});

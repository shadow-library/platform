import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { HeroLedger } from '@modules/commands';
import { ProgressionModule, ProgressionService } from '@modules/progression';
import { addDays, currentRuleset, formatLocalDate, parseLocalDate, type StatAffinity, streakTierMinDays, type Strictness } from '@modules/rules';
import { achievementsEarned, type DatabaseTransaction, DatastoreModule, type PrimaryDatabase, schema, titlesEarned } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule, ProgressionModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_progression_catalogue_spec`;

const ruleset = currentRuleset();
const DATE = '2026-08-24';

/**
 * Every one of the 34 T-21 conditions, driven the way `rules/achievement.ts` and `rules/title.ts` name
 * them (PRD §4.7/§4.8): a real `ProgressionService`/`HeroLedger` call sequence inside a real transaction
 * against a real Postgres database, the same calls the command handlers wire in (`quest-commands.service.ts`,
 * `finance-commands.service.ts`, `rollover.service.ts`, `ocr.service.ts`). Three conditions
 * (`first_recovery_completed`/`restorer`, `first_comeback_claimed`/`comeback_steady`,
 * `first_locked_day_cleared`/`architect`) have no game-event source yet — Recovery Quest completion,
 * Comeback claim, and the Overload lock mechanic are T-20/future scope, not built in this worktree — so
 * those cases drive `ProgressionService`'s scaffolded trigger methods directly, documented in the T-21
 * module report as the exact one-line call T-20's own command handler should add.
 */
describe('Achievements & Titles catalogue (T-21)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let progression: ProgressionService;
  let heroLedger: HeroLedger;
  let accountCounter = 0;

  async function freshAccountId(): Promise<bigint> {
    accountCounter += 1;
    const [account] = await db
      .insert(schema.accounts)
      .values({ identitySub: `progression-catalogue-${accountCounter}`, authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
      .returning();
    return account!.id;
  }

  async function freshQuestId(accountId: bigint): Promise<bigint> {
    const [quest] = await db
      .insert(schema.quests)
      .values({ accountId, name: 'Reschedule fixture', durationMin: 30, statAffinity: 'discipline', strictness: 'routine', recurrence: { frequency: 'daily', interval: 1 } })
      .returning();
    return quest!.id;
  }

  async function grantXp(tx: DatabaseTransaction, accountId: bigint, dedupeKey: string, xpDelta: number): Promise<void> {
    await heroLedger.grant(tx, accountId, [{ dedupeKey, type: 'quest_complete', date: DATE, xpDelta }]);
  }

  async function grantStat(tx: DatabaseTransaction, accountId: bigint, dedupeKey: string, statAffinity: StatAffinity, statDelta: number): Promise<void> {
    await heroLedger.grant(tx, accountId, [{ dedupeKey, type: 'quest_complete', date: DATE, statAffinity, statDelta }]);
  }

  async function complete(
    tx: DatabaseTransaction,
    accountId: bigint,
    overrides: { strictness?: Strictness; isAnchor?: boolean; priorStreakDays?: number; postStreakDays?: number; date?: string } = {},
  ): Promise<void> {
    await progression.onQuestCompletion(tx, accountId, {
      date: overrides.date ?? DATE,
      strictness: overrides.strictness ?? 'routine',
      isAnchor: overrides.isAnchor ?? false,
      priorStreakDays: overrides.priorStreakDays ?? 0,
      postStreakDays: overrides.postStreakDays ?? 1,
    });
  }

  async function repeat(times: number, run: (index: number) => Promise<void>): Promise<void> {
    for (let index = 0; index < times; index += 1) await run(index);
  }

  interface CatalogueCase {
    id: string;
    setup: (tx: DatabaseTransaction, accountId: bigint) => Promise<void>;
  }

  const achievementCases: CatalogueCase[] = [
    { id: 'first_quest_completed', setup: (tx, accountId) => complete(tx, accountId) },
    {
      id: 'first_level_up',
      setup: async (tx, accountId) => {
        await grantXp(tx, accountId, 'catalogue_level_xp', 200);
        await complete(tx, accountId);
      },
    },
    { id: 'first_bronze_streak', setup: (tx, accountId) => complete(tx, accountId, { postStreakDays: streakTierMinDays(ruleset, 'bronze') }) },
    { id: 'first_silver_streak', setup: (tx, accountId) => complete(tx, accountId, { postStreakDays: streakTierMinDays(ruleset, 'silver') }) },
    { id: 'first_gold_streak', setup: (tx, accountId) => complete(tx, accountId, { postStreakDays: streakTierMinDays(ruleset, 'gold') }) },
    { id: 'first_platinum_streak', setup: (tx, accountId) => complete(tx, accountId, { postStreakDays: streakTierMinDays(ruleset, 'platinum') }) },
    {
      id: 'xp_100',
      setup: async (tx, accountId) => {
        await grantXp(tx, accountId, 'catalogue_xp_100', 100);
        await complete(tx, accountId);
      },
    },
    {
      id: 'xp_500',
      setup: async (tx, accountId) => {
        await grantXp(tx, accountId, 'catalogue_xp_500', 500);
        await complete(tx, accountId);
      },
    },
    { id: 'first_subscription_confirmed', setup: (tx, accountId) => progression.onSubscriptionConfirmed(tx, accountId, DATE) },
    {
      id: 'all_stats_touched',
      setup: async (tx, accountId) => {
        await grantStat(tx, accountId, 'catalogue_stat_discipline', 'discipline', 1);
        await grantStat(tx, accountId, 'catalogue_stat_body', 'body', 1);
        await grantStat(tx, accountId, 'catalogue_stat_wealth', 'wealth', 1);
        await grantStat(tx, accountId, 'catalogue_stat_mind', 'mind', 1);
        await complete(tx, accountId);
      },
    },
    { id: 'first_full_hp_day', setup: (tx, accountId) => progression.onDayClosed(tx, accountId, DATE, 1, 0) },
    { id: 'first_crown_banked', setup: (tx, accountId) => progression.onCrownBanked(tx, accountId, DATE) },
    { id: 'first_recovery_completed', setup: (tx, accountId) => progression.onRecoveryQuestCompleted(tx, accountId, DATE) },
    { id: 'first_locked_day_cleared', setup: (tx, accountId) => progression.onLockedDayCleared(tx, accountId, DATE) },
    { id: 'first_comeback_claimed', setup: (tx, accountId) => progression.onComebackBonusClaimed(tx, accountId, DATE) },
    { id: 'first_returner_ritual', setup: (tx, accountId) => progression.onReturnerFired(tx, accountId, DATE) },
  ];

  const titleCases: CatalogueCase[] = [
    {
      id: 'steady_builder',
      setup: async (tx, accountId) => {
        await grantStat(tx, accountId, 'catalogue_title_discipline', 'discipline', 60);
        await complete(tx, accountId);
      },
    },
    {
      id: 'body_tempered',
      setup: async (tx, accountId) => {
        await grantStat(tx, accountId, 'catalogue_title_body', 'body', 60);
        await complete(tx, accountId);
      },
    },
    {
      id: 'wealth_disciplined',
      setup: async (tx, accountId) => {
        await grantStat(tx, accountId, 'catalogue_title_wealth', 'wealth', 60);
        await complete(tx, accountId);
      },
    },
    {
      id: 'mind_cultivated',
      setup: async (tx, accountId) => {
        await grantStat(tx, accountId, 'catalogue_title_mind', 'mind', 60);
        await complete(tx, accountId);
      },
    },
    { id: 'anchor_holder', setup: (tx, accountId) => complete(tx, accountId, { strictness: 'anchor', isAnchor: true, postStreakDays: streakTierMinDays(ruleset, 'gold') }) },
    { id: 'goal_keeper', setup: (tx, accountId) => repeat(30, () => complete(tx, accountId, { strictness: 'goal' })) },
    { id: 'routine_forged', setup: (tx, accountId) => repeat(100, () => complete(tx, accountId, { strictness: 'routine' })) },
    {
      id: 'quiet_climber',
      setup: (tx, accountId) => repeat(3, () => complete(tx, accountId, { priorStreakDays: 0, postStreakDays: streakTierMinDays(ruleset, 'silver') })),
    },
    { id: 'architect', setup: (tx, accountId) => repeat(10, () => progression.onLockedDayCleared(tx, accountId, DATE)) },
    {
      id: 'honest_planner',
      setup: async (tx, accountId) => {
        const questId = await freshQuestId(accountId);
        await repeat(10, async index => {
          await tx.insert(schema.rescheduleEvents).values({ accountId, questId, date: recentDate(index), toMin: 480, reasonTag: 'forgot' });
        });
        await progression.onRescheduleReasonLogged(tx, accountId, DATE);
      },
    },
    { id: 'reflective_practitioner', setup: (tx, accountId) => repeat(20, () => progression.onReasonTagged(tx, accountId, DATE)) },
    { id: 'restorer', setup: (tx, accountId) => repeat(5, () => progression.onRecoveryQuestCompleted(tx, accountId, DATE)) },
    {
      id: 'returner',
      setup: async (tx, accountId) => {
        await progression.onReturnerFired(tx, accountId, DATE);
        await complete(tx, accountId);
      },
    },
    { id: 'comeback_steady', setup: (tx, accountId) => repeat(10, () => progression.onComebackBonusClaimed(tx, accountId, DATE)) },
    { id: 'optional_surplus', setup: (tx, accountId) => repeat(30, () => complete(tx, accountId, { strictness: 'optional' })) },
    {
      id: 'cross_stat_climber',
      setup: async (tx, accountId) => {
        await grantStat(tx, accountId, 'catalogue_cross_discipline', 'discipline', 30);
        await grantStat(tx, accountId, 'catalogue_cross_body', 'body', 30);
        await grantStat(tx, accountId, 'catalogue_cross_wealth', 'wealth', 30);
        await grantStat(tx, accountId, 'catalogue_cross_mind', 'mind', 30);
        await complete(tx, accountId);
      },
    },
    { id: 'quiet_year', setup: (tx, accountId) => repeat(365, index => complete(tx, accountId, { date: dateForIndex(index) })) },
  ];

  function dateForIndex(index: number): string {
    const start = Date.UTC(2020, 0, 1);
    const date = new Date(start + index * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  /** A date `offsetDays` before `DATE`, always inside `honest_planner`'s trailing 90-day window. */
  function recentDate(offsetDays: number): string {
    const today = parseLocalDate(DATE);
    if (!today) throw new Error(`malformed test date '${DATE}'`);
    return formatLocalDate(addDays(today, -offsetDays));
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    progression = app.get(ProgressionService);
    heroLedger = app.get(HeroLedger);
  }, 60_000);

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  for (const testCase of achievementCases) {
    it(`should grant achievement '${testCase.id}'`, async () => {
      const accountId = await freshAccountId();
      await db.transaction(tx => testCase.setup(tx, accountId));

      const earned = await db
        .select()
        .from(achievementsEarned)
        .where(and(eq(achievementsEarned.accountId, accountId), eq(achievementsEarned.achievementId, testCase.id)));
      expect(earned).toHaveLength(1);

      const [event] = await db
        .select()
        .from(schema.heroEvents)
        .where(and(eq(schema.heroEvents.accountId, accountId), eq(schema.heroEvents.dedupeKey, `achievement:${testCase.id}`)));
      expect(event?.type).toBe('achievement_unlock');
      expect(event?.achievementId).toBe(testCase.id);
    });
  }

  for (const testCase of titleCases) {
    it(`should grant title '${testCase.id}'`, async () => {
      const accountId = await freshAccountId();
      await db.transaction(tx => testCase.setup(tx, accountId));

      const earned = await db
        .select()
        .from(titlesEarned)
        .where(and(eq(titlesEarned.accountId, accountId), eq(titlesEarned.titleId, testCase.id)));
      expect(earned).toHaveLength(1);
    });
  }

  it('should be idempotent when a triggering event replays under the same natural key', async () => {
    const accountId = await freshAccountId();
    await db.transaction(async tx => {
      await complete(tx, accountId);
      await complete(tx, accountId);
    });

    const rows = await db
      .select()
      .from(achievementsEarned)
      .where(and(eq(achievementsEarned.accountId, accountId), eq(achievementsEarned.achievementId, 'first_quest_completed')));
    expect(rows).toHaveLength(1);

    const events = await db
      .select()
      .from(schema.heroEvents)
      .where(and(eq(schema.heroEvents.accountId, accountId), eq(schema.heroEvents.dedupeKey, 'achievement:first_quest_completed')));
    expect(events).toHaveLength(1);
  });

  it('should keep a title granted once earned, even though titles are never re-checked against a shrinking snapshot', async () => {
    const accountId = await freshAccountId();
    await db.transaction(async tx => {
      await grantStat(tx, accountId, 'catalogue_revoke_discipline', 'discipline', 60);
      await complete(tx, accountId);
    });

    const rows = await db
      .select()
      .from(titlesEarned)
      .where(and(eq(titlesEarned.accountId, accountId), eq(titlesEarned.titleId, 'steady_builder')));
    expect(rows).toHaveLength(1);
  });
});

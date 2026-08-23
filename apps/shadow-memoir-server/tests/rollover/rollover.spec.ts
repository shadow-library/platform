import '@server/bootstrap';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { and, asc, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { QuestsModule } from '@modules/quests';
import { RolloverModule, RolloverRepository, RolloverService } from '@modules/rollover';
import { SchedulerService } from '@modules/scheduler';
import { addDays, currentRuleset, formatLocalDate, type LocalDate, localDateAt, localDayLengthMinutes, parseLocalDate } from '@modules/rules';
import { SyncModule } from '@modules/sync';
import { type Account, DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule, RolloverModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_rollover_spec`;

const ruleset = currentRuleset();
const MINUTES_PER_DAY = 1440;

/**
 * The engine reads "today" from the wall clock, so every fixture is expressed as an offset from the
 * account's own today rather than a literal date — the suite has to stay correct on every day it runs.
 */
interface Fixture {
  accountId: bigint;
  timezone: string;
  today: LocalDate;
  at(offset: number): string;
}

interface DailyStateShape {
  date: string;
  hpStart: number;
  hpEnd: number;
  hpMax: number;
  crownXpGranted: number;
  crownXpRemaining: number;
  crownCoinsGranted: number;
  crownCoinsRemaining: number;
  crownBankedXp: number | null;
  missedCount: number;
  closed: boolean;
}

/**
 * The 30-day-absence fixture, computed by hand against `standard` mode and one daily Anchor.
 *
 * hp: the walk's first day has no predecessor state, so it opens at hpMax 5; one Anchor miss costs 1,
 * leaving 4. Every later day regenerates +3 against a cap of 5, so it opens at 5 and closes at 4 again.
 * crown: daily cadence, one Anchor of weight 1.5 → granted round(1.5 × 4) = 6 xp and min(5, ceil(1.5/2))
 * = 1 coin; the miss forfeits the whole 1.5, so the remainder — and therefore the day's bank — is 0.
 */
const ABSENCE_DAYS = 30;
const CLOSED_DAY: Omit<DailyStateShape, 'date'> = {
  hpStart: 5,
  hpEnd: 4,
  hpMax: 5,
  crownXpGranted: 6,
  crownXpRemaining: 0,
  crownCoinsGranted: 1,
  crownCoinsRemaining: 0,
  crownBankedXp: 0,
  missedCount: 1,
  closed: true,
};
const FIRST_CLOSED_DAY: Omit<DailyStateShape, 'date'> = { ...CLOSED_DAY, hpStart: 5 };
const TODAY_AFTER_ABSENCE: Omit<DailyStateShape, 'date'> = {
  hpStart: 5,
  hpEnd: 5,
  hpMax: 5,
  crownXpGranted: 6,
  crownXpRemaining: 6,
  crownCoinsGranted: 1,
  crownCoinsRemaining: 1,
  crownBankedXp: null,
  missedCount: 0,
  closed: false,
};
/** 30 closed days each emit crown_init + crown_forfeit; nothing survives to bank, so no `crown_banked` lands. Today's prep adds the Recovery spawn. */
const ABSENCE_HERO_EVENTS = { crown_init: 30, crown_forfeit: 30, recovery_spawned: 1 };

describe('Daily rollover engine (T-19)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalBound = Config.get('rollover.catchup-max-days');
  const originalScheduler = Config.get('scheduler.enabled');
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let service: RolloverService;
  let repository: RolloverRepository;
  let subCounter = 0;

  async function newAccount(overrides: Partial<typeof schema.accounts.$inferInsert> = {}): Promise<Fixture> {
    subCounter += 1;
    const sub = `rollover-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    const accountId = account!.id;
    const timezone = (overrides.timezone as string | undefined) ?? 'UTC';

    await db.delete(schema.dailyStates).where(eq(schema.dailyStates.accountId, accountId));
    await db.delete(schema.heroEvents).where(eq(schema.heroEvents.accountId, accountId));
    await db
      .update(schema.accounts)
      .set({ lastHpDate: null, lastActiveDate: null, hpToday: 0, hpStartToday: 0, hpMax: 0, warmthState: 'cold', ...overrides })
      .where(eq(schema.accounts.id, accountId));

    const today = localDateAt(Date.now(), timezone);
    return { accountId, timezone, today, at: offset => formatLocalDate(addDays(today, offset)) };
  }

  async function createQuest(fixture: Fixture, overrides: Partial<typeof schema.quests.$inferInsert> = {}): Promise<bigint> {
    const [quest] = await db
      .insert(schema.quests)
      .values({
        accountId: fixture.accountId,
        name: 'Morning run',
        startTimeMin: 360,
        durationMin: 30,
        statAffinity: 'body',
        strictness: 'anchor',
        recurrence: { frequency: 'daily', interval: 1, startDate: parseLocalDate(fixture.at(-400)), end: { kind: 'never' }, exceptions: [] },
        ...overrides,
      })
      .returning();
    return quest!.id;
  }

  async function setLastHpDate(fixture: Fixture, offset: number, values: Partial<typeof schema.accounts.$inferInsert> = {}): Promise<void> {
    await db
      .update(schema.accounts)
      .set({ lastHpDate: fixture.at(offset), ...values })
      .where(eq(schema.accounts.id, fixture.accountId));
  }

  async function readAccount(fixture: Fixture): Promise<Account.Row> {
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, fixture.accountId));
    return account!;
  }

  async function readDailyStates(fixture: Fixture): Promise<DailyStateShape[]> {
    const rows = await db.select().from(schema.dailyStates).where(eq(schema.dailyStates.accountId, fixture.accountId)).orderBy(asc(schema.dailyStates.date));
    return rows.map(row => ({
      date: row.date,
      hpStart: row.hpStart,
      hpEnd: row.hpEnd,
      hpMax: row.hpMax,
      crownXpGranted: row.crownXpGranted,
      crownXpRemaining: row.crownXpRemaining,
      crownCoinsGranted: row.crownCoinsGranted,
      crownCoinsRemaining: row.crownCoinsRemaining,
      crownBankedXp: row.crownBankedXp,
      missedCount: row.missedCount,
      closed: row.rolloverAt !== null,
    }));
  }

  async function readHeroKeys(fixture: Fixture): Promise<string[]> {
    const rows = await db.select().from(schema.heroEvents).where(eq(schema.heroEvents.accountId, fixture.accountId)).orderBy(asc(schema.heroEvents.dedupeKey));
    return rows.map(row => `${row.dedupeKey}|${row.type}|${row.date}|${row.xpDelta}|${row.coinsDelta}`);
  }

  async function countByType(fixture: Fixture): Promise<Record<string, number>> {
    const rows = await db.select().from(schema.heroEvents).where(eq(schema.heroEvents.accountId, fixture.accountId));
    return rows.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.type]: (counts[row.type] ?? 0) + 1 }), {});
  }

  async function completeOccurrence(fixture: Fixture, questId: bigint, date: string): Promise<void> {
    await db.insert(schema.questLogs).values({
      accountId: fixture.accountId,
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

  async function readBanked(fixture: Fixture): Promise<{ dedupeKey: string; date: string; xpDelta: number; coinsDelta: number }[]> {
    const rows = await db
      .select()
      .from(schema.heroEvents)
      .where(and(eq(schema.heroEvents.accountId, fixture.accountId), eq(schema.heroEvents.type, 'crown_banked')))
      .orderBy(asc(schema.heroEvents.date));
    return rows.map(row => ({ dedupeKey: row.dedupeKey, date: row.date, xpDelta: row.xpDelta, coinsDelta: row.coinsDelta }));
  }

  async function readQuestLogs(fixture: Fixture): Promise<{ date: string; state: string; questId: bigint }[]> {
    const rows = await db.select().from(schema.questLogs).where(eq(schema.questLogs.accountId, fixture.accountId)).orderBy(asc(schema.questLogs.date));
    return rows.map(row => ({ date: row.date, state: row.state, questId: row.questId }));
  }

  /** Reads `rollover.failures` back through the scheduler exactly as a heartbeat sample would, rather than reaching into the service's own state. */
  function failureGauge(): number {
    const gauges = app.get(SchedulerService)['gauges'] as { metric: string; fn: () => number }[];
    return gauges.find(gauge => gauge.metric === 'rollover.failures')!.fn();
  }

  /** The most recent local day in `timezone` that was not 24 hours long — computed, never a literal, so the DST case keeps finding a real transition however long this suite lives. */
  function mostRecentTransitionDay(timezone: string): LocalDate {
    const today = localDateAt(Date.now(), timezone);
    for (let offset = 1; offset <= 400; offset++) {
      const day = addDays(today, -offset);
      if (localDayLengthMinutes(day, timezone) !== MINUTES_PER_DAY) return day;
    }
    throw new Error(`no DST transition found within 400 days for '${timezone}'`);
  }

  beforeAll(async () => {
    /** The gauge registration is what this suite exercises, not the tick loop that samples it. */
    Config['cache'].set('scheduler.enabled', false);
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    service = app.get(RolloverService);
    repository = app.get(RolloverRepository);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('scheduler.enabled', originalScheduler);
    await dropDatabase(databaseName);
  });

  beforeEach(() => {
    Config['cache'].set('rollover.catchup-max-days', originalBound);
  });

  describe('catch-up walk', () => {
    it('should close a 30-day absence exactly as the hand-computed fixture states', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -(ABSENCE_DAYS + 1));

      await service.catchUp(fixture.accountId);

      const expected: DailyStateShape[] = [
        { date: fixture.at(-ABSENCE_DAYS), ...FIRST_CLOSED_DAY },
        ...Array.from({ length: ABSENCE_DAYS - 1 }, (_unused, index) => ({ date: fixture.at(-(ABSENCE_DAYS - 1 - index)), ...CLOSED_DAY })),
        { date: fixture.at(0), ...TODAY_AFTER_ABSENCE },
      ];
      expect(await readDailyStates(fixture)).toEqual(expected);
      expect(await countByType(fixture)).toEqual(ABSENCE_HERO_EVENTS);

      const account = await readAccount(fixture);
      expect(account.lastHpDate).toBe(fixture.at(0));
      expect(account.hpToday).toBe(5);
      expect(account.hpStartToday).toBe(5);
      expect(account.totalXp).toBe(0n);
      expect(account.warmthState).toBe('cold');

      const logs = await readQuestLogs(fixture);
      expect(logs).toHaveLength(ABSENCE_DAYS);
      expect(logs.every(log => log.state === 'missed')).toBe(true);
    });

    it('should walk one transaction per day so a mid-walk failure leaves the days before it closed', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -11);

      const original = repository.upsertDailyState.bind(repository);
      const failOn = fixture.at(-6);
      repository.upsertDailyState = async (tx, values) => {
        if (values.date === failOn) throw new Error('injected day-close failure');
        return original(tx, values);
      };

      await service.ensureCurrent(fixture.accountId);
      expect(failureGauge()).toBe(1);
      repository.upsertDailyState = original;

      expect((await readAccount(fixture)).lastHpDate).toBe(fixture.at(-7));
      expect((await readDailyStates(fixture)).map(state => state.date)).toEqual([-10, -9, -8, -7].map(offset => fixture.at(offset)));

      await service.ensureCurrent(fixture.accountId);

      expect((await readAccount(fixture)).lastHpDate).toBe(fixture.at(0));
      expect(await readDailyStates(fixture)).toHaveLength(11);
      expect(await readQuestLogs(fixture)).toHaveLength(10);
      expect(failureGauge()).toBe(0);
    });

    it('should honour the catch-up bound and leave older days unterminalized', async () => {
      Config['cache'].set('rollover.catchup-max-days', 5);
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -40);

      await service.catchUp(fixture.accountId);

      const dates = (await readDailyStates(fixture)).map(state => state.date);
      expect(dates).toEqual([-5, -4, -3, -2, -1, 0].map(offset => fixture.at(offset)));
      expect((await readAccount(fixture)).lastHpDate).toBe(fixture.at(0));
    });

    it('should skip a day that is already terminalized rather than reprocessing it', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await db.insert(schema.dailyStates).values({
        accountId: fixture.accountId,
        date: fixture.at(-2),
        intensityMode: 'standard',
        hpStart: 2,
        hpEnd: 1,
        hpMax: 5,
        crownPeriodStart: fixture.at(-2),
        rulesetVersion: ruleset.version,
        rolloverAt: new Date(),
      });
      await setLastHpDate(fixture, -3);

      await service.catchUp(fixture.accountId);

      const preserved = (await readDailyStates(fixture)).find(state => state.date === fixture.at(-2));
      expect(preserved).toMatchObject({ hpStart: 2, hpEnd: 1, missedCount: 0 });
      expect((await readQuestLogs(fixture)).some(log => log.date === fixture.at(-2))).toBe(false);
    });
  });

  describe('idempotency and concurrency', () => {
    it('should be a byte-identical no-op when the whole walk is replayed', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -6);
      await service.catchUp(fixture.accountId);

      const states = await readDailyStates(fixture);
      const heroEvents = await readHeroKeys(fixture);
      const logs = await readQuestLogs(fixture);

      await setLastHpDate(fixture, -6);
      await service.catchUp(fixture.accountId);

      expect(await readDailyStates(fixture)).toEqual(states);
      expect(await readHeroKeys(fixture)).toEqual(heroEvents);
      expect(await readQuestLogs(fixture)).toEqual(logs);
    });

    it('should serialize two racing rollovers into a single effect', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -6);

      await Promise.all([service.catchUp(fixture.accountId), service.catchUp(fixture.accountId)]);

      expect((await readDailyStates(fixture)).map(state => state.date)).toEqual([-5, -4, -3, -2, -1, 0].map(offset => fixture.at(offset)));
      expect(await readQuestLogs(fixture)).toHaveLength(5);
      expect(await countByType(fixture)).toEqual({ crown_init: 5, crown_forfeit: 5, recovery_spawned: 1 });
    });

    it('should never bank a weekly Crown period twice', async () => {
      const fixture = await newAccount({ intensityMode: 'low_intensity' });
      const questId = await createQuest(fixture);
      for (let offset = 20; offset >= 1; offset--) await completeOccurrence(fixture, questId, fixture.at(-offset));
      await setLastHpDate(fixture, -20);

      await service.catchUp(fixture.accountId);
      const banked = await readBanked(fixture);
      const totalXp = (await readAccount(fixture)).totalXp;

      await setLastHpDate(fixture, -20);
      await service.catchUp(fixture.accountId);

      expect(await readBanked(fixture)).toEqual(banked);
      expect((await readAccount(fixture)).totalXp).toBe(totalXp);
      expect(new Set(banked.map(event => event.dedupeKey)).size).toBe(banked.length);
      expect(banked.length).toBeGreaterThan(0);
      expect(totalXp).toBe(BigInt(banked.reduce((sum, event) => sum + event.xpDelta, 0)));

      const closes = (await readDailyStates(fixture)).filter(state => (state.crownBankedXp ?? 0) > 0);
      expect(closes).toHaveLength(banked.length);
    });

    it('should never write a duplicate miss or a second Recovery for a day', async () => {
      const fixture = await newAccount();
      const questId = await createQuest(fixture);
      await completeOccurrence(fixture, questId, fixture.at(-2));
      await setLastHpDate(fixture, -4);

      await service.catchUp(fixture.accountId);
      await setLastHpDate(fixture, -4);
      await service.catchUp(fixture.accountId);

      const logs = await readQuestLogs(fixture);
      expect(logs).toHaveLength(3);
      expect(logs.find(log => log.date === fixture.at(-2))?.state).toBe('completed');

      const recoveries = await db.select().from(schema.recoveryQuests).where(eq(schema.recoveryQuests.accountId, fixture.accountId));
      expect(recoveries).toHaveLength(1);
      expect(recoveries[0]!.date).toBe(fixture.at(0));
    });
  });

  describe('day boundaries', () => {
    it('should close a DST-transition day as one whole local day', async () => {
      const timezone = 'America/New_York';
      const transition = mostRecentTransitionDay(timezone);
      const fixture = await newAccount({ timezone });
      const offset = -Math.abs(Math.round((Date.parse(`${formatLocalDate(fixture.today)}T00:00:00Z`) - Date.parse(`${formatLocalDate(transition)}T00:00:00Z`)) / 86_400_000));

      Config['cache'].set('rollover.catchup-max-days', 400);
      await createQuest(fixture, { recurrence: { frequency: 'daily', interval: 1, startDate: transition, end: { kind: 'never' }, exceptions: [] } });
      await setLastHpDate(fixture, offset - 1);

      await service.catchUp(fixture.accountId);

      const states = await readDailyStates(fixture);
      const transitionDate = formatLocalDate(transition);
      const closed = states.find(state => state.date === transitionDate);

      expect(localDayLengthMinutes(transition, timezone)).not.toBe(MINUTES_PER_DAY);
      expect(closed).toMatchObject({ hpStart: 5, hpEnd: 4, missedCount: 1, closed: true });
      expect(states.map(state => state.date)).toEqual([...new Set(states.map(state => state.date))]);
      expect(states.filter(state => state.date === transitionDate)).toHaveLength(1);

      const logsOnTransition = (await readQuestLogs(fixture)).filter(log => log.date === transitionDate);
      expect(logsOnTransition).toHaveLength(1);
      expect(logsOnTransition[0]!.state).toBe('missed');
    });

    it('should apply a pending timezone and intensity only once every elapsed day has closed', async () => {
      const fixture = await newAccount({ timezone: 'UTC', pendingTimezone: 'America/New_York', pendingIntensityMode: 'high_intensity' });
      await createQuest(fixture);
      await setLastHpDate(fixture, -3);

      await service.catchUp(fixture.accountId);

      const account = await readAccount(fixture);
      expect(account.timezone).toBe('America/New_York');
      expect(account.pendingTimezone).toBeNull();
      expect(account.intensityMode).toBe('high_intensity');
      expect(account.pendingIntensityMode).toBeNull();

      const states = await readDailyStates(fixture);
      expect(states.filter(state => state.closed).map(state => state.date)).toEqual([-2, -1].map(offset => fixture.at(offset)));
      const closedRows = await db.select().from(schema.dailyStates).where(eq(schema.dailyStates.accountId, fixture.accountId)).orderBy(asc(schema.dailyStates.date));
      expect(closedRows.filter(row => row.rolloverAt !== null).every(row => row.intensityMode === 'standard')).toBe(true);
      expect(closedRows.at(-1)!.intensityMode).toBe('high_intensity');
    });
  });

  describe('today preparation', () => {
    it('should arm Comeback and spawn one Recovery after an Anchor miss yesterday', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -2);

      await service.catchUp(fixture.accountId);

      const [today] = await db
        .select()
        .from(schema.dailyStates)
        .where(and(eq(schema.dailyStates.accountId, fixture.accountId), eq(schema.dailyStates.date, fixture.at(0))));
      expect(today!.comebackArmed).toBe(true);
      expect(today!.momentumBucket).toBe('cold');

      const armed = await db.select().from(schema.comebackEvents).where(eq(schema.comebackEvents.accountId, fixture.accountId));
      expect(armed).toHaveLength(1);
      expect(armed[0]!.kind).toBe('armed');

      const recoveries = await db.select().from(schema.recoveryQuests).where(eq(schema.recoveryQuests.accountId, fixture.accountId));
      expect(recoveries).toHaveLength(1);
      expect(recoveries[0]!.sourceQuestName).toBe('Morning run');
      expect(recoveries[0]!.state).toBe('pending');
    });

    it('should expire a pending Recovery silently when its day closes', async () => {
      const fixture = await newAccount();
      await db.insert(schema.recoveryQuests).values({
        accountId: fixture.accountId,
        date: fixture.at(-1),
        sourceQuestName: 'Yesterday quest',
        expiresAt: new Date(),
      });
      await setLastHpDate(fixture, -2);

      await service.catchUp(fixture.accountId);

      const [recovery] = await db
        .select()
        .from(schema.recoveryQuests)
        .where(and(eq(schema.recoveryQuests.accountId, fixture.accountId), eq(schema.recoveryQuests.date, fixture.at(-1))));
      expect(recovery!.state).toBe('expired');
      expect(await countByType(fixture)).toEqual({});
      expect((await readAccount(fixture)).totalXp).toBe(0n);
    });

    it('should never generate a miss for a Recovery-strictness quest', async () => {
      const fixture = await newAccount();
      await createQuest(fixture, { name: 'Recovery ritual', strictness: 'recovery', startTimeMin: null });
      await setLastHpDate(fixture, -3);

      await service.catchUp(fixture.accountId);

      expect(await readQuestLogs(fixture)).toHaveLength(0);
      expect(await db.select().from(schema.recoveryQuests).where(eq(schema.recoveryQuests.accountId, fixture.accountId))).toHaveLength(0);
    });
  });

  describe('the Returner ritual', () => {
    async function seedAbsence(fixture: Fixture, questId: bigint, holdDays: number): Promise<void> {
      for (let offset = 0; offset < holdDays; offset++) await completeOccurrence(fixture, questId, fixture.at(-10 - offset));
      await setLastHpDate(fixture, -10, { lastActiveDate: fixture.at(-10) });
    }

    it('should fire, grant the shield to the longest pre-absence streak, and suppress Comeback', async () => {
      const fixture = await newAccount();
      const questId = await createQuest(fixture);
      await seedAbsence(fixture, questId, 3);

      await service.catchUp(fixture.accountId);

      const [event] = await db.select().from(schema.returnerEvents).where(eq(schema.returnerEvents.accountId, fixture.accountId));
      expect(event).toMatchObject({ date: fixture.at(0), daysAbsent: 10, shieldTargetQuestId: questId, shieldPending: false });

      const [streak] = await db.select().from(schema.questStreaks).where(eq(schema.questStreaks.accountId, fixture.accountId));
      expect(streak!.shieldsAvailable).toBe(ruleset.returner.shieldGrant);

      const [today] = await db
        .select()
        .from(schema.dailyStates)
        .where(and(eq(schema.dailyStates.accountId, fixture.accountId), eq(schema.dailyStates.date, fixture.at(0))));
      expect(today!.returnerFired).toBe(true);
      expect(today!.comebackArmed).toBe(false);
      expect(await db.select().from(schema.comebackEvents).where(eq(schema.comebackEvents.accountId, fixture.accountId))).toHaveLength(0);
    });

    it('should hold the shield pending when the target quest is already at cap', async () => {
      const fixture = await newAccount();
      const questId = await createQuest(fixture, {
        recurrence: { frequency: 'daily', interval: 1, startDate: parseLocalDate(fixture.at(-400)), end: { kind: 'until', date: parseLocalDate(fixture.at(-10)) }, exceptions: [] },
      });
      await seedAbsence(fixture, questId, 3);
      await db.insert(schema.questStreaks).values({ accountId: fixture.accountId, questId, currentRunDays: 3, shieldsAvailable: ruleset.shields.capPerQuest });

      await service.catchUp(fixture.accountId);

      const [event] = await db.select().from(schema.returnerEvents).where(eq(schema.returnerEvents.accountId, fixture.accountId));
      expect(event).toMatchObject({ shieldTargetQuestId: questId, shieldPending: true });

      const [streak] = await db.select().from(schema.questStreaks).where(eq(schema.questStreaks.accountId, fixture.accountId));
      expect(streak!.shieldsAvailable).toBe(ruleset.shields.capPerQuest);
    });

    it('should hold the shield targetless when no quest carried a pre-absence streak', async () => {
      const fixture = await newAccount();
      await createQuest(fixture);
      await setLastHpDate(fixture, -10, { lastActiveDate: fixture.at(-10) });

      await service.catchUp(fixture.accountId);

      const [event] = await db.select().from(schema.returnerEvents).where(eq(schema.returnerEvents.accountId, fixture.accountId));
      expect(event).toMatchObject({ shieldTargetQuestId: null, shieldPending: true, daysAbsent: 10 });
    });

    it('should stay silent for an absence below the account threshold', async () => {
      const fixture = await newAccount({ returnerThresholdDays: 30 });
      const questId = await createQuest(fixture);
      await seedAbsence(fixture, questId, 3);

      await service.catchUp(fixture.accountId);

      expect(await db.select().from(schema.returnerEvents).where(eq(schema.returnerEvents.accountId, fixture.accountId))).toHaveLength(0);
    });
  });

  describe('lazy invocation', () => {
    it('should close elapsed days before a delta pull answers', async () => {
      subCounter += 1;
      const sub = `rollover-lazy-${subCounter}`;
      const token = await userToken(sub);
      await router
        .mockRequest()
        .get('/api/v1/sync/delta')
        .headers({ authorization: `Bearer ${token}` })
        .query({ since: '0' });

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
      const today = localDateAt(Date.now(), account!.timezone);
      await db
        .update(schema.accounts)
        .set({ lastHpDate: formatLocalDate(addDays(today, -3)) })
        .where(eq(schema.accounts.id, account!.id));

      const response = await router
        .mockRequest()
        .get('/api/v1/sync/delta')
        .headers({ authorization: `Bearer ${token}` })
        .query({ since: '0' });
      const body = response.json() as { domains: Record<string, { date: string }[]> };

      expect(body.domains['daily_states']!.map(row => row.date)).toEqual([-2, -1, 0].map(offset => formatLocalDate(addDays(today, offset))));
      const [refreshed] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, account!.id));
      expect(refreshed!.lastHpDate).toBe(formatLocalDate(today));
    });

    it('should close elapsed days before a command batch applies', async () => {
      subCounter += 1;
      const sub = `rollover-command-${subCounter}`;
      const token = await userToken(sub);
      await router
        .mockRequest()
        .get('/api/v1/sync/delta')
        .headers({ authorization: `Bearer ${token}` })
        .query({ since: '0' });

      const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
      const today = localDateAt(Date.now(), account!.timezone);
      await db
        .update(schema.accounts)
        .set({ lastHpDate: formatLocalDate(addDays(today, -2)) })
        .where(eq(schema.accounts.id, account!.id));

      await router
        .mockRequest()
        .post('/api/v1/sync/commands')
        .headers({ authorization: `Bearer ${token}` })
        .body({
          commands: [
            {
              commandId: Bun.randomUUIDv7(),
              type: 'quest.create',
              localDate: formatLocalDate(today),
              payload: {
                name: 'Evening walk',
                startTimeMinutes: 1200,
                durationMinutes: 30,
                statAffinity: 'body',
                strictness: 'anchor',
                recurrence: { frequency: 'daily', interval: 1, startDate: formatLocalDate(today), end: { kind: 'never' } },
              },
            },
          ],
        });

      const [refreshed] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, account!.id));
      expect(refreshed!.lastHpDate).toBe(formatLocalDate(today));
    });
  });
});

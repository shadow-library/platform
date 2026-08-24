import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { QuestsModule } from '@modules/quests';
import { RolloverModule } from '@modules/rollover';
import { addDays, currentRuleset, formatLocalDate, type LocalDate, localDateAt, parseLocalDate } from '@modules/rules';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule, RolloverModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_compassion_spec`;

const ruleset = currentRuleset();

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

interface Fixture {
  accountId: bigint;
  token: string;
  timezone: string;
  today: LocalDate;
  at(offset: number): string;
}

const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const pick = <T>(next: () => number, values: readonly [T, ...T[]]): T => values[Math.floor(next() * values.length)] ?? values[0];

const runs = (seed: number, count: number) => Array.from({ length: count }, (_value, index) => seeded(seed + index * 7919));

describe('Compassion mechanics (T-20)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subCounter = 0;

  function envelope(type: string, payload: Record<string, unknown> = {}, localDate?: string): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: localDate ?? '2026-02-15' };
  }

  async function submit(fixture: Fixture, commands: Record<string, unknown>[]): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${fixture.token}` })
      .body({ commands });
    return (response.json() as { outcomes: Outcome[] }).outcomes;
  }

  async function newAccount(): Promise<Fixture> {
    subCounter += 1;
    const sub = `compassion-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    const [account] = await db.select({ id: schema.accounts.id, timezone: schema.accounts.timezone }).from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    const timezone = account!.timezone;
    const today = localDateAt(Date.now(), timezone);
    return { accountId: account!.id, token, timezone, today, at: offset => formatLocalDate(addDays(today, offset)) };
  }

  async function createQuest(fixture: Fixture, overrides: Partial<typeof schema.quests.$inferInsert> = {}): Promise<bigint> {
    const [quest] = await db
      .insert(schema.quests)
      .values({
        accountId: fixture.accountId,
        name: 'Morning run',
        startTimeMin: null,
        durationMin: 0,
        statAffinity: 'body',
        strictness: 'goal',
        recurrence: { frequency: 'daily', interval: 1, startDate: parseLocalDate(fixture.at(-400)), end: { kind: 'never' }, exceptions: [] },
        ...overrides,
      })
      .returning();
    return quest!.id;
  }

  function occurrence(questId: bigint, date: string): string {
    return `${questId}:${date}`;
  }

  async function ensureToday(fixture: Fixture): Promise<void> {
    await submit(fixture, [
      envelope(
        'quest.create',
        {
          name: 'seed',
          strictness: 'optional',
          statAffinity: 'discipline',
          recurrence: { frequency: 'daily', interval: 1, startDate: fixture.at(-400), end: { kind: 'never' }, exceptions: [] },
        },
        fixture.at(0),
      ),
    ]);
  }

  async function readDailyState(fixture: Fixture, date: string) {
    const [row] = await db
      .select()
      .from(schema.dailyStates)
      .where(and(eq(schema.dailyStates.accountId, fixture.accountId), eq(schema.dailyStates.date, date)));
    return row ?? null;
  }

  async function armComeback(fixture: Fixture, viaRecovery = false): Promise<void> {
    await db
      .update(schema.dailyStates)
      .set({ comebackArmed: true, comebackArmedViaRecovery: viaRecovery })
      .where(and(eq(schema.dailyStates.accountId, fixture.accountId), eq(schema.dailyStates.date, fixture.at(0))));
  }

  async function comebackEvents(fixture: Fixture) {
    return db.select().from(schema.comebackEvents).where(eq(schema.comebackEvents.accountId, fixture.accountId));
  }

  async function shieldConsumptions(fixture: Fixture) {
    return db.select().from(schema.shieldConsumptions).where(eq(schema.shieldConsumptions.accountId, fixture.accountId));
  }

  async function heroEvents(fixture: Fixture) {
    return db.select().from(schema.heroEvents).where(eq(schema.heroEvents.accountId, fixture.accountId));
  }

  async function insertPendingRecovery(fixture: Fixture, sourceQuestId: bigint | null = null): Promise<bigint> {
    const [row] = await db
      .insert(schema.recoveryQuests)
      .values({
        accountId: fixture.accountId,
        date: fixture.at(0),
        sourceQuestId,
        sourceQuestName: 'Missed quest',
        state: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    return row!.id;
  }

  async function setStreak(fixture: Fixture, questId: bigint, shields: number, currentDays = 10): Promise<void> {
    await db
      .insert(schema.questStreaks)
      .values({ accountId: fixture.accountId, questId, currentRunDays: currentDays, bestRunDays: currentDays, shieldsAvailable: shields, completionsTowardShield: 0 })
      .onConflictDoUpdate({
        target: [schema.questStreaks.accountId, schema.questStreaks.questId],
        set: { currentRunDays: currentDays, bestRunDays: currentDays, shieldsAvailable: shields, completionsTowardShield: 0 },
      });
  }

  async function setHpZero(fixture: Fixture): Promise<void> {
    await db.update(schema.accounts).set({ hpToday: 0, hpStartToday: 0 }).where(eq(schema.accounts.id, fixture.accountId));
    await db
      .update(schema.dailyStates)
      .set({ hpEnd: 0, hpStart: 0 })
      .where(and(eq(schema.dailyStates.accountId, fixture.accountId), eq(schema.dailyStates.date, fixture.at(0))));
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

  describe('CompleteRecoveryQuest', () => {
    it('should reward via the ledger and re-arm Comeback via recovery', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const recoveryId = await insertPendingRecovery(fixture);

      const [outcome] = await submit(fixture, [envelope('recovery.complete', { reflectionText: 'Got busy' }, fixture.at(0))]);
      expect(outcome!.status).toBe('applied');
      expect(outcome!.result['xpAwarded']).toBe(5);
      expect(outcome!.result['coinsAwarded']).toBe(0);
      expect(outcome!.result['comebackReArmed']).toBe(true);

      const [recovery] = await db.select().from(schema.recoveryQuests).where(eq(schema.recoveryQuests.id, recoveryId));
      expect(recovery!.state).toBe('completed');
      expect(recovery!.reflectionText).toBe('Got busy');

      const daily = await readDailyState(fixture, fixture.at(0));
      expect(daily!.comebackArmed).toBe(true);
      expect(daily!.comebackArmedViaRecovery).toBe(true);

      const events = await comebackEvents(fixture);
      expect(events.some(event => event.kind === 're_armed')).toBe(true);

      const events2 = await heroEvents(fixture);
      expect(events2.some(event => event.type === 'recovery_completed' && event.dedupeKey === `recovery_completed_${recoveryId}`)).toBe(true);
    });

    it('should refuse a second completion of the same recovery quest', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      await insertPendingRecovery(fixture);

      await submit(fixture, [envelope('recovery.complete', {}, fixture.at(0))]);
      const [second] = await submit(fixture, [envelope('recovery.complete', {}, fixture.at(0))]);
      expect(second!.status).toBe('superseded');
    });

    it('should refuse completion when no recovery quest is pending', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const [outcome] = await submit(fixture, [envelope('recovery.complete', {}, fixture.at(0))]);
      expect(outcome!.status).toBe('failed');
      expect(outcome!.error?.code).toBe('RCV_001');
    });

    it('should never spawn a new recovery quest on completion, across generated reflections', async () => {
      for (const next of runs(101, 25)) {
        const fixture = await newAccount();
        await ensureToday(fixture);
        await insertPendingRecovery(fixture);
        const reflection = pick(next, ['', 'a reason', 'x'.repeat(50), 'busy day']);

        await submit(fixture, [envelope('recovery.complete', { reflectionText: reflection }, fixture.at(0))]);

        const rows = await db
          .select()
          .from(schema.recoveryQuests)
          .where(and(eq(schema.recoveryQuests.accountId, fixture.accountId), eq(schema.recoveryQuests.date, fixture.at(0))));
        expect(rows).toHaveLength(1);
      }
    });
  });

  describe('plan.setLock (LockDay)', () => {
    it('should lock the day, apply the bonus, and lose it once postpone breaks the lock', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const questA = await createQuest(fixture, { name: 'A' });
      const questB = await createQuest(fixture, { name: 'B' });
      const questC = await createQuest(fixture, { name: 'C' });

      const [lockOutcome] = await submit(fixture, [envelope('plan.setLock', { locked: true, questIds: [String(questA), String(questB), String(questC)] }, fixture.at(0))]);
      expect(lockOutcome!.status).toBe('applied');
      expect(lockOutcome!.result['locked']).toBe(true);

      const [completeA] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questA, fixture.at(0)) }, fixture.at(0))]);
      expect(completeA!.result['lockBonusApplied']).toBe(true);

      const [postponeB] = await submit(fixture, [envelope('quest.postpone', { occurrenceId: occurrence(questB, fixture.at(0)) }, fixture.at(0))]);
      expect(postponeB!.status).toBe('applied');

      const daily = await readDailyState(fixture, fixture.at(0));
      expect(daily!.lockBrokenAt).not.toBeNull();

      const [completeC] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questC, fixture.at(0)) }, fixture.at(0))]);
      expect(completeC!.result['lockBonusApplied']).toBe(false);
    });

    it('should never block on a capacity warning', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const ids: bigint[] = [];
      for (let i = 0; i < 8; i++) ids.push(await createQuest(fixture, { name: `Q${i}` }));

      const [outcome] = await submit(fixture, [envelope('plan.setLock', { locked: true, questIds: ids.map(String) }, fixture.at(0))]);
      expect(outcome!.status).toBe('applied');
      expect(outcome!.result['locked']).toBe(true);
    });

    it('should unlock and clear locked quest ids', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const questA = await createQuest(fixture);
      await submit(fixture, [envelope('plan.setLock', { locked: true, questIds: [String(questA)] }, fixture.at(0))]);
      const [outcome] = await submit(fixture, [envelope('plan.setLock', { locked: false }, fixture.at(0))]);
      expect(outcome!.result['locked']).toBe(false);

      const daily = await readDailyState(fixture, fixture.at(0));
      expect(daily!.committedAt).toBeNull();
      expect(daily!.lockedQuestIds).toEqual([]);
    });
  });

  describe('Comeback consumption', () => {
    it('should fire on the next eligible completion, cap at 1 fire without recovery, then re-fire once via recovery re-arm and stop at 2', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const questA = await createQuest(fixture, { name: 'A', strictness: 'routine', startTimeMin: 0, durationMin: 1440 });
      const questB = await createQuest(fixture, { name: 'B', strictness: 'routine', startTimeMin: 0, durationMin: 1440 });
      const questD = await createQuest(fixture, { name: 'D', strictness: 'routine', startTimeMin: 0, durationMin: 1440 });
      await armComeback(fixture);

      const [first] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questA, fixture.at(0)) }, fixture.at(0))]);
      expect(first!.result['comebackFired']).toBe(true);
      expect(first!.result['coinsAwarded']).toBeGreaterThanOrEqual(ruleset.reward.comebackCoinBonus);

      const [second] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questB, fixture.at(0)) }, fixture.at(0))]);
      expect(second!.result['comebackFired']).toBe(false);

      await insertPendingRecovery(fixture);
      await submit(fixture, [envelope('recovery.complete', {}, fixture.at(0))]);

      const questE = await createQuest(fixture, { name: 'E', strictness: 'routine', startTimeMin: 0, durationMin: 1440 });
      const [third] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questE, fixture.at(0)) }, fixture.at(0))]);
      expect(third!.result['comebackFired']).toBe(true);

      const [fourth] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questD, fixture.at(0)) }, fixture.at(0))]);
      expect(fourth!.result['comebackFired']).toBe(false);

      const events = await comebackEvents(fixture);
      const kinds = events.map(event => event.kind).sort();
      expect(kinds).toEqual(['fired', 're_armed', 're_fired'].sort());
    });

    it('should never fire on an Optional or Recovery-strictness completion', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const questOptional = await createQuest(fixture, { name: 'Opt', strictness: 'optional' });
      await armComeback(fixture);

      const [outcome] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questOptional, fixture.at(0)) }, fixture.at(0))]);
      expect(outcome!.result['comebackFired']).toBe(false);
    });
  });

  describe('Shield consumption unification', () => {
    it('should write shield_consumptions and bridge the streak on a command-path break', async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      const questA = await createQuest(fixture, { name: 'A', strictness: 'routine', startTimeMin: 0, durationMin: 1440 });
      await setStreak(fixture, questA, 1, 10);

      const [outcome] = await submit(fixture, [envelope('quest.skip', { occurrenceId: occurrence(questA, fixture.at(0)) }, fixture.at(0))]);
      expect(outcome!.status).toBe('applied');
      expect((outcome!.result['streak'] as Record<string, unknown>)['currentDays']).toBe(10);

      const rows = await shieldConsumptions(fixture);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.questId).toBe(questA);
    });
  });

  describe('HP 0 blocks nothing', () => {
    it('should apply every command whatever HP reads, across generated command sequences', async () => {
      const kinds: readonly ['quest.complete', 'quest.skip', 'quest.postpone'] = ['quest.complete', 'quest.skip', 'quest.postpone'];
      for (const next of runs(211, 25)) {
        const fixture = await newAccount();
        await ensureToday(fixture);
        await setHpZero(fixture);
        const strictness = pick(next, ['anchor', 'routine', 'goal'] as const);
        const questId = await createQuest(fixture, {
          name: 'HP0',
          strictness,
          startTimeMin: strictness === 'anchor' ? 0 : null,
          durationMin: strictness === 'anchor' ? 1440 : 0,
        });
        const kind = pick(next, kinds);

        const [outcome] = await submit(fixture, [envelope(kind, { occurrenceId: occurrence(questId, fixture.at(0)) }, fixture.at(0))]);
        expect(outcome!.status).toBe('applied');
      }
    });
  });

  describe('Optional quests never cost HP, streak, or Crown', () => {
    it('should leave HP and Crown untouched and write no streak row, across generated command sequences', async () => {
      const kinds: readonly ['quest.complete', 'quest.skip', 'quest.postpone'] = ['quest.complete', 'quest.skip', 'quest.postpone'];
      for (const next of runs(307, 25)) {
        const fixture = await newAccount();
        await ensureToday(fixture);
        const questId = await createQuest(fixture, { name: 'Optional', strictness: 'optional' });

        const [before] = await db
          .select({ hp: schema.accounts.hpToday, crown: schema.accounts.crownRemaining })
          .from(schema.accounts)
          .where(eq(schema.accounts.id, fixture.accountId));

        const kind = pick(next, kinds);
        await submit(fixture, [envelope(kind, { occurrenceId: occurrence(questId, fixture.at(0)) }, fixture.at(0))]);

        const [after] = await db
          .select({ hp: schema.accounts.hpToday, crown: schema.accounts.crownRemaining })
          .from(schema.accounts)
          .where(eq(schema.accounts.id, fixture.accountId));
        expect(after!.hp).toBe(before!.hp);
        expect(after!.crown).toBe(before!.crown);

        const streaks = await db
          .select()
          .from(schema.questStreaks)
          .where(and(eq(schema.questStreaks.accountId, fixture.accountId), eq(schema.questStreaks.questId, questId)));
        expect(streaks).toHaveLength(0);
      }
    });
  });

  describe('Intensity switching effect boundary', () => {
    it("should read the occurrence date's own daily_states snapshot, not the account's live mode", async () => {
      const fixture = await newAccount();
      await ensureToday(fixture);
      await db.update(schema.accounts).set({ intensityMode: 'standard' }).where(eq(schema.accounts.id, fixture.accountId));

      const pastDate = fixture.at(-5);
      const questId = await createQuest(fixture, { name: 'Past' });
      await db.insert(schema.dailyStates).values({
        accountId: fixture.accountId,
        date: pastDate,
        intensityMode: 'low_intensity',
        hpStart: 8,
        hpEnd: 8,
        hpMax: 8,
        crownPeriodStart: pastDate,
        rolloverAt: new Date(),
        rulesetVersion: ruleset.version,
      });

      const [outcome] = await submit(fixture, [envelope('quest.complete', { occurrenceId: occurrence(questId, pastDate) }, pastDate)]);
      expect(outcome!.status).toBe('applied');

      const [log] = await db
        .select()
        .from(schema.questLogs)
        .where(and(eq(schema.questLogs.questId, questId), eq(schema.questLogs.date, pastDate)));
      expect(log!.intensityModeAtLog).toBe('low_intensity');
    });
  });
});

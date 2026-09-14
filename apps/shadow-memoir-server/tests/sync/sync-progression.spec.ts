import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseModule, DatabaseService } from '@shadow-library/modules';

import { AccountModule } from '@modules/account';
import { MemoirAuthModule } from '@modules/auth';
import { ProgressionModule } from '@modules/progression';
import { QuestsModule } from '@modules/quests';
import { RolloverModule } from '@modules/rollover';
import {
  addDays,
  crownShare,
  crownWeightFor,
  currentRuleset,
  formatLocalDate,
  type LocalDate,
  localDateAt,
  parseLocalDate,
  weekdayOf,
  xpThresholdForLevel,
  xpToAdvance,
} from '@modules/rules';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({
  imports: [MemoirAuthModule, SyncModule, AccountModule, QuestsModule, RolloverModule, ProgressionModule, DatabaseModule],
  host: 'localhost',
  port: 0,
});

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_sync_progression_spec`;

const ruleset = currentRuleset();

type Row = Record<string, unknown>;

interface DeltaBody {
  cursor: string;
  hasMore: boolean;
  domains: Record<string, Row[]>;
}

interface Fixture {
  accountId: bigint;
  token: string;
  today: LocalDate;
  at(offset: number): string;
}

describe('GET /api/v1/sync/delta progression contract (P1-17)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalOverlap = Config.get('sync.cursor-overlap');
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subCounter = 0;

  async function delta(fixture: Fixture, query: Record<string, string> = { since: '0' }): Promise<DeltaBody> {
    const response = await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .query(query)
      .headers({ authorization: `Bearer ${fixture.token}` });
    expect(response.statusCode).toBe(200);
    return response.json() as DeltaBody;
  }

  async function accountRow(fixture: Fixture): Promise<Row> {
    const body = await delta(fixture, { since: '0', domains: 'account' });
    return body.domains['account']![0]!;
  }

  async function newAccount(overrides: Partial<typeof schema.accounts.$inferInsert> = {}): Promise<Fixture> {
    subCounter += 1;
    const sub = `progression-sub-${subCounter}`;
    const token = await userToken(sub);
    const today = localDateAt(Date.now(), 'UTC');
    const fixture: Fixture = { accountId: 0n, token, today, at: offset => formatLocalDate(addDays(today, offset)) };
    await delta(fixture);

    const [account] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    fixture.accountId = account!.id;
    if (Object.keys(overrides).length > 0) await db.update(schema.accounts).set(overrides).where(eq(schema.accounts.id, fixture.accountId));
    return fixture;
  }

  async function resetHistory(fixture: Fixture, lastHpOffset: number, lastActiveOffset: number | null): Promise<void> {
    await db.delete(schema.dailyStates).where(eq(schema.dailyStates.accountId, fixture.accountId));
    await db.delete(schema.recoveryQuests).where(eq(schema.recoveryQuests.accountId, fixture.accountId));
    await db
      .update(schema.accounts)
      .set({ lastHpDate: fixture.at(lastHpOffset), lastActiveDate: lastActiveOffset === null ? null : fixture.at(lastActiveOffset) })
      .where(eq(schema.accounts.id, fixture.accountId));
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
      .returning({ id: schema.quests.id });
    return quest!.id;
  }

  async function submit(fixture: Fixture, type: string, payload: Row): Promise<Row> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${fixture.token}` })
      .body({ commands: [{ commandId: Bun.randomUUIDv7(), type, payload, localDate: fixture.at(0) }] });
    return (response.json() as { outcomes: Row[] }).outcomes[0]!;
  }

  async function holdShields(fixture: Fixture, questId: bigint, shieldsAvailable: number): Promise<void> {
    await db.insert(schema.questStreaks).values({ accountId: fixture.accountId, questId, currentRunDays: 3, bestRunDays: 3, shieldsAvailable, lastCountedDate: fixture.at(-2) });
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

  async function insertHeroEvent(fixture: Fixture, dedupeKey: string): Promise<void> {
    await db.insert(schema.heroEvents).values({ accountId: fixture.accountId, dedupeKey, type: 'side_quest', xpDelta: 8, date: fixture.at(0), rulesetVersion: ruleset.version });
  }

  async function insertClosedDay(fixture: Fixture, date: string, periodStart: string, granted: number, remaining: number): Promise<void> {
    await db.insert(schema.dailyStates).values({
      accountId: fixture.accountId,
      date,
      intensityMode: 'low_intensity',
      hpStart: 8,
      hpEnd: 8,
      hpMax: 8,
      crownXpGranted: granted,
      crownXpRemaining: remaining,
      crownPeriodStart: periodStart,
      rulesetVersion: ruleset.version,
    });
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    Config['cache'].set('sync.cursor-overlap', 0);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('sync.cursor-overlap', originalOverlap);
    await dropDatabase(databaseName);
  });

  describe('account snapshot', () => {
    it('should give a fresh account day-one values rather than blanks', async () => {
      const fixture = await newAccount();
      const account = await accountRow(fixture);

      expect(account).toMatchObject({ xpIntoLevel: 0, xpForNextLevel: xpToAdvance(ruleset, 1), shieldsAvailable: 0, shieldCap: 0, persona: 'active', comeback: null });
      expect(account['crown']).toEqual({ label: 'today', cadence: 'daily', periodStart: fixture.at(0), closesOn: fixture.at(0), dayIndex: 1, dayCount: 1, keptPercent: 100 });
    });

    it('should include level progress from the ruleset in the account row', async () => {
      const fixture = await newAccount();
      const threshold = xpThresholdForLevel(ruleset, 5);

      await db
        .update(schema.accounts)
        .set({ totalXp: BigInt(threshold), level: 5 })
        .where(eq(schema.accounts.id, fixture.accountId));
      expect(await accountRow(fixture)).toMatchObject({ level: 5, xpIntoLevel: 0, xpForNextLevel: xpToAdvance(ruleset, 5) });

      await db
        .update(schema.accounts)
        .set({ totalXp: BigInt(threshold - 1), level: 4 })
        .where(eq(schema.accounts.id, fixture.accountId));
      expect(await accountRow(fixture)).toMatchObject({ level: 4, xpIntoLevel: xpToAdvance(ruleset, 4) - 1, xpForNextLevel: xpToAdvance(ruleset, 4) });

      const maxLevel = ruleset.level.maxLevel;
      await db
        .update(schema.accounts)
        .set({ totalXp: BigInt(xpThresholdForLevel(ruleset, maxLevel) + 10), level: maxLevel })
        .where(eq(schema.accounts.id, fixture.accountId));
      expect(await accountRow(fixture)).toMatchObject({ level: maxLevel, xpIntoLevel: 10, xpForNextLevel: 0 });
    });

    it('should include the current crown window', async () => {
      const fixture = await newAccount({ intensityMode: 'low_intensity' });
      await resetHistory(fixture, 0, null);

      const dayIndex = ((weekdayOf(fixture.today) - ruleset.crown.weeklyAnchorWeekday + 7) % 7) + 1;
      const periodStart = fixture.at(1 - dayIndex);
      for (let offset = 1 - dayIndex; offset < 0; offset++) await insertClosedDay(fixture, fixture.at(offset), periodStart, 6, 0);
      await insertClosedDay(fixture, fixture.at(0), periodStart, 6, 6);

      const account = await accountRow(fixture);
      expect(account['crown']).toEqual({
        label: 'this week',
        cadence: 'weekly',
        periodStart,
        closesOn: fixture.at(7 - dayIndex),
        dayIndex,
        dayCount: 7,
        keptPercent: Math.round(100 / dayIndex),
      });
    });

    it('should forfeit a skipped occurrence from the open day crown straight away', async () => {
      const fixture = await newAccount();
      const skipped = await createQuest(fixture);
      await createQuest(fixture);
      await resetHistory(fixture, -1, null);
      expect(await accountRow(fixture)).toMatchObject({ crown: { dayIndex: 1, dayCount: 1, keptPercent: 100 } });

      expect(await submit(fixture, 'quest.skip', { occurrenceId: `${skipped}:${fixture.at(0)}` })).toMatchObject({ status: 'applied' });

      const granted = crownShare(ruleset, 2 * crownWeightFor(ruleset, 'anchor')).xp;
      const remaining = crownShare(ruleset, crownWeightFor(ruleset, 'anchor')).xp;
      expect(await accountRow(fixture)).toMatchObject({ crownRemaining: remaining, crown: { keptPercent: Math.round((remaining / granted) * 100) } });
    });

    it('should restore the open day crown when a skipped log is deleted', async () => {
      const fixture = await newAccount();
      const skipped = await createQuest(fixture);
      await createQuest(fixture);
      await resetHistory(fixture, -1, null);
      const occurrenceId = `${skipped}:${fixture.at(0)}`;

      expect(await submit(fixture, 'quest.skip', { occurrenceId })).toMatchObject({ status: 'applied' });
      expect(await accountRow(fixture)).toMatchObject({ crown: { keptPercent: 50 } });

      expect(await submit(fixture, 'quest.deleteLog', { occurrenceId })).toMatchObject({ status: 'applied' });
      expect(await accountRow(fixture)).toMatchObject({ crownRemaining: crownShare(ruleset, 2 * crownWeightFor(ruleset, 'anchor')).xp, crown: { keptPercent: 100 } });
    });

    it('should report held shields against the per-quest cap of every quest that can hold one', async () => {
      const fixture = await newAccount();
      await holdShields(fixture, await createQuest(fixture), 2);
      await holdShields(fixture, await createQuest(fixture, { strictness: 'routine' }), 1);
      await holdShields(fixture, await createQuest(fixture, { strictness: 'recovery' }), 1);
      await createQuest(fixture, { strictness: 'optional', optionalStreakOptIn: false });
      await createQuest(fixture, { strictness: 'goal' });
      await holdShields(fixture, await createQuest(fixture, { active: false }), 2);

      expect(await accountRow(fixture)).toMatchObject({ shieldsAvailable: 4, shieldCap: 4 * ruleset.shields.capPerQuest });
    });

    it('should report persona returner after a returner ritual', async () => {
      const fixture = await newAccount();
      const questId = await createQuest(fixture);
      for (let offset = 10; offset < 13; offset++) await completeOccurrence(fixture, questId, fixture.at(-offset));
      await resetHistory(fixture, -10, -10);

      const account = await accountRow(fixture);

      const [recovery] = await db
        .select()
        .from(schema.recoveryQuests)
        .where(and(eq(schema.recoveryQuests.accountId, fixture.accountId), eq(schema.recoveryQuests.date, fixture.at(0))));
      expect(recovery).toMatchObject({ state: 'pending', isReturnerDay: true });
      expect(account).toMatchObject({ persona: 'returner', comeback: null });
    });

    it('should report persona recovery when a recovery quest is pending', async () => {
      const fixture = await newAccount();
      const questId = await createQuest(fixture);
      await completeOccurrence(fixture, questId, fixture.at(-2));
      await resetHistory(fixture, -2, -2);

      expect(await accountRow(fixture)).toMatchObject({ persona: 'recovery', comeback: { armed: true, firedOn: null } });

      await db.update(schema.recoveryQuests).set({ state: 'completed' }).where(eq(schema.recoveryQuests.accountId, fixture.accountId));
      expect(await accountRow(fixture)).toMatchObject({ persona: 'active' });
    });
  });

  describe('domains', () => {
    it('should mark shielded quest logs', async () => {
      const fixture = await newAccount();
      const shieldedQuest = await createQuest(fixture);
      const exposedQuest = await createQuest(fixture);
      await holdShields(fixture, shieldedQuest, 1);
      await completeOccurrence(fixture, shieldedQuest, fixture.at(-2));
      await resetHistory(fixture, -2, -2);

      const body = await delta(fixture, { since: '0', domains: 'quest_logs' });
      const logOf = (questId: bigint, date: string): Row | undefined => body.domains['quest_logs']!.find(row => row['questId'] === String(questId) && row['date'] === date);

      expect(logOf(shieldedQuest, fixture.at(-1))).toMatchObject({ state: 'missed', shielded: true });
      expect(logOf(exposedQuest, fixture.at(-1))).toMatchObject({ state: 'missed', shielded: false });
      expect(logOf(shieldedQuest, fixture.at(-2))).toMatchObject({ state: 'completed', shielded: false });
    });

    it('should deliver hero events as a watermark domain', async () => {
      const fixture = await newAccount();
      const drained = await delta(fixture, { since: '0', domains: 'hero_events' });
      const keys = ['watermark-1', 'watermark-2', 'watermark-3'];
      for (const key of keys) await insertHeroEvent(fixture, key);

      const seen: Row[] = [];
      let cursor = drained.cursor;
      let hasMore = true;
      for (let guard = 0; hasMore && guard < 10; guard++) {
        const page = await delta(fixture, { since: cursor, domains: 'hero_events', limit: '2' });
        seen.push(...page.domains['hero_events']!);
        hasMore = page.hasMore;
        cursor = page.cursor;
      }

      expect(seen.map(row => row['dedupeKey'])).toEqual(keys);
      const sequences = seen.map(row => BigInt(row['syncSeq'] as string));
      expect(sequences).toEqual([...sequences].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
      expect(seen[0]).toMatchObject({ type: 'side_quest', xpDelta: 8, date: fixture.at(0) });

      const after = await delta(fixture, { since: cursor, domains: 'hero_events' });
      expect(after.domains['hero_events']).toEqual([]);
    });

    it('should deliver progress counters as a snapshot domain', async () => {
      const fixture = await newAccount();
      const fresh = await delta(fixture, { since: '0', domains: 'progress_counters' });
      expect(fresh.domains['progress_counters']).toHaveLength(1);
      expect(fresh.domains['progress_counters']![0]).toMatchObject({ questsCompleted: 0, crownsBanked: 0, activeDays: 0 });

      await db
        .insert(schema.progressCounters)
        .values({ accountId: fixture.accountId, counters: { counters: { questsCompleted: 4, crownsBanked: 2 }, lastActiveCountedDate: fixture.at(0), returnerPending: true } })
        .onConflictDoUpdate({
          target: schema.progressCounters.accountId,
          set: { counters: { counters: { questsCompleted: 4, crownsBanked: 2 }, lastActiveCountedDate: fixture.at(0), returnerPending: true } },
        });

      const body = await delta(fixture, { since: '0', domains: 'progress_counters' });
      const [counters] = body.domains['progress_counters']!;
      expect(counters).toMatchObject({ questsCompleted: 4, crownsBanked: 2, activeDays: 0 });
      expect(counters!['returnerPending']).toBeUndefined();
      expect(counters!['lastActiveCountedDate']).toBeUndefined();
    });

    it('should scope progression rows to the requesting account', async () => {
      const alice = await newAccount();
      const bob = await newAccount();
      await insertHeroEvent(bob, 'bob-private-event');
      await db.insert(schema.progressCounters).values({ accountId: bob.accountId, counters: { counters: { questsCompleted: 99 } } });
      const bobQuest = await createQuest(bob);
      await holdShields(bob, bobQuest, 2);
      await completeOccurrence(bob, bobQuest, bob.at(-2));

      const body = await delta(alice);
      expect(body.domains['hero_events']!.map(row => row['dedupeKey'])).not.toContain('bob-private-event');
      expect(body.domains['quest_logs']!.map(row => row['questId'])).not.toContain(String(bobQuest));
      expect(body.domains['progress_counters']![0]).toMatchObject({ questsCompleted: 0 });
      expect(body.domains['account']![0]).toMatchObject({ shieldsAvailable: 0, shieldCap: 0 });
    });
  });
});

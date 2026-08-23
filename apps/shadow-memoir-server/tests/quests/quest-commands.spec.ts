import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { computeReward, currentRuleset } from '@modules/rules';
import { QuestsModule } from '@modules/quests';
import { SyncModule } from '@modules/sync';
import { accounts, commandLog, DatastoreModule, heroEvents, type PrimaryDatabase, questLogs, quests, questStreaks, rescheduleEvents } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_quest_commands_spec`;

const ruleset = currentRuleset();

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

/** The `quest.create`/`quest.update` wire shape (string dates), not the parsed `RecurrenceRule` `rules` stores — `parseRecurrence` converts between them. */
function dailyRecurrence(startDate: string, exceptions: string[] = []): Record<string, unknown> {
  return { frequency: 'daily', interval: 1, startDate, end: { kind: 'never' }, exceptions };
}

describe('Quest engine commands (T-18)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subCounter = 0;

  function envelope(
    type: string,
    payload: Record<string, unknown> = {},
    extra: Partial<{ performedAt: string; localDate: string; deviceId: string }> = {},
  ): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: extra.localDate ?? '2026-02-15', ...(extra.performedAt ? { performedAt: extra.performedAt } : {}) };
  }

  async function submit(commands: Record<string, unknown>[], token: string): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
    return (response.json() as { outcomes: Outcome[] }).outcomes;
  }

  /** Resolves the account by making one authenticated call — `AccountContext.resolve`'s upsert-on-first-contact runs in the auth guard, ahead of any command. */
  async function newUser(): Promise<{ token: string; accountId: bigint }> {
    subCounter += 1;
    const sub = `quest-commands-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identitySub, sub));
    return { token, accountId: account!.id };
  }

  function questPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'Morning run',
      startTimeMinutes: 360,
      durationMinutes: 30,
      statAffinity: 'body',
      strictness: 'anchor',
      recurrence: dailyRecurrence('2026-01-01'),
      ...overrides,
    };
  }

  async function createQuest(token: string, overrides: Record<string, unknown> = {}): Promise<bigint> {
    const [outcome] = await submit([envelope('quest.create', questPayload(overrides))], token);
    expect(outcome!.status).toBe('applied');
    return BigInt(outcome!.result['id'] as string);
  }

  function occurrence(questId: bigint, date: string): string {
    return `${questId}:${date}`;
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

  describe('quest CRUD', () => {
    it('should create a quest and return its id', async () => {
      const { token } = await newUser();
      const [outcome] = await submit([envelope('quest.create', questPayload({ name: 'Created quest' }))], token);

      expect(outcome!.status).toBe('applied');
      const [row] = await db.select().from(quests).where(eq(quests.name, 'Created quest'));
      expect(row?.strictness).toBe('anchor');
      expect(row?.active).toBe(true);
    });

    it('should return the entity_ref to id mapping for an offline-created quest', async () => {
      const { token } = await newUser();
      const [outcome] = await submit([envelope('quest.create', questPayload({ entityRef: 'client-uuid-1' }))], token);
      expect(outcome!.result['entityRef']).toBe('client-uuid-1');
      expect(outcome!.result['id']).toMatch(/^\d+$/);
    });

    it('should refuse an Anchor quest with no start time', async () => {
      const { token } = await newUser();
      const [outcome] = await submit([envelope('quest.create', questPayload({ startTimeMinutes: null }))], token);
      expect(outcome!.status).toBe('failed');
      expect(outcome!.error?.code).toBe('QST_003');
    });

    it('should apply a future-only patch without touching a past log snapshot', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'routine', startTimeMinutes: null });
      await submit([envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' })], token);

      await submit([envelope('quest.update', { questId: String(questId), patch: { name: 'Renamed quest' } })], token);
      const [log] = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      const [quest] = await db.select().from(quests).where(eq(quests.id, questId));

      expect(quest?.name).toBe('Renamed quest');
      expect(log?.strictness).toBe('routine');
    });

    it('should refuse turning a quest Anchor without a start time', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'routine', startTimeMinutes: null });
      const [outcome] = await submit([envelope('quest.update', { questId: String(questId), patch: { strictness: 'anchor' } })], token);
      expect(outcome!.error?.code).toBe('QST_003');
    });

    it('should soft-delete a quest, leaving it inactive rather than gone', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token);
      const [outcome] = await submit([envelope('quest.delete', { questId: String(questId) })], token);

      expect(outcome!.result['active']).toBe(false);
      const [row] = await db.select().from(quests).where(eq(quests.id, questId));
      expect(row).toBeDefined();
      expect(row?.active).toBe(false);
    });
  });

  describe('occurrence resolution', () => {
    it('should refuse completing a date the recurrence does not schedule, leaving nothing behind', async () => {
      const { token, accountId } = await newUser();
      const questId = await createQuest(token, { recurrence: dailyRecurrence('2026-03-01') });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-01') }, { performedAt: '2026-02-01T09:00:00.000Z' });

      const [outcome] = await submit([command], token);

      expect(outcome!.status).toBe('failed');
      expect(outcome!.error?.code).toBe('QST_004');
      expect(
        await db
          .select()
          .from(commandLog)
          .where(eq(commandLog.commandId, command['commandId'] as string)),
      ).toHaveLength(0);
      expect(await db.select().from(questLogs).where(eq(questLogs.questId, questId))).toHaveLength(0);
      expect(await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId))).toHaveLength(0);
    });

    it('should skip an excluded date even though the daily rule would otherwise cover it', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { recurrence: dailyRecurrence('2026-01-01', ['2026-02-15']) });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' });

      const [outcome] = await submit([command], token);
      expect(outcome!.error?.code).toBe('QST_004');
    });
  });

  describe('the full CompleteQuest transaction (§11.2)', () => {
    it('should write the log, the streak projection and the hero event together, atomically', async () => {
      const { token, accountId } = await newUser();
      const questId = await createQuest(token, { strictness: 'routine', startTimeMinutes: 360, durationMinutes: 30 });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T06:05:00.000Z' });

      const [outcome] = await submit([command], token);
      const expected = computeReward(ruleset, { strictness: 'routine', band: 'on_time', completion: 'full', streakDays: 1, lockActive: false, oneShot: 'none' });

      expect(outcome!.status).toBe('applied');
      expect(outcome!.result['xpAwarded']).toBe(expected.xp);
      expect(outcome!.result['coinsAwarded']).toBe(expected.coins);

      const [log] = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      expect(log?.state).toBe('completed');
      expect(log?.xpAwarded).toBe(expected.xp);

      const [streak] = await db.select().from(questStreaks).where(eq(questStreaks.questId, questId));
      expect(streak?.currentRunDays).toBe(1);

      const [event] = await db
        .select()
        .from(heroEvents)
        .where(and(eq(heroEvents.accountId, accountId), eq(heroEvents.dedupeKey, `${log!.id}_xp`)));
      expect(event?.xpDelta).toBe(expected.xp);
      expect(event?.type).toBe('quest_complete');

      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      expect(account?.totalXp).toBe(BigInt(expected.xp));
    });

    it('should replay the same command without granting twice', async () => {
      const { token, accountId } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' });

      const first = await submit([command], token);
      const second = await submit([command], token);

      expect(second[0]!.replayed).toBe(true);
      expect(second[0]!.result).toEqual(first[0]!.result);
      expect(await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId))).toHaveLength(1);
    });
  });

  describe('reward numbers, matched against rules fixtures exactly', () => {
    const strictnesses = ['anchor', 'routine', 'goal', 'optional'] as const;

    for (const strictness of strictnesses) {
      it(`should grant the exact on-time full-completion reward for ${strictness}`, async () => {
        const { token } = await newUser();
        const startTimeMinutes = strictness === 'optional' || strictness === 'goal' ? null : 360;
        const questId = await createQuest(token, { strictness, startTimeMinutes, durationMinutes: 30 });
        const command = envelope(
          'quest.complete',
          { occurrenceId: occurrence(questId, '2026-02-15') },
          { performedAt: startTimeMinutes === null ? '2026-02-15T09:00:00.000Z' : '2026-02-15T06:05:00.000Z' },
        );

        const [outcome] = await submit([command], token);
        const expected = computeReward(ruleset, { strictness, band: 'on_time', completion: 'full', streakDays: 1, lockActive: false, oneShot: 'none' });

        expect(outcome!.result['xpAwarded']).toBe(expected.xp);
        expect(outcome!.result['coinsAwarded']).toBe(expected.coins);
      });
    }

    it('should halve XP, grant no coins, and still tick the streak on a partial completion', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'routine', startTimeMinutes: 360, durationMinutes: 30 });
      const command = envelope('quest.partial', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T06:05:00.000Z' });

      const [outcome] = await submit([command], token);
      const expected = computeReward(ruleset, { strictness: 'routine', band: 'on_time', completion: 'partial', streakDays: 1, lockActive: false, oneShot: 'none' });

      expect(outcome!.result['xpAwarded']).toBe(expected.xp);
      expect(outcome!.result['coinsAwarded']).toBe(0);
      expect(outcome!.result['state']).toBe('partial');

      const [streak] = await db.select().from(questStreaks).where(eq(questStreaks.questId, questId));
      expect(streak?.currentRunDays).toBe(1);
    });

    it('should grant the late-band reward when the claimed instant lands after the on-time window', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'anchor', startTimeMinutes: 360, durationMinutes: 30 });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T07:10:00.000Z' });

      const [outcome] = await submit([command], token);
      const expected = computeReward(ruleset, { strictness: 'anchor', band: 'late_0_2h', completion: 'full', streakDays: 1, lockActive: false, oneShot: 'none' });

      expect(outcome!.result['band']).toBe('late_0_2h');
      expect(outcome!.result['xpAwarded']).toBe(expected.xp);
    });

    it('should apply the silver streak-tier modifier from the completion that reaches 7 days', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'routine', startTimeMinutes: 360, durationMinutes: 30 });
      const dates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07'];

      let last: Outcome | undefined;
      for (const date of dates) {
        const command = envelope('quest.complete', { occurrenceId: occurrence(questId, date) }, { performedAt: `${date}T06:05:00.000Z`, localDate: date });
        [last] = await submit([command], token);
      }

      const expected = computeReward(ruleset, { strictness: 'routine', band: 'on_time', completion: 'full', streakDays: 7, lockActive: false, oneShot: 'none' });
      expect(last!.result['xpAwarded']).toBe(expected.xp);
      expect((last!.result['streak'] as { currentDays: number }).currentDays).toBe(7);
    });
  });

  describe('performed_at clamping (§12.5)', () => {
    it('should clamp a claim beyond server-now to the present, never granting a future-dated band', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2099-01-01T00:00:00.000Z' });

      const [outcome] = await submit([command], token);
      expect(outcome!.status).toBe('applied');

      const [log] = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      expect(log?.performedAt).toBeInstanceOf(Date);
      expect(log!.performedAt!.getTime()).toBeLessThan(Date.now() + 1000);
    });

    it("should clamp a claim before the occurrence date to that date's start", async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const command = envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2020-01-01T00:00:00.000Z' });

      const [outcome] = await submit([command], token);
      expect(outcome!.status).toBe('applied');

      const [log] = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      expect(log!.performedAt!.toISOString().slice(0, 10)).toBe('2026-02-15');
    });
  });

  describe('SkipQuest and PostponeQuest', () => {
    it('should break the streak on a skip with no shield available', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'routine', startTimeMinutes: 360, durationMinutes: 30 });
      await submit([envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T06:05:00.000Z', localDate: '2026-02-15' })], token);

      const command = envelope(
        'quest.skip',
        { occurrenceId: occurrence(questId, '2026-02-16'), reasonTag: 'forgot' },
        { localDate: '2026-02-16', performedAt: '2026-02-16T09:00:00.000Z' },
      );
      const [outcome] = await submit([command], token);

      expect(outcome!.result['state']).toBe('skipped');
      const [streak] = await db.select().from(questStreaks).where(eq(questStreaks.questId, questId));
      expect(streak?.currentRunDays).toBe(0);
    });

    it('should refuse Postpone for an Optional quest', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'optional', startTimeMinutes: null, optionalStreakOptIn: true });
      const command = envelope('quest.postpone', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' });

      const [outcome] = await submit([command], token);
      expect(outcome!.error?.code).toBe('QST_005');
    });

    it('should allow Postpone for a Goal quest and record tomorrow as the target date', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const command = envelope('quest.postpone', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' });

      const [outcome] = await submit([command], token);
      expect(outcome!.status).toBe('applied');

      const [log] = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      expect(log?.postponedToDate).toBe('2026-02-16');
    });
  });

  describe('RescheduleQuest and the rolling 7-day cap', () => {
    it('should refuse rescheduling a day-level quest', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const command = envelope('quest.reschedule', { occurrenceId: occurrence(questId, '2026-02-15'), toMin: 600 }, { performedAt: '2026-02-15T09:00:00.000Z' });

      const [outcome] = await submit([command], token);
      expect(outcome!.error?.code).toBe('QST_008');
    });

    it('should reclassify the 3rd reschedule within 7 days as a postpone once confirmed', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'anchor', startTimeMinutes: 360, durationMinutes: 30 });
      const [dateA, dateB, dateC] = ['2026-04-01', '2026-04-02', '2026-04-03'] as const;

      const first = await submit(
        [envelope('quest.reschedule', { occurrenceId: occurrence(questId, dateA), toMin: 420 }, { localDate: dateA, performedAt: `${dateA}T05:00:00.000Z` })],
        token,
      );
      expect(first[0]!.status).toBe('applied');

      const second = await submit(
        [envelope('quest.reschedule', { occurrenceId: occurrence(questId, dateB), toMin: 420 }, { localDate: dateB, performedAt: `${dateB}T05:00:00.000Z` })],
        token,
      );
      expect(second[0]!.status).toBe('applied');

      const thirdCommand = envelope('quest.reschedule', { occurrenceId: occurrence(questId, dateC), toMin: 420 }, { localDate: dateC, performedAt: `${dateC}T05:00:00.000Z` });
      const third = await submit([thirdCommand], token);
      expect(third[0]!.status).toBe('rejected');
      expect(third[0]!.result['kind']).toBe('reschedule-cap');

      const confirmed = envelope(
        'quest.reschedule',
        { occurrenceId: occurrence(questId, dateC), toMin: 420, acceptBeyondCap: true },
        { localDate: dateC, performedAt: `${dateC}T05:00:00.000Z` },
      );
      const confirmedOutcome = await submit([confirmed], token);
      expect(confirmedOutcome[0]!.result['reclassifiedAsPostpone']).toBe(true);
      expect(confirmedOutcome[0]!.result['state']).toBe('postponed');

      const events = await db.select().from(rescheduleEvents).where(eq(rescheduleEvents.questId, questId));
      expect(events).toHaveLength(2);
    });
  });

  describe('AttachReason, EditQuestLog, DeleteQuestLog', () => {
    it('should attach a reason tag to a completed log within the edit window', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      await submit([envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' })], token);

      const command = envelope('quest.attachReason', { occurrenceId: occurrence(questId, '2026-02-15'), reasonTag: 'too_tired', note: 'long day' });
      const [outcome] = await submit([command], token);

      expect(outcome!.status).toBe('applied');
      const [log] = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      expect(log?.reasonTag).toBe('too_tired');
      expect(log?.reasonNote).toBe('long day');
      expect(log?.state).toBe('completed');
    });

    it('should refuse an edit once the log is outside its 7-day window', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      await submit([envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' })], token);

      const stale = new Date(Date.now() - 8 * 86_400_000);
      await db
        .update(questLogs)
        .set({ createdAt: stale })
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));

      const command = envelope('quest.editLog', { occurrenceId: occurrence(questId, '2026-02-15'), reasonTag: 'forgot' });
      const [outcome] = await submit([command], token);
      expect(outcome!.error?.code).toBe('QST_006');
    });

    it('should delete a quest log without touching the hero events it already granted', async () => {
      const { token, accountId } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const [complete] = await submit([envelope('quest.complete', { occurrenceId: occurrence(questId, '2026-02-15') }, { performedAt: '2026-02-15T09:00:00.000Z' })], token);

      const command = envelope('quest.deleteLog', { occurrenceId: occurrence(questId, '2026-02-15') });
      const [outcome] = await submit([command], token);

      expect(outcome!.result['deleted']).toBe(true);
      expect(
        await db
          .select()
          .from(questLogs)
          .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15'))),
      ).toHaveLength(0);

      const [event] = await db
        .select()
        .from(heroEvents)
        .where(and(eq(heroEvents.accountId, accountId), eq(heroEvents.dedupeKey, `${complete!.result['logId']}_xp`)));
      expect(event).toBeDefined();
      const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      expect(account?.totalXp).toBeGreaterThan(0n);
    });
  });

  describe('§28.3 concurrency — same-quest, two devices', () => {
    it('should converge two concurrent completes of the same occurrence to one log and one event', async () => {
      const { token, accountId } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const payload = { occurrenceId: occurrence(questId, '2026-02-15') };
      const commands = [
        envelope('quest.complete', payload, { performedAt: '2026-02-15T09:00:00.000Z' }),
        envelope('quest.complete', payload, { performedAt: '2026-02-15T09:00:05.000Z' }),
      ];

      const [first, second] = await Promise.all([submit([commands[0]!], token), submit([commands[1]!], token)]);
      const statuses = [first[0]!.status, second[0]!.status].sort();

      expect(statuses).toEqual(['applied', 'superseded']);
      expect(
        await db
          .select()
          .from(questLogs)
          .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15'))),
      ).toHaveLength(1);
      expect(await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId))).toHaveLength(1);
    });

    it('should let the first terminal action win a complete-vs-skip race and report the actual state to the loser', async () => {
      const { token } = await newUser();
      const questId = await createQuest(token, { strictness: 'goal', startTimeMinutes: null });
      const occurrenceId = occurrence(questId, '2026-02-15');
      const completeCommand = envelope('quest.complete', { occurrenceId }, { performedAt: '2026-02-15T09:00:00.000Z' });
      const skipCommand = envelope('quest.skip', { occurrenceId }, { performedAt: '2026-02-15T09:00:05.000Z' });

      const [completeOutcomes, skipOutcomes] = await Promise.all([submit([completeCommand], token), submit([skipCommand], token)]);
      const outcomes = [completeOutcomes[0]!, skipOutcomes[0]!];

      const applied = outcomes.find(outcome => outcome.status === 'applied');
      const superseded = outcomes.find(outcome => outcome.status === 'superseded');
      expect(applied).toBeDefined();
      expect(superseded).toBeDefined();
      expect(superseded!.result['state']).toBe(applied!.result['state']);

      const logs = await db
        .select()
        .from(questLogs)
        .where(and(eq(questLogs.questId, questId), eq(questLogs.date, '2026-02-15')));
      expect(logs).toHaveLength(1);
      expect(logs[0]?.state).toBe(applied!.result['state']);
    });
  });
});

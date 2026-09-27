/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { memoirDb } from '../../lib';
import { expectApplied } from './concurrency-helpers';
import { expect, test } from './fixtures';
import { dailyQuestDraft, pullFullDelta, submitCommand } from './helpers';
import {
  accountSnapshot,
  addDays,
  catchUp,
  comebackEvents,
  createQuest,
  dailyStates,
  heroEvents,
  isoWeekday,
  localToday,
  missedAnchorRig,
  questDraft,
  questLogs,
  questStreak,
  recoveryQuests,
  rewindRollover,
  rolloverAccount,
  RolloverRigError,
  rolloverSubject,
  seedQuestLogs,
  seedQuestStreak,
  setAccountSettings,
} from './rollover-helpers';
import {
  achievementsEarned,
  achievementUnlockEvents,
  expectFailed,
  MemoirRowMissingError,
  occurrenceOf,
  questLogOf,
  raceCommands,
  replayCommand,
  rescheduleEvents,
} from './quest-helpers';

/**
 * Defining types
 */

interface QuestRow {
  name: string;
  strictness: string;
  statAffinity: string;
  startTimeMin: number | null;
  active: boolean;
}

/**
 * Declaring the constants
 *
 * Quest commands (ARCHITECTURE §9.3, §11.2) and the compassion mechanics layered on them (PRD §2.4, §3.6, §4.3, §4.6), asserted
 * through command outcomes and the rows they write. Rewards come from ruleset v1 (`rules/ruleset.ts`): an untimed routine
 * completed the same day is always on time, 10 xp and 1 coin, so every reward below is exact regardless of the wall clock.
 *
 * `plan.setLock` stores `daily_states.locked_quest_ids` as `bigint[]`, which the delta serializer cannot encode
 * (apps/memoir-server/src/modules/sync/delta.repository.ts:29), so the lock test never pulls a delta for its account.
 */

const QUEST_REWARD_TYPES = ['quest_complete', 'quest_late', 'quest_partial'];

async function questRow(questId: string): Promise<QuestRow> {
  const [row] = await memoirDb()<QuestRow[]>`
    SELECT name, strictness, stat_affinity AS "statAffinity", start_time_min AS "startTimeMin", active FROM quests WHERE id = ${questId}::bigint
  `;
  if (!row) throw new MemoirRowMissingError(`quest ${questId} has no row`);
  return row;
}

async function comebackBonuses(accountId: string): Promise<[string, number, number][]> {
  const rows = await memoirDb()<{ kind: string; xp: number; coins: number }[]>`
    SELECT kind, xp_bonus AS xp, coin_bonus AS coins FROM comeback_events WHERE account_id = ${accountId}::bigint AND kind IN ('fired', 're_fired') ORDER BY id
  `;
  return rows.map(row => [row.kind, row.xp, row.coins]);
}

async function crownMirror(accountId: string): Promise<number | undefined> {
  const [row] = await memoirDb()<{ remaining: number }[]>`SELECT crown_remaining AS remaining FROM accounts WHERE id = ${accountId}::bigint`;
  return row?.remaining;
}

test.describe('memoir quests', () => {
  test.describe('recovery and comeback', () => {
    test('should reward a pending Recovery once with fixed xp and coins, re-arm Comeback, and converge every later completion', async ({ memoir }) => {
      const bare = await rolloverSubject(memoir, 'quest-recovery-none');
      expectFailed(await submitCommand(bare.ctx, 'recovery.complete', {}), 'RCV_001');

      const rig = await missedAnchorRig(memoir, 'quest-recovery');
      expect(await accountSnapshot(rig.ctx)).toMatchObject({ persona: 'recovery', comeback: { armed: true, firedOn: null } });
      const before = await rolloverAccount(rig.accountId);

      const command = { type: 'recovery.complete', payload: { reflectionText: 'E2E reflection' } };
      const completed = await submitCommand(rig.ctx, command.type, command.payload);
      expect(completed).toMatchObject({ status: 'applied', replayed: false, result: { state: 'completed', xpAwarded: 5, coinsAwarded: 0, comebackReArmed: true } });
      expect(await recoveryQuests(rig.accountId)).toMatchObject([{ date: rig.today, state: 'completed', sourceQuestId: rig.anchorQuestId }]);
      const [reflection] = await memoirDb()<{ text: string | null }[]>`SELECT reflection_text AS text FROM recovery_quests WHERE account_id = ${rig.accountId}::bigint`;
      expect(reflection?.text).toBe('E2E reflection');
      const after = await rolloverAccount(rig.accountId);
      expect([after.totalXp - before.totalXp, after.coins - before.coins]).toEqual([5, 0]);
      expect((await heroEvents(rig.accountId, ['recovery_completed'])).map(event => [event.date, event.questId, event.xpDelta, event.coinsDelta])).toEqual([
        [rig.today, rig.anchorQuestId, 5, 0],
      ]);
      expect((await comebackEvents(rig.accountId)).map(event => [event.date, event.kind])).toEqual([
        [rig.today, 'armed'],
        [rig.today, 're_armed'],
      ]);

      const replayed = await replayCommand(rig.ctx, completed, command);
      expect(replayed).toMatchObject({ status: 'applied', replayed: true, result: completed.result });
      const again = await submitCommand(rig.ctx, 'recovery.complete', {});
      expect(again).toMatchObject({ status: 'superseded', replayed: false, result: { state: 'completed' } });

      await catchUp(rig.ctx);
      expect(await recoveryQuests(rig.accountId), 'a completed Recovery is never respawned').toHaveLength(1);
      expect(await heroEvents(rig.accountId, ['recovery_spawned'])).toHaveLength(1);
      expect(await heroEvents(rig.accountId, ['recovery_completed'])).toHaveLength(1);
      expect(await rolloverAccount(rig.accountId)).toMatchObject({ totalXp: after.totalXp, coins: after.coins });
      expect(await accountSnapshot(rig.ctx), 'no Recovery pending, so the persona is back to active').toMatchObject({
        persona: 'active',
        comeback: { armed: true, firedOn: null },
      });
    });

    test.fixme('should grant first_recovery_completed on the first Recovery completion (app bug: apps/memoir-server/src/modules/quests/compassion-commands.service.ts:42-84 never calls ProgressionService.onRecoveryQuestCompleted, progression.service.ts:140)', async ({
      memoir,
    }) => {
      const rig = await missedAnchorRig(memoir, 'quest-recovery-achievement');
      expectApplied(await submitCommand(rig.ctx, 'recovery.complete', {}));
      expect((await achievementsEarned(rig.accountId)).map(row => row.id)).toContain('first_recovery_completed');
      expect(await achievementUnlockEvents(rig.accountId)).toContain('first_recovery_completed');
    });

    test('should fire Comeback once on the next eligible completion, never on an Optional one, and once more after a Recovery re-arms it', async ({ memoir }) => {
      const routines: string[] = [];
      let optionalId = '';
      const rig = await missedAnchorRig(memoir, 'quest-comeback', async ({ ctx, today }) => {
        optionalId = await createQuest(ctx, { strictness: 'optional', startDate: today });
        for (let index = 0; index < 4; index++) routines.push(await createQuest(ctx, { strictness: 'routine', startDate: today }));
      });
      const complete = async (questId: string | undefined): Promise<Record<string, unknown>> => {
        if (!questId) throw new RolloverRigError('the rig created fewer routines than the test completes');
        const outcome = await submitCommand(rig.ctx, 'quest.complete', occurrenceOf(questId, rig.today));
        expectApplied(outcome);
        return outcome.result;
      };

      expect(await complete(optionalId), 'an Optional completion never consumes the one-shot').toMatchObject({ comebackFired: false, xpAwarded: 8, coinsAwarded: 1 });
      expect(await complete(routines[0]), '10 xp × 1.5, plus the one bonus coin').toMatchObject({ comebackFired: true, xpAwarded: 15, coinsAwarded: 2 });
      expect(await complete(routines[1]), 'one fire without a Recovery').toMatchObject({ comebackFired: false, xpAwarded: 10, coinsAwarded: 1 });

      expect(await submitCommand(rig.ctx, 'recovery.complete', {})).toMatchObject({ status: 'applied', result: { comebackReArmed: true } });
      expect(await complete(routines[2])).toMatchObject({ comebackFired: true, xpAwarded: 15, coinsAwarded: 2 });
      expect(await complete(routines[3]), 'two fires at most, even via Recovery').toMatchObject({ comebackFired: false, xpAwarded: 10, coinsAwarded: 1 });

      expect((await comebackEvents(rig.accountId)).map(event => event.kind)).toEqual(['armed', 'fired', 're_armed', 're_fired']);
      expect(await comebackBonuses(rig.accountId)).toEqual([
        ['fired', 5, 1],
        ['re_fired', 5, 1],
      ]);
      expect(await accountSnapshot(rig.ctx)).toMatchObject({ comeback: { armed: false, firedOn: rig.today } });
      expect(await achievementUnlockEvents(rig.accountId)).toContain('first_comeback_claimed');
    });
  });

  test('should apply the lock bonus to a locked completion, withhold it once a postpone breaks the lock, and never refuse a lock over capacity', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'quest-lock');
    const today = localToday();
    const [bonusId, postponedId, withheldId] = [
      await createQuest(subject.ctx, { strictness: 'routine', startDate: today }),
      await createQuest(subject.ctx, { strictness: 'routine', startDate: today }),
      await createQuest(subject.ctx, { strictness: 'routine', startDate: today }),
    ];
    const historyId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -1) });
    await seedQuestLogs(subject.accountId, historyId, [addDays(today, -1)]);

    /* One completion in the trailing window sets capacity to max(1, round(1 × 1.15 × momentum)) = 1, so three locked quests exceed the modal ratio. */
    const lock = await submitCommand(subject.ctx, 'plan.setLock', { locked: true, questIds: [bonusId, postponedId, withheldId] });
    expect(lock).toMatchObject({
      status: 'applied',
      result: { locked: true, lockedQuestIds: [bonusId, postponedId, withheldId], capacityWarning: 'modal', capacity: 1, plannedLoad: 3 },
    });

    const bonus = await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(bonusId, today));
    expect(bonus.result, '10 xp × 1.1').toMatchObject({ state: 'completed', lockBonusApplied: true, xpAwarded: 11, coinsAwarded: 1 });

    expectApplied(await submitCommand(subject.ctx, 'quest.postpone', occurrenceOf(postponedId, today)));
    const [lockState] = await memoirDb()<{ committed: boolean; broken: boolean }[]>`
      SELECT committed_at IS NOT NULL AS committed, lock_broken_at IS NOT NULL AS broken FROM daily_states WHERE account_id = ${subject.accountId}::bigint AND date = ${today}::date
    `;
    expect(lockState).toEqual({ committed: true, broken: true });

    const withheld = await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(withheldId, today));
    expect(withheld.result).toMatchObject({ state: 'completed', lockBonusApplied: false, xpAwarded: 10, coinsAwarded: 1 });
  });

  test.describe('HP and Optional quests', () => {
    test('should apply complete, skip and postpone at zero HP', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-zero-hp');
      const today = localToday();
      const [completedId, skippedId, postponedId] = [
        await createQuest(subject.ctx, { strictness: 'routine', startDate: today }),
        await createQuest(subject.ctx, { strictness: 'routine', startDate: today }),
        await createQuest(subject.ctx, { strictness: 'routine', startDate: today }),
      ];
      await memoirDb()`UPDATE daily_states SET hp_start = 0, hp_end = 0 WHERE account_id = ${subject.accountId}::bigint AND date = ${today}::date`;
      await memoirDb()`UPDATE accounts SET hp_today = 0, hp_start_today = 0 WHERE id = ${subject.accountId}::bigint`;

      expect((await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(completedId, today))).result).toMatchObject({ state: 'completed', xpAwarded: 10 });
      expect((await submitCommand(subject.ctx, 'quest.skip', occurrenceOf(skippedId, today))).result).toMatchObject({ state: 'skipped' });
      expect((await submitCommand(subject.ctx, 'quest.postpone', occurrenceOf(postponedId, today))).result).toMatchObject({ state: 'postponed' });

      expect((await questLogs(subject.accountId)).map(log => [log.questId, log.state])).toEqual([
        [completedId, 'completed'],
        [skippedId, 'skipped'],
        [postponedId, 'postponed'],
      ]);
      expect((await rolloverAccount(subject.accountId)).hpToday, 'no occurrence action reads or moves HP mid-day').toBe(0);
    });

    test('should never charge HP or Crown for an Optional quest, nor start a streak for it', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-optional');
      const today = localToday();
      const yesterday = addDays(today, -1);
      const routineId = await createQuest(subject.ctx, { strictness: 'routine', startDate: yesterday });
      const missedId = await createQuest(subject.ctx, { strictness: 'optional', startDate: yesterday });
      await seedQuestLogs(subject.accountId, routineId, [yesterday]);
      await rewindRollover(subject.accountId, addDays(today, -2));

      await catchUp(subject.ctx);

      const closed = (await dailyStates(subject.accountId)).find(state => state.date === yesterday);
      expect(closed, 'the kept routine’s whole 4 xp / 1 coin survives the Optional miss').toMatchObject({
        hpStart: 5,
        hpEnd: 5,
        missedCount: 1,
        crownXpGranted: 4,
        crownXpRemaining: 4,
        crownCoinsGranted: 1,
        crownCoinsRemaining: 1,
      });
      expect(closed?.rolloverAt).not.toBeNull();
      expect((await questLogOf(subject.accountId, missedId, yesterday))?.state).toBe('missed');

      const skippedId = await createQuest(subject.ctx, { strictness: 'optional', startDate: today });
      expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(missedId, today)));
      expectApplied(await submitCommand(subject.ctx, 'quest.skip', occurrenceOf(skippedId, today)));

      const open = (await dailyStates(subject.accountId)).find(state => state.date === today);
      expect(open).toMatchObject({ crownXpGranted: 4, crownXpRemaining: 4, crownCoinsRemaining: 1 });
      expect(await rolloverAccount(subject.accountId)).toMatchObject({ hpToday: 5 });
      expect(await questStreak(subject.accountId, missedId)).toBeUndefined();
      expect(await questStreak(subject.accountId, skippedId)).toBeUndefined();
    });
  });

  test('should resolve a past occurrence under that day’s own intensity snapshot, not the account’s live mode', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'quest-intensity-snapshot');
    const today = localToday();
    const yesterday = addDays(today, -1);
    const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: yesterday });
    await memoirDb()`
      INSERT INTO daily_states (account_id, date, intensity_mode, hp_start, hp_end, hp_max, crown_period_start, rollover_at, rollover_engine_version, ruleset_version)
      VALUES (${subject.accountId}::bigint, ${yesterday}::date, 'low_intensity', 8, 8, 8, ${yesterday}::date, now(), 'e2e-seeded', 1)
    `;
    await setAccountSettings(subject.accountId, { intensityMode: 'high_intensity' });

    expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, yesterday)));
    expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, today)));

    expect((await questLogOf(subject.accountId, questId, yesterday))?.intensityModeAtLog).toBe('low_intensity');
    expect((await questLogOf(subject.accountId, questId, today))?.intensityModeAtLog, 'today’s own prepared snapshot').toBe('standard');
    expect((await rolloverAccount(subject.accountId)).intensityMode).toBe('high_intensity');
  });

  test('should patch a quest for future occurrences only, refuse an Anchor without a start time, and soft-delete it', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'quest-update');
    const today = localToday();
    const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
    expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, today)));

    expectApplied(await submitCommand(subject.ctx, 'quest.update', { questId, patch: { name: 'E2E patched', strictness: 'goal', statAffinity: 'mind' } }));
    expect(await questRow(questId)).toMatchObject({ name: 'E2E patched', strictness: 'goal', statAffinity: 'mind' });
    expect(await questLogOf(subject.accountId, questId, today), 'the logged snapshot keeps what the quest was').toMatchObject({
      state: 'completed',
      strictness: 'routine',
      statAffinity: 'discipline',
      xpAwarded: 10,
    });

    expectFailed(await submitCommand(subject.ctx, 'quest.update', { questId, patch: { strictness: 'anchor' } }), 'QST_003');
    expectFailed(await submitCommand(subject.ctx, 'quest.create', { ...dailyQuestDraft('E2E anchorless', today), strictness: 'anchor' }), 'QST_003');
    expect(await questRow(questId)).toMatchObject({ strictness: 'goal', startTimeMin: null });
    expectApplied(await submitCommand(subject.ctx, 'quest.update', { questId, patch: { strictness: 'anchor', startTimeMinutes: 540 } }));
    expect(await questRow(questId)).toMatchObject({ strictness: 'anchor', startTimeMin: 540 });

    expect(await submitCommand(subject.ctx, 'quest.delete', { questId })).toMatchObject({ status: 'applied', result: { id: questId, active: false } });
    expect(await questRow(questId)).toMatchObject({ active: false });
    const delta = await pullFullDelta(subject.ctx);
    expect((delta.domains['quests'] ?? []).filter(row => row['id'] === questId).map(row => row['active'])).toEqual([false]);
    expect(delta.tombstones.filter(tombstone => tombstone.domain === 'quests')).toEqual([]);
    expectFailed(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, addDays(today, 1))), 'QST_002');
  });

  test('should refuse an occurrence the recurrence never schedules, leaving nothing behind', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'quest-unscheduled');
    const today = localToday();
    const start = addDays(today, -14);
    const weeklyId = await createQuest(subject.ctx, {
      strictness: 'routine',
      startDate: start,
      recurrence: { frequency: 'weekly', startDate: start, end: { kind: 'never' }, daysOfWeek: [isoWeekday(today)] },
    });
    const excludedId = await createQuest(subject.ctx, {
      strictness: 'routine',
      startDate: start,
      recurrence: { frequency: 'daily', startDate: start, end: { kind: 'never' }, exceptions: [today] },
    });

    for (const [questId, date] of [
      [weeklyId, addDays(today, -1)],
      [weeklyId, addDays(today, -21)],
      [excludedId, today],
    ] as const) {
      expectFailed(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, date)), 'QST_004');
    }

    expect(await questLogs(subject.accountId)).toEqual([]);
    expect(await heroEvents(subject.accountId, QUEST_REWARD_TYPES)).toEqual([]);
    expect(await questStreak(subject.accountId, weeklyId)).toBeUndefined();
    expect(await questStreak(subject.accountId, excludedId)).toBeUndefined();

    expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(weeklyId, today)));
    expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(excludedId, addDays(today, -1))));
    expect((await questLogs(subject.accountId)).map(log => [log.questId, log.date])).toEqual([
      [excludedId, addDays(today, -1)],
      [weeklyId, today],
    ]);
  });

  test.describe('reschedule', () => {
    test('should refuse a day-level quest, cap reschedules at two per rolling week unless reclassified as a postpone, and refuse a second reschedule of one occurrence', async ({
      memoir,
    }) => {
      const subject = await rolloverSubject(memoir, 'quest-reschedule');
      const today = localToday();
      const goalId = await createQuest(subject.ctx, { strictness: 'goal', startDate: today });
      expectFailed(await submitCommand(subject.ctx, 'quest.reschedule', { ...occurrenceOf(goalId, today), toMin: 600 }), 'QST_008');

      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -10) });
      const reschedule = (date: string, extra: Record<string, unknown> = {}): ReturnType<typeof submitCommand> =>
        submitCommand(subject.ctx, 'quest.reschedule', { ...occurrenceOf(questId, date), toMin: 600, ...extra });

      expect((await reschedule(addDays(today, -9))).result, 'nine days back sits outside today’s window').toMatchObject({ state: 'rescheduled', rescheduleCountInWindow: 1 });
      expect((await reschedule(addDays(today, -2))).result).toMatchObject({ state: 'rescheduled', rescheduleCountInWindow: 1, rescheduleCap: 2 });
      expectFailed(await reschedule(addDays(today, -2), { toMin: 660 }), 'QST_001');
      expect((await reschedule(addDays(today, -1))).result).toMatchObject({ state: 'rescheduled', rescheduleCountInWindow: 2 });

      expect(await reschedule(today)).toMatchObject({ status: 'rejected', result: { kind: 'reschedule-cap', rescheduleCap: 2, rescheduleCountInWindow: 2 } });
      expect((await rescheduleEvents(subject.accountId)).map(event => [event.date, event.toMin])).toEqual([
        [addDays(today, -9), 600],
        [addDays(today, -2), 600],
        [addDays(today, -1), 600],
      ]);
      expect(await questLogOf(subject.accountId, questId, today), 'a refused reschedule writes nothing').toBeUndefined();

      expect(await reschedule(today, { acceptBeyondCap: true })).toMatchObject({ status: 'applied', result: { state: 'postponed', reclassifiedAsPostpone: true } });
      expect((await questLogOf(subject.accountId, questId, today))?.state).toBe('postponed');
      expect(await rescheduleEvents(subject.accountId)).toHaveLength(3);
    });

    test.fixme('should count only reschedules inside an occurrence’s own 7-day window, never later ones (app bug: apps/memoir-server/src/modules/quests/quest-log.repository.ts:194 bounds the window below only, so later reschedules count against an earlier occurrence)', async ({
      memoir,
    }) => {
      const subject = await rolloverSubject(memoir, 'quest-reschedule-window');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -20) });
      const reschedule = (date: string): ReturnType<typeof submitCommand> => submitCommand(subject.ctx, 'quest.reschedule', { ...occurrenceOf(questId, date), toMin: 600 });

      expectApplied(await reschedule(today));
      expectApplied(await reschedule(addDays(today, -1)));
      expect(await reschedule(addDays(today, -15))).toMatchObject({ status: 'applied', result: { state: 'rescheduled', rescheduleCountInWindow: 1 } });
    });

    test('should keep serving reschedule events after their occurrence completes, its log is deleted, and the quest is soft-deleted', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-reschedule-delta');
      const today = localToday();
      const yesterday = addDays(today, -1);
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: yesterday });
      expectApplied(await submitCommand(subject.ctx, 'quest.reschedule', { ...occurrenceOf(questId, yesterday), toMin: 600 }));
      expectApplied(await submitCommand(subject.ctx, 'quest.reschedule', { ...occurrenceOf(questId, today), toMin: 660 }));

      expect((await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, yesterday))).result).toMatchObject({ state: 'late' });
      const deleted = await submitCommand(subject.ctx, 'quest.deleteLog', occurrenceOf(questId, today));
      expect(deleted).toMatchObject({ status: 'applied', result: { deleted: true } });
      expectApplied(await submitCommand(subject.ctx, 'quest.delete', { questId }));

      const delta = await pullFullDelta(subject.ctx);
      expect((delta.domains['reschedule_events'] ?? []).map(row => [row['questId'], row['date'], row['toMin']])).toEqual([
        [questId, yesterday, 600],
        [questId, today, 660],
      ]);
      expect(delta.tombstones.filter(tombstone => tombstone.domain === 'reschedule_events')).toEqual([]);
      expect(delta.tombstones.filter(tombstone => tombstone.domain === 'quest_logs').map(tombstone => tombstone.recordId)).toEqual([deleted.result['logId']]);
    });
  });

  test('should attach reasons and edit a log inside its 7-day window, refuse edits outside it, and delete a log without clawing back its reward', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'quest-log-edits');
    const today = localToday();
    const yesterday = addDays(today, -1);
    const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: yesterday });
    const late = await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, yesterday));
    expect(late.result, 'a day late: the day_1 band').toMatchObject({ state: 'late', xpAwarded: 2 });
    expectApplied(await submitCommand(subject.ctx, 'quest.skip', occurrenceOf(questId, today)));

    const attached = await submitCommand(subject.ctx, 'quest.attachReason', { ...occurrenceOf(questId, today), reasonTag: 'too_tired', note: 'E2E long day' });
    expect(attached).toMatchObject({ status: 'applied', result: { reasonTag: 'too_tired', reasonNote: 'E2E long day' } });
    expectApplied(await submitCommand(subject.ctx, 'quest.editLog', { ...occurrenceOf(questId, today), reflectionText: 'E2E reflection' }));
    expect(await questLogOf(subject.accountId, questId, today)).toMatchObject({
      state: 'skipped',
      reasonTag: 'too_tired',
      reasonNote: 'E2E long day',
      reflectionText: 'E2E reflection',
    });

    const lateLogId = String(late.result['logId']);
    await memoirDb()`UPDATE quest_logs SET created_at = now() - interval '8 days' WHERE id = ${lateLogId}::bigint`;
    expectFailed(await submitCommand(subject.ctx, 'quest.editLog', { ...occurrenceOf(questId, yesterday), reflectionText: 'E2E too late' }), 'QST_006');
    expectFailed(await submitCommand(subject.ctx, 'quest.attachReason', { ...occurrenceOf(questId, yesterday), reasonTag: 'forgot' }), 'QST_006');
    expect(await questLogOf(subject.accountId, questId, yesterday)).toMatchObject({ state: 'late', reasonTag: null, reflectionText: null });

    const before = await rolloverAccount(subject.accountId);
    expect(await submitCommand(subject.ctx, 'quest.deleteLog', occurrenceOf(questId, yesterday)), 'deletion carries no window').toMatchObject({
      status: 'applied',
      result: { logId: lateLogId, deleted: true },
    });
    expect(await questLogOf(subject.accountId, questId, yesterday)).toBeUndefined();
    expect((await heroEvents(subject.accountId, ['quest_late'])).map(event => [event.date, event.questId, event.xpDelta])).toEqual([[yesterday, questId, 2]]);
    expect(await rolloverAccount(subject.accountId)).toMatchObject({ totalXp: before.totalXp, coins: before.coins });
    expect((await pullFullDelta(subject.ctx)).tombstones.filter(tombstone => tombstone.domain === 'quest_logs').map(tombstone => tombstone.recordId)).toEqual([lateLogId]);
    expectFailed(await submitCommand(subject.ctx, 'quest.deleteLog', occurrenceOf(questId, yesterday)), 'QST_007');
  });

  test.describe('concurrent occurrence actions', () => {
    test('should converge two concurrent completions of one occurrence to a single log and a single reward', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-race-complete');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      const complete = { type: 'quest.complete', payload: occurrenceOf(questId, today) };

      const outcomes = await raceCommands(subject.ctx, subject.accountId, [complete, complete]);

      expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['applied', 'superseded']);
      const winner = outcomes.find(outcome => outcome.status === 'applied');
      const loser = outcomes.find(outcome => outcome.status === 'superseded');
      expect(loser?.result).toEqual({ state: 'completed', logId: winner?.result['logId'], xpAwarded: 10, coinsAwarded: 1 });
      expect((await questLogs(subject.accountId)).map(log => [log.questId, log.date, log.state])).toEqual([[questId, today, 'completed']]);
      expect((await heroEvents(subject.accountId, QUEST_REWARD_TYPES)).map(event => [event.type, event.questId, event.xpDelta, event.coinsDelta])).toEqual([
        ['quest_complete', questId, 10, 1],
      ]);
    });

    test('should let the first of a racing complete and skip win, reporting the winner’s persisted state to the loser', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-race-skip');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });

      const outcomes = await raceCommands(subject.ctx, subject.accountId, [
        { type: 'quest.complete', payload: occurrenceOf(questId, today) },
        { type: 'quest.skip', payload: occurrenceOf(questId, today) },
      ]);

      expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['applied', 'superseded']);
      const persisted = await questLogOf(subject.accountId, questId, today);
      expect(persisted?.state).toMatch(/^(completed|skipped)$/);
      const winner = outcomes.find(outcome => outcome.status === 'applied');
      const loser = outcomes.find(outcome => outcome.status === 'superseded');
      expect(winner?.result).toMatchObject({ state: persisted?.state, logId: persisted?.id });
      expect(loser?.result).toMatchObject({ state: persisted?.state, logId: persisted?.id });
      expect(await heroEvents(subject.accountId, QUEST_REWARD_TYPES)).toHaveLength(persisted?.state === 'completed' ? 1 : 0);
    });
  });

  test.describe('derived standing', () => {
    test('should report a weekly Crown window under low intensity, forfeit a skipped share at once, and restore it when the skip is deleted', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-crown-weekly');
      await setAccountSettings(subject.accountId, { intensityMode: 'low_intensity' });
      const today = localToday();
      const skippedId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      await rewindRollover(subject.accountId, addDays(today, -1));
      await catchUp(subject.ctx);

      const weekday = isoWeekday(today);
      const monday = addDays(today, 1 - weekday);
      const window = { label: 'this week', cadence: 'weekly', periodStart: monday, closesOn: addDays(monday, 6), dayIndex: weekday, dayCount: 7 };
      const crownToday = async (): Promise<unknown> => {
        const state = (await dailyStates(subject.accountId)).find(row => row.date === today);
        return { granted: state?.crownXpGranted, remaining: state?.crownXpRemaining, mirror: await crownMirror(subject.accountId) };
      };

      /* Low intensity: two routines of weight 1 endow 8 xp; a skip forfeits one weight, leaving 4. */
      expect((await accountSnapshot(subject.ctx))['crown']).toEqual({ ...window, keptPercent: 100 });
      expect(await crownToday()).toEqual({ granted: 8, remaining: 8, mirror: 8 });

      expectApplied(await submitCommand(subject.ctx, 'quest.skip', occurrenceOf(skippedId, today)));
      expect(await crownToday()).toEqual({ granted: 8, remaining: 4, mirror: 4 });
      expect((await accountSnapshot(subject.ctx))['crown']).toEqual({ ...window, keptPercent: 50 });

      expectApplied(await submitCommand(subject.ctx, 'quest.deleteLog', occurrenceOf(skippedId, today)));
      expect(await crownToday()).toEqual({ granted: 8, remaining: 8, mirror: 8 });
      expect((await accountSnapshot(subject.ctx))['crown']).toEqual({ ...window, keptPercent: 100 });
    });

    test('should sum shieldsAvailable and shieldCap only across active quests that can hold a shield', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'quest-shields');
      const today = localToday();
      const create = (strictness: 'routine' | 'goal' | 'optional', extra: Record<string, unknown> = {}): Promise<string> =>
        submitCommand(subject.ctx, 'quest.create', { ...questDraft({ strictness, startDate: today }), ...extra }).then(outcome => {
          expectApplied(outcome);
          return String(outcome.result['id']);
        });
      const routineId = await create('routine');
      await create('goal');
      await create('optional', { optionalStreakOptIn: true });
      await create('optional');
      const giftedId = await create('optional');
      const deletedId = await create('routine');
      await seedQuestStreak(subject.accountId, routineId, { currentRunDays: 4, shieldsAvailable: 2 });
      await seedQuestStreak(subject.accountId, giftedId, { currentRunDays: 0, shieldsAvailable: 1 });
      await seedQuestStreak(subject.accountId, deletedId, { currentRunDays: 2, shieldsAvailable: 1 });
      expectApplied(await submitCommand(subject.ctx, 'quest.delete', { questId: deletedId }));

      /* Counted: the routine, the goal, the opted-in Optional and the Optional holding a gift — four quests × a cap of 2. */
      expect(await accountSnapshot(subject.ctx)).toMatchObject({ shieldsAvailable: 3, shieldCap: 8 });
    });
  });
});

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { csrfHeaders, memoirDb } from '../../lib';
import { expectApplied, submitCommandWithHeaders, withAccountLockHeld } from './concurrency-helpers';
import { expect, test } from './fixtures';
import { getAccount, pullDelta, submitCommand } from './helpers';
import {
  accountSnapshot,
  addDays,
  backdatePreparedDay,
  catchUp,
  comebackEvents,
  createQuest,
  type DailyStateRow,
  dailyStates,
  dateRange,
  heroEventCounts,
  heroEvents,
  isoWeekday,
  localDayLengthMinutes,
  localToday,
  missedAnchorRig,
  patchAccount,
  questLogs,
  questStreak,
  recoveryQuests,
  returnerEvents,
  rewindLastHpDate,
  rewindRollover,
  rolloverAccount,
  RolloverRigError,
  type RolloverSubject,
  rolloverSubject,
  seedPendingRecovery,
  seedQuestLogs,
  seedQuestStreak,
  setAccountSettings,
  startOfLocalDay,
} from './rollover-helpers';

/**
 * Defining types
 */

interface DstDay {
  timeZone: string;
  date: string;
}

/**
 * Declaring the constants
 *
 * Rollover (ARCHITECTURE §13): the lazy, in-request day walk every command batch and delta pull runs first. Elapsed days
 * are arranged by rewinding `accounts.last_hp_date` (see `rollover-helpers.ts`) and asserted through the delta and the
 * rows the walk writes. The engine's HP/Crown/Comeback/Returner numbers come from ruleset v1 (`rules/ruleset.ts`).
 *
 * The walk resumes at `last_hp_date + 1`, and preparing today stamps `last_hp_date = today`, so the day an account was
 * last prepared on is never closed (apps/memoir-server/src/modules/rollover/rollover.service.ts:192 and :428); the
 * `test.fixme`s pin the correct behaviour. Every live test starts its elapsed days after a day the rig leaves closed.
 */

const CATCHUP_MAX_DAYS = 90;
const DST_CANDIDATE_ZONES = ['America/Santiago', 'America/New_York', 'Europe/London', 'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Casablanca'];
const DST_SEARCH_DAYS = 85;
const RETURNER_OFF = 90;

/** Days the walk closed after `lastWalked`, whose own row the rig leaves terminalized. */
function closedDates(states: DailyStateRow[], lastWalked: string): string[] {
  return states.filter(state => state.date > lastWalked && state.rolloverAt !== null).map(state => state.date);
}

function stateOn(states: DailyStateRow[], date: string): DailyStateRow {
  const state = states.find(row => row.date === date);
  if (!state) throw new RolloverRigError(`no daily_states row for ${date}`);
  return state;
}

function hpOf(state: DailyStateRow): { hpStart: number; hpEnd: number } {
  return { hpStart: state.hpStart, hpEnd: state.hpEnd };
}

function crownOf(
  state: DailyStateRow,
): Pick<DailyStateRow, 'crownXpGranted' | 'crownXpRemaining' | 'crownCoinsGranted' | 'crownCoinsRemaining' | 'crownBankedXp' | 'crownBankedCoins'> {
  const { crownXpGranted, crownXpRemaining, crownCoinsGranted, crownCoinsRemaining, crownBankedXp, crownBankedCoins } = state;
  return { crownXpGranted, crownXpRemaining, crownCoinsGranted, crownCoinsRemaining, crownBankedXp, crownBankedCoins };
}

/** The most recent local day, within the catch-up bound, on which some candidate zone changes its UTC offset. */
function recentDstDay(): DstDay | undefined {
  const found: DstDay[] = [];
  for (const timeZone of DST_CANDIDATE_ZONES) {
    const today = localToday(timeZone);
    const transitions = dateRange(addDays(today, -DST_SEARCH_DAYS), addDays(today, -2)).filter(day => localDayLengthMinutes(day, timeZone) !== 24 * 60);
    const date = transitions[transitions.length - 1];
    if (date) found.push({ timeZone, date });
  }
  return found.sort((left, right) => right.date.localeCompare(left.date))[0];
}

async function syncSeqOf(table: 'daily_states' | 'quest_logs', accountId: string, date: string, state?: string): Promise<bigint> {
  const sql = memoirDb();
  const [row] = await sql<{ seq: string }[]>`
    SELECT max(sync_seq)::text AS seq FROM ${sql(table)} WHERE account_id = ${accountId}::bigint AND date = ${date}::date ${state ? sql`AND state = ${state}` : sql``}
  `;
  if (!row?.seq) throw new RolloverRigError(`no ${table} row for account ${accountId} on ${date}`);
  return BigInt(row.seq);
}

/** Last active `absentDays` ago with a completed anchor then, and every day since elapsed and unwalked. */
async function returnAfter(subject: RolloverSubject, anchorQuestId: string, absentDays: number): Promise<string> {
  const lastActive = addDays(localToday(subject.timeZone), -absentDays);
  await seedQuestLogs(subject.accountId, anchorQuestId, [lastActive]);
  await setAccountSettings(subject.accountId, { lastActiveDate: lastActive });
  await rewindRollover(subject.accountId, lastActive);
  await catchUp(subject.ctx);
  return lastActive;
}

test.describe('memoir rollover', () => {
  test.describe('lazy invocation', () => {
    test('should close two elapsed days before a delta pull is answered, serving the closed days and their misses in that same page', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-lazy-pull');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -5) });
      const elapsed = [addDays(today, -2), addDays(today, -1)];
      const lastWalked = addDays(today, -3);
      await rewindRollover(subject.accountId, lastWalked);

      const page = await pullDelta(subject.ctx);
      expect(page.hasMore, 'a fresh account fits one page, so the page is the proof').toBe(false);
      const servedStates = (page.domains['daily_states'] ?? []).filter(row => String(row['date']) > lastWalked && row['rolloverAt'] !== null).map(row => row['date']);
      expect(servedStates).toEqual(elapsed);
      const servedMisses = (page.domains['quest_logs'] ?? []).filter(row => row['questId'] === questId && row['state'] === 'missed').map(row => row['date']);
      expect(servedMisses).toEqual(elapsed);

      expect((await rolloverAccount(subject.accountId)).lastHpDate).toBe(today);
      const states = await dailyStates(subject.accountId);
      expect(closedDates(states, lastWalked)).toEqual(elapsed);
      expect(stateOn(states, today).rolloverAt, 'today is prepared, never closed').toBeNull();
    });

    test('should close an elapsed day before a command batch applies its command', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-lazy-command');
      const today = localToday();
      const yesterday = addDays(today, -1);
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -3) });
      const lastWalked = addDays(today, -2);
      await rewindRollover(subject.accountId, lastWalked);

      expectApplied(await submitCommand(subject.ctx, 'quest.complete', { occurrenceId: `${questId}:${today}` }));

      expect(closedDates(await dailyStates(subject.accountId), lastWalked)).toEqual([yesterday]);
      const logs = await questLogs(subject.accountId);
      expect(logs.map(log => [log.date, log.state])).toEqual([
        [yesterday, 'missed'],
        [today, 'completed'],
      ]);
      const completedSeq = await syncSeqOf('quest_logs', subject.accountId, today, 'completed');
      expect(await syncSeqOf('daily_states', subject.accountId, yesterday), 'the day closed before the command wrote').toBeLessThan(completedSeq);
      expect(await syncSeqOf('quest_logs', subject.accountId, yesterday, 'missed')).toBeLessThan(completedSeq);
    });

    test.fixme('should close the day an account was last prepared on once the next day begins (app bug: apps/memoir-server/src/modules/rollover/rollover.service.ts:428 stamps last_hp_date on the prepared day and :192 resumes after it, so that day is never closed)', async ({
      memoir,
    }) => {
      const subject = await rolloverSubject(memoir, 'roll-prepared-day');
      const today = localToday();
      const anchorQuestId = await createQuest(subject.ctx, { strictness: 'anchor', startDate: addDays(today, -1) });
      const yesterday = await backdatePreparedDay(subject.accountId, today, 1);

      await catchUp(subject.ctx);

      const closed = stateOn(await dailyStates(subject.accountId), yesterday);
      expect({ closed: closed.rolloverAt !== null, ...hpOf(closed) }).toEqual({ closed: true, hpStart: 5, hpEnd: 4 });
      expect((await questLogs(subject.accountId)).filter(log => log.date === yesterday).map(log => [log.questId, log.state])).toEqual([[anchorQuestId, 'missed']]);
      expect((await heroEvents(subject.accountId, ['crown_init'])).map(event => event.date)).toEqual([yesterday]);
      expect((await recoveryQuests(subject.accountId)).map(recovery => [recovery.date, recovery.state])).toEqual([[today, 'pending']]);
    });
  });

  test('should close a 30-day absence exactly per the hand-computed HP and Crown fixture, one missed log per quest per absent day', async ({ memoir }) => {
    test.setTimeout(60_000);
    const subject = await rolloverSubject(memoir, 'roll-absence');
    const today = localToday();
    const start = addDays(today, -40);
    await patchAccount(subject.ctx, { returnerThresholdDays: RETURNER_OFF });
    const anchorA = await createQuest(subject.ctx, { strictness: 'anchor', startDate: start, startTimeMinutes: 480 });
    await createQuest(subject.ctx, { strictness: 'anchor', startDate: start, startTimeMinutes: 540 });
    const routineC = await createQuest(subject.ctx, { strictness: 'routine', startDate: start });
    await createQuest(subject.ctx, { strictness: 'routine', startDate: start });
    await createQuest(subject.ctx, { strictness: 'goal', startDate: start });

    const absent = dateRange(addDays(today, -30), addDays(today, -1));
    const keptDay = addDays(today, -10);
    await seedQuestLogs(subject.accountId, anchorA, [keptDay]);
    await seedQuestLogs(subject.accountId, routineC, [keptDay]);
    const lastWalked = addDays(today, -31);
    await rewindRollover(subject.accountId, lastWalked);

    await catchUp(subject.ctx);

    /*
     * Standard mode: hpMax 5, overnight regen 3, one HP per anchor/routine break (the goal costs none). Weight 1.5+1.5+1+1+1 = 6
     * endows 24 xp / 3 coins a day, all forfeited on a full miss. The kept day breaks B, D (2 HP) and forfeits 3.5, keeping
     * 2.5 → 10 xp / 2 coins, which the daily cadence banks at once. The first day opens at full HP from the rig's closed full-HP day before it.
     */
    const expectedHp = new Map<string, { hpStart: number; hpEnd: number }>();
    let previousEnd = 5;
    for (const date of absent) {
      const hpStart = Math.min(5, previousEnd + 3);
      const hpEnd = Math.max(0, hpStart - (date === keptDay ? 2 : 4));
      expectedHp.set(date, { hpStart, hpEnd });
      previousEnd = hpEnd;
    }

    const states = await dailyStates(subject.accountId);
    expect(closedDates(states, lastWalked)).toEqual(absent);
    for (const date of absent) {
      const state = stateOn(states, date);
      const kept = date === keptDay;
      expect({ date, ...hpOf(state), hpMax: state.hpMax, missedCount: state.missedCount }).toEqual({ date, ...expectedHp.get(date), hpMax: 5, missedCount: kept ? 3 : 5 });
      expect({ date, ...crownOf(state) }).toEqual({
        date,
        crownXpGranted: 24,
        crownXpRemaining: kept ? 10 : 0,
        crownCoinsGranted: 3,
        crownCoinsRemaining: kept ? 2 : 0,
        crownBankedXp: kept ? 10 : 0,
        crownBankedCoins: kept ? 2 : 0,
      });
    }
    expect(hpOf(stateOn(states, today)), 'today opens from yesterday’s 0 plus the overnight regen').toEqual({ hpStart: 3, hpEnd: 3 });

    const logs = await questLogs(subject.accountId);
    const misses = logs.filter(log => log.state === 'missed');
    expect(misses).toHaveLength(absent.length * 5 - 2);
    for (const date of absent)
      expect(
        misses.filter(log => log.date === date),
        date,
      ).toHaveLength(date === keptDay ? 3 : 5);
    expect(new Set(misses.map(log => `${log.questId}:${log.date}`)).size, 'never two misses for one occurrence').toBe(misses.length);

    const counts = await heroEventCounts(subject.accountId);
    expect({
      init: counts['crown_init'],
      forfeit: counts['crown_forfeit'],
      banked: counts['crown_banked'],
      expired: counts['recovery_expired'],
      returner: counts['returner_fired'],
    }).toEqual({
      init: absent.length,
      forfeit: absent.length * 5 - 2,
      banked: 1,
      expired: undefined,
      returner: undefined,
    });
    expect((await heroEvents(subject.accountId, ['crown_banked'])).map(event => [event.date, event.xpDelta, event.coinsDelta])).toEqual([[keptDay, 10, 2]]);

    const account = await rolloverAccount(subject.accountId);
    expect(account).toMatchObject({ lastHpDate: today, lastActiveDate: keptDay, hpToday: 3, hpStartToday: 3, hpMax: 5 });
    const allEvents = await heroEvents(subject.accountId);
    expect(account.totalXp, 'the account total is exactly the ledger’s sum').toBe(allEvents.reduce((total, event) => total + event.xpDelta, 0));
    expect(account.coins).toBe(allEvents.reduce((total, event) => total + event.coinsDelta, 0));
  });

  test.describe('catch-up bound and idempotence', () => {
    test('should close only the days within the catch-up bound, skip an already-terminalized day, and change nothing when the walk is replayed', async ({ memoir }) => {
      test.setTimeout(90_000);
      const subject = await rolloverSubject(memoir, 'roll-bound');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -130) });
      const lastWalked = addDays(today, -120);
      const bound = addDays(today, -CATCHUP_MAX_DAYS);
      const terminalized = addDays(today, -45);
      await rewindRollover(subject.accountId, lastWalked);
      await memoirDb()`
        INSERT INTO daily_states (account_id, date, intensity_mode, hp_start, hp_end, hp_max, crown_period_start, rollover_at, rollover_engine_version, ruleset_version)
        VALUES (${subject.accountId}::bigint, ${terminalized}::date, 'standard', 0, 0, 5, ${terminalized}::date, '2000-01-01T00:00:00Z', 'e2e-seeded', 1)
      `;

      await catchUp(subject.ctx);

      const window = dateRange(bound, addDays(today, -1));
      const states = await dailyStates(subject.accountId);
      expect(closedDates(states, lastWalked)).toEqual(window);
      expect(
        states.filter(state => state.date > lastWalked && state.date < bound),
        'nothing older than the bound is written',
      ).toEqual([]);
      const seeded = stateOn(states, terminalized);
      expect({ ...hpOf(seeded), missedCount: seeded.missedCount, rolloverAt: seeded.rolloverAt?.toISOString() }).toEqual({
        hpStart: 0,
        hpEnd: 0,
        missedCount: 0,
        rolloverAt: '2000-01-01T00:00:00.000Z',
      });
      expect(hpOf(stateOn(states, addDays(terminalized, 1))), 'the next day opened from the skipped day’s own hp_end').toEqual({ hpStart: 3, hpEnd: 2 });
      expect(hpOf(stateOn(states, bound)), 'the bound’s first day opens at full HP').toEqual({ hpStart: 5, hpEnd: 4 });

      const misses = (await questLogs(subject.accountId)).filter(log => log.questId === questId && log.state === 'missed').map(log => log.date);
      expect(misses).toEqual(window.filter(date => date !== terminalized));
      const counts = await heroEventCounts(subject.accountId);
      expect([counts['crown_init'], counts['crown_forfeit']]).toEqual([window.length - 1, window.length - 1]);
      expect((await rolloverAccount(subject.accountId)).lastHpDate).toBe(today);

      const snapshot = async (): Promise<unknown> => ({
        states: await dailyStates(subject.accountId),
        logs: await questLogs(subject.accountId),
        counts: await heroEventCounts(subject.accountId),
        recoveries: await recoveryQuests(subject.accountId),
        comebacks: await comebackEvents(subject.accountId),
        account: await rolloverAccount(subject.accountId),
      });
      const before = await snapshot();
      await rewindLastHpDate(subject.accountId, lastWalked);
      await catchUp(subject.ctx);
      expect(await snapshot(), 'a replayed walk over terminalized days is a no-op').toEqual(before);
    });

    test('should serialize a delta pull and a command batch racing the same catch-up into one closing of each day', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-race');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -10) });
      const elapsed = dateRange(addDays(today, -5), addDays(today, -1));
      const lastWalked = addDays(today, -6);
      await rewindRollover(subject.accountId, lastWalked);

      const headers = await csrfHeaders(subject.ctx);
      const [, completion] = await withAccountLockHeld(subject.accountId, 2, () =>
        Promise.all([pullDelta(subject.ctx), submitCommandWithHeaders(subject.ctx, headers, 'quest.complete', { occurrenceId: `${questId}:${today}` })]),
      );
      expectApplied(completion);

      expect(closedDates(await dailyStates(subject.accountId), lastWalked)).toEqual(elapsed);
      const logs = await questLogs(subject.accountId);
      expect(logs.map(log => [log.date, log.state])).toEqual([...elapsed.map(date => [date, 'missed']), [today, 'completed']]);
      const counts = await heroEventCounts(subject.accountId);
      expect([counts['crown_init'], counts['crown_forfeit'], counts['recovery_spawned']]).toEqual([elapsed.length, elapsed.length, 1]);
      expect(await recoveryQuests(subject.accountId)).toHaveLength(1);
      expect((await rolloverAccount(subject.accountId)).lastHpDate).toBe(today);
    });
  });

  test.describe('crown periods and local days', () => {
    test('should bank a weekly Crown period once however many times its days are re-walked', async ({ memoir }) => {
      test.setTimeout(60_000);
      const subject = await rolloverSubject(memoir, 'roll-weekly-crown');
      await setAccountSettings(subject.accountId, { intensityMode: 'low_intensity', returnerThresholdDays: RETURNER_OFF });
      const today = localToday();
      let sunday = addDays(today, -1);
      while (isoWeekday(sunday) !== 7) sunday = addDays(sunday, -1);
      const monday = addDays(sunday, -6);
      const week = dateRange(monday, sunday);

      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(monday, -7) });
      await seedQuestLogs(subject.accountId, questId, week);
      await rewindRollover(subject.accountId, addDays(monday, -1));
      await catchUp(subject.ctx);

      /* Low intensity: one routine endows 4 xp / 1 coin a day, each kept by the day's completion, banked together on Sunday. */
      let states = await dailyStates(subject.accountId);
      for (const date of week) {
        const closing = date === sunday;
        expect({ date, periodStart: stateOn(states, date).crownPeriodStart, ...crownOf(stateOn(states, date)) }).toEqual({
          date,
          periodStart: monday,
          crownXpGranted: 4,
          crownXpRemaining: 4,
          crownCoinsGranted: 1,
          crownCoinsRemaining: 1,
          crownBankedXp: closing ? 28 : null,
          crownBankedCoins: closing ? 7 : null,
        });
      }
      const banked = async (): Promise<unknown[]> => (await heroEvents(subject.accountId, ['crown_banked'])).map(event => [event.date, event.xpDelta, event.coinsDelta]);
      expect(await banked()).toEqual([[sunday, 28, 7]]);
      const afterFirst = await rolloverAccount(subject.accountId);

      const wednesday = addDays(monday, 2);
      await rewindRollover(subject.accountId, wednesday);
      await catchUp(subject.ctx);

      states = await dailyStates(subject.accountId);
      expect(crownOf(stateOn(states, sunday)), 'the re-walked close recomputes the same bank from the kept Mon–Wed rows').toMatchObject({ crownBankedXp: 28, crownBankedCoins: 7 });
      expect(await banked(), 'the period banks once, keyed by its start').toEqual([[sunday, 28, 7]]);
      const afterSecond = await rolloverAccount(subject.accountId);
      expect([afterSecond.totalXp, afterSecond.coins]).toEqual([afterFirst.totalXp, afterFirst.coins]);

      await rewindLastHpDate(subject.accountId, addDays(monday, -1));
      await catchUp(subject.ctx);
      expect(await banked(), 'a replay over the closed week skips it').toEqual([[sunday, 28, 7]]);
      const afterReplay = await rolloverAccount(subject.accountId);
      expect([afterReplay.totalXp, afterReplay.coins]).toEqual([afterFirst.totalXp, afterFirst.coins]);
    });

    test('should close a DST-transition day as one whole local day', async ({ memoir }) => {
      const dst = recentDstDay();
      test.skip(!dst, `no candidate zone changed its UTC offset in the last ${DST_SEARCH_DAYS} days, inside the ${CATCHUP_MAX_DAYS}-day catch-up bound`);
      if (!dst) return;

      const subject = { ...(await rolloverSubject(memoir, 'roll-dst')), timeZone: dst.timeZone };
      await setAccountSettings(subject.accountId, { timezone: dst.timeZone, returnerThresholdDays: RETURNER_OFF });
      const today = localToday(dst.timeZone);
      const weekday = isoWeekday(dst.date);
      const daily = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(dst.date, -7) });
      const weekly = await createQuest(subject.ctx, {
        strictness: 'routine',
        startDate: addDays(dst.date, -14),
        recurrence: { frequency: 'weekly', startDate: addDays(dst.date, -14), end: { kind: 'never' }, daysOfWeek: [weekday] },
      });
      const lastWalked = addDays(dst.date, -2);
      await rewindRollover(subject.accountId, lastWalked);

      await catchUp(subject.ctx);

      const elapsed = dateRange(addDays(dst.date, -1), addDays(today, -1));
      expect(
        closedDates(await dailyStates(subject.accountId), lastWalked),
        `${dst.date} in ${dst.timeZone} lasts ${localDayLengthMinutes(dst.date, dst.timeZone)} minutes`,
      ).toEqual(elapsed);
      expect((await rolloverAccount(subject.accountId)).lastHpDate).toBe(today);

      const misses = (await questLogs(subject.accountId)).filter(log => log.state === 'missed');
      expect(misses.filter(log => log.questId === daily).map(log => log.date)).toEqual(elapsed);
      expect(misses.filter(log => log.questId === weekly).map(log => log.date)).toEqual(elapsed.filter(date => isoWeekday(date) === weekday));
      expect(misses.filter(log => log.questId === weekly)[0]?.date).toBe(dst.date);
    });
  });

  test('should apply a staged timezone and intensity change only after every elapsed day has closed under the old settings', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'roll-pending');
    const today = localToday();
    const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -5) });
    const staged = await patchAccount(subject.ctx, { timezone: 'Atlantic/Reykjavik', intensityMode: 'high_intensity' });
    expect(staged).toMatchObject({ timezone: 'UTC', pendingTimezone: 'Atlantic/Reykjavik', intensityMode: 'standard', pendingIntensityMode: 'high_intensity' });

    expectApplied(await submitCommand(subject.ctx, 'quest.update', { questId, patch: { name: 'E2E renamed mid-day' } }));
    expect(await rolloverAccount(subject.accountId), 'a change never lands mid-day').toMatchObject({
      timezone: 'UTC',
      pendingTimezone: 'Atlantic/Reykjavik',
      intensityMode: 'standard',
      pendingIntensityMode: 'high_intensity',
    });

    const elapsed = [addDays(today, -2), addDays(today, -1)];
    const lastWalked = addDays(today, -3);
    await rewindRollover(subject.accountId, lastWalked);
    await catchUp(subject.ctx);

    const states = await dailyStates(subject.accountId);
    expect(closedDates(states, lastWalked)).toEqual(elapsed);
    expect(elapsed.map(date => ({ date, intensity: stateOn(states, date).intensityMode, hpMax: stateOn(states, date).hpMax, ...hpOf(stateOn(states, date)) }))).toEqual([
      { date: elapsed[0], intensity: 'standard', hpMax: 5, hpStart: 5, hpEnd: 4 },
      { date: elapsed[1], intensity: 'standard', hpMax: 5, hpStart: 5, hpEnd: 4 },
    ]);
    expect((await questLogs(subject.accountId)).filter(log => log.state === 'missed').map(log => log.intensityModeAtLog)).toEqual(['standard', 'standard']);

    const todayState = stateOn(states, today);
    expect({ intensity: todayState.intensityMode, hpMax: todayState.hpMax, ...hpOf(todayState) }, 'high intensity: hpMax 3, regen 2 onto yesterday’s 4, capped').toEqual({
      intensity: 'high_intensity',
      hpMax: 3,
      hpStart: 3,
      hpEnd: 3,
    });
    expect(await rolloverAccount(subject.accountId)).toMatchObject({
      timezone: 'Atlantic/Reykjavik',
      pendingTimezone: null,
      intensityMode: 'high_intensity',
      pendingIntensityMode: null,
      hpMax: 3,
      lastHpDate: today,
    });
    expect(await getAccount(subject.ctx)).toMatchObject({ timezone: 'Atlantic/Reykjavik', pendingTimezone: null, intensityMode: 'high_intensity', pendingIntensityMode: null });
  });

  test.describe('today preparation', () => {
    test('should arm Comeback and spawn exactly one pending Recovery from an anchor miss yesterday', async ({ memoir }) => {
      let routineId = '';
      const rig = await missedAnchorRig(memoir, 'roll-comeback', async ({ ctx, accountId, today }) => {
        routineId = await createQuest(ctx, { strictness: 'routine', startDate: addDays(today, -2) });
        await seedQuestLogs(accountId, routineId, [addDays(today, -2)]);
      });

      const yesterdayMisses = (await questLogs(rig.accountId)).filter(log => log.date === rig.yesterday && log.state === 'missed');
      expect(yesterdayMisses.map(log => log.questId).sort()).toEqual([rig.anchorQuestId, routineId].sort());

      /* A completion two days ago warms momentum, so the cold-only trigger stands aside and the anchor rule is what arms. */
      expect(await comebackEvents(rig.accountId)).toEqual([{ date: rig.today, kind: 'armed', triggerKind: 'anchor_miss_yesterday' }]);
      const todayState = stateOn(await dailyStates(rig.accountId), rig.today);
      expect({ comeback: todayState.comebackArmed, returner: todayState.returnerFired }).toEqual({ comeback: true, returner: false });

      const recoveries = await recoveryQuests(rig.accountId);
      expect(recoveries).toHaveLength(1);
      expect(recoveries[0]).toMatchObject({ date: rig.today, state: 'pending', sourceQuestId: rig.anchorQuestId, isReturnerDay: false });
      expect(recoveries[0]?.triggerLogIds.sort(), 'both of yesterday’s misses triggered the one Recovery').toEqual(yesterdayMisses.map(log => log.id).sort());
      expect(recoveries[0]?.expiresAt.toISOString()).toBe(startOfLocalDay(addDays(rig.today, 1), rig.timeZone).toISOString());
      expect((await heroEvents(rig.accountId, ['recovery_spawned'])).map(event => [event.date, event.questId])).toEqual([[rig.today, rig.anchorQuestId]]);
      expect(await accountSnapshot(rig.ctx)).toMatchObject({ persona: 'recovery', comeback: { armed: true, firedOn: null } });

      await catchUp(rig.ctx);
      expectApplied(await submitCommand(rig.ctx, 'quest.update', { questId: routineId, patch: { name: 'E2E touched after preparation' } }));
      expect(await recoveryQuests(rig.accountId), 'a re-prepared today never spawns a second Recovery').toHaveLength(1);
      expect(await comebackEvents(rig.accountId)).toHaveLength(1);
      expect(await heroEvents(rig.accountId, ['recovery_spawned'])).toHaveLength(1);
    });

    test('should neither arm Comeback nor spawn a Recovery when yesterday’s only miss was a Goal', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-goal-miss');
      const today = localToday();
      const goalId = await createQuest(subject.ctx, { strictness: 'goal', startDate: addDays(today, -1) });
      await rewindRollover(subject.accountId, addDays(today, -2));

      await catchUp(subject.ctx);

      expect((await questLogs(subject.accountId)).map(log => [log.questId, log.date, log.state])).toEqual([[goalId, addDays(today, -1), 'missed']]);
      expect(await recoveryQuests(subject.accountId)).toEqual([]);
      expect(await comebackEvents(subject.accountId)).toEqual([]);
      expect(await accountSnapshot(subject.ctx)).toMatchObject({ persona: 'active', comeback: null });
    });

    test('should expire a pending Recovery silently when its day closes', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-recovery-expiry');
      const today = localToday();
      const yesterday = addDays(today, -1);
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      await rewindRollover(subject.accountId, addDays(today, -2));
      const recoveryId = await seedPendingRecovery(subject.accountId, yesterday, subject.timeZone, questId);

      await catchUp(subject.ctx);

      expect((await recoveryQuests(subject.accountId)).map(recovery => [recovery.id, recovery.state])).toEqual([[recoveryId, 'expired']]);
      expect((await heroEvents(subject.accountId, ['recovery_expired'])).map(event => [event.date, event.questId, event.xpDelta, event.coinsDelta])).toEqual([
        [yesterday, questId, 0, 0],
      ]);
      const closed = stateOn(await dailyStates(subject.accountId), yesterday);
      expect({ ...hpOf(closed), missedCount: closed.missedCount, closed: closed.rolloverAt !== null }, 'no penalty and no miss').toEqual({
        hpStart: 5,
        hpEnd: 5,
        missedCount: 0,
        closed: true,
      });
      expect(await questLogs(subject.accountId)).toEqual([]);
      expect(await comebackEvents(subject.accountId)).toEqual([]);
      expect(await rolloverAccount(subject.accountId)).toMatchObject({ totalXp: 0, coins: 0, hpToday: 5 });
      expect(await accountSnapshot(subject.ctx)).toMatchObject({ persona: 'active', comeback: null });
    });

    test.fixme('should expire the Recovery an account was prepared with once the next day begins (app bug: apps/memoir-server/src/modules/rollover/rollover.service.ts:428 stamps last_hp_date on the prepared day and :192 resumes after it, so the Recovery’s own day never closes)', async ({
      memoir,
    }) => {
      const subject = await rolloverSubject(memoir, 'roll-recovery-next-day');
      const today = localToday();
      const anchorQuestId = await createQuest(subject.ctx, { strictness: 'anchor', startDate: addDays(today, -1) });
      const yesterday = await backdatePreparedDay(subject.accountId, today, 1);
      const recoveryId = await seedPendingRecovery(subject.accountId, yesterday, subject.timeZone, anchorQuestId);

      await catchUp(subject.ctx);

      const recoveries = await recoveryQuests(subject.accountId);
      expect(recoveries.find(recovery => recovery.id === recoveryId)?.state).toBe('expired');
      expect(recoveries.filter(recovery => recovery.date === today).map(recovery => recovery.state)).toEqual(['pending']);
      expect(await heroEvents(subject.accountId, ['recovery_expired'])).toHaveLength(1);
    });
  });

  test.describe('returner ritual', () => {
    test.fixme('should date the last activity to the prepared day it happened on, firing the Returner from there (app bug: apps/memoir-server/src/modules/rollover/rollover.service.ts:428 and :192 leave the prepared day unclosed, so last_active_date never records it and :475 skips the Returner)', async ({
      memoir,
    }) => {
      const subject = await rolloverSubject(memoir, 'roll-returner-prepared-day');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'anchor', startDate: addDays(today, -9) });
      const preparedOn = await backdatePreparedDay(subject.accountId, today, 8);
      await seedQuestLogs(subject.accountId, questId, [preparedOn]);

      await catchUp(subject.ctx);

      expect(stateOn(await dailyStates(subject.accountId), preparedOn).rolloverAt).not.toBeNull();
      expect((await rolloverAccount(subject.accountId)).lastActiveDate).toBe(preparedOn);
      expect((await returnerEvents(subject.accountId)).map(event => [event.date, event.daysAbsent])).toEqual([[today, 8]]);
    });

    test('should fire past the threshold, shield the longest pre-absence run, and suppress Comeback', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-returner');
      const today = localToday();
      const lastActive = addDays(today, -11);
      const routineA = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -20) });
      const anchorB = await createQuest(subject.ctx, { strictness: 'anchor', startDate: addDays(today, -20) });
      await seedQuestLogs(subject.accountId, routineA, dateRange(addDays(today, -15), lastActive));
      await seedQuestLogs(subject.accountId, anchorB, [...dateRange(addDays(today, -20), addDays(today, -14)), lastActive]);
      await setAccountSettings(subject.accountId, { lastActiveDate: lastActive });
      await rewindRollover(subject.accountId, lastActive);

      await catchUp(subject.ctx);

      /* A's run into the last active day is 5; B has more completions but its run into that day is 1 — the run, not the count, picks A. */
      expect(await returnerEvents(subject.accountId)).toEqual([{ date: today, lastActiveDate: lastActive, daysAbsent: 11, shieldTargetQuestId: routineA, shieldPending: false }]);
      expect(await questStreak(subject.accountId, routineA)).toMatchObject({ shieldsAvailable: 1, pendingShieldGrant: 0 });
      expect((await questStreak(subject.accountId, anchorB))?.shieldsAvailable ?? 0).toBe(0);
      expect((await heroEvents(subject.accountId, ['returner_fired'])).map(event => event.date)).toEqual([today]);

      const todayState = stateOn(await dailyStates(subject.accountId), today);
      expect({ returnerActive: todayState.returnerActive, returnerFired: todayState.returnerFired, comebackArmed: todayState.comebackArmed }).toEqual({
        returnerActive: true,
        returnerFired: true,
        comebackArmed: false,
      });
      expect(await comebackEvents(subject.accountId), 'yesterday’s anchor miss would have armed Comeback on any other day').toEqual([]);
      expect((await recoveryQuests(subject.accountId)).map(recovery => [recovery.date, recovery.isReturnerDay])).toEqual([[today, true]]);
      expect(await accountSnapshot(subject.ctx)).toMatchObject({ persona: 'returner', comeback: null, shieldsAvailable: 1 });

      await catchUp(subject.ctx);
      expect(await returnerEvents(subject.accountId)).toHaveLength(1);
      expect(await questStreak(subject.accountId, routineA)).toMatchObject({ shieldsAvailable: 1, pendingShieldGrant: 0 });
      expect(await heroEvents(subject.accountId, ['returner_fired'])).toHaveLength(1);
    });

    test('should honour the account’s own threshold, arming Comeback one day short of it and firing the Returner on it', async ({ memoir }) => {
      const threshold = 5;
      const [short, onThreshold] = await Promise.all([rolloverSubject(memoir, 'roll-returner-short'), rolloverSubject(memoir, 'roll-returner-on')]);
      for (const subject of [short, onThreshold]) expect(await patchAccount(subject.ctx, { returnerThresholdDays: threshold })).toMatchObject({ returnerThresholdDays: threshold });
      const today = localToday();
      const shortAnchor = await createQuest(short.ctx, { strictness: 'anchor', startDate: addDays(today, -10) });
      const onAnchor = await createQuest(onThreshold.ctx, { strictness: 'anchor', startDate: addDays(today, -10) });

      await returnAfter(short, shortAnchor, threshold - 1);
      expect(await returnerEvents(short.accountId)).toEqual([]);
      expect((await comebackEvents(short.accountId)).map(event => event.kind)).toEqual(['armed']);
      expect(await accountSnapshot(short.ctx)).toMatchObject({ persona: 'recovery', comeback: { armed: true } });

      const lastActive = await returnAfter(onThreshold, onAnchor, threshold);
      expect(await returnerEvents(onThreshold.accountId)).toEqual([
        { date: today, lastActiveDate: lastActive, daysAbsent: threshold, shieldTargetQuestId: onAnchor, shieldPending: false },
      ]);
      expect(await comebackEvents(onThreshold.accountId)).toEqual([]);
      expect(await accountSnapshot(onThreshold.ctx)).toMatchObject({ persona: 'returner', comeback: null });
    });

    test('should hold the Returner shield pending on a target already at its shield cap', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-returner-capped');
      const today = localToday();
      const lastActive = addDays(today, -11);
      const questId = await createQuest(subject.ctx, {
        strictness: 'routine',
        startDate: addDays(today, -20),
        recurrence: { frequency: 'daily', startDate: addDays(today, -20), end: { kind: 'until', date: lastActive } },
      });
      await seedQuestLogs(subject.accountId, questId, dateRange(addDays(today, -13), lastActive));
      await seedQuestStreak(subject.accountId, questId, { currentRunDays: 3, shieldsAvailable: 2 });
      await setAccountSettings(subject.accountId, { lastActiveDate: lastActive });
      await rewindRollover(subject.accountId, lastActive);

      await catchUp(subject.ctx);

      expect(await returnerEvents(subject.accountId)).toEqual([{ date: today, lastActiveDate: lastActive, daysAbsent: 11, shieldTargetQuestId: questId, shieldPending: true }]);
      expect(await questStreak(subject.accountId, questId)).toMatchObject({ shieldsAvailable: 2, pendingShieldGrant: 1 });
      expect((await rolloverAccount(subject.accountId)).pendingReturnerShields).toBe(0);
    });

    test('should hold a targetless Returner shield on the account until the next quest created claims it', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'roll-returner-targetless');
      const today = localToday();
      const lastActive = addDays(today, -11);
      await setAccountSettings(subject.accountId, { lastActiveDate: lastActive });
      await rewindRollover(subject.accountId, lastActive);

      await catchUp(subject.ctx);

      expect(await returnerEvents(subject.accountId)).toEqual([{ date: today, lastActiveDate: lastActive, daysAbsent: 11, shieldTargetQuestId: null, shieldPending: true }]);
      expect((await rolloverAccount(subject.accountId)).pendingReturnerShields).toBe(1);

      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      expect((await rolloverAccount(subject.accountId)).pendingReturnerShields).toBe(0);
      expect(await questStreak(subject.accountId, questId)).toMatchObject({ shieldsAvailable: 1, pendingShieldGrant: 0 });
    });
  });
});

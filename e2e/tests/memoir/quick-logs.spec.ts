/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { memoirDb } from '../../lib';
import { expectApplied } from './concurrency-helpers';
import { expect, test } from './fixtures';
import { dailyQuestDraft, submitCommand } from './helpers';
import { addDays, heroEvents, localToday, rolloverAccount, rolloverSubject } from './rollover-helpers';
import { type CommandSpec, expectFailed, MemoirRowMissingError, occurrenceOf, raceCommands, replayCommand, submitSpec } from './quest-helpers';

/**
 * Defining types
 */

type QuickLogModule = 'journal' | 'meal' | 'weight';

interface QuickLog {
  module: QuickLogModule;
  xp: number;
  command: (date: string) => CommandSpec;
}

interface MealRow {
  name: string;
  calories: number;
  note: string | null;
  presetId: string | null;
}

/**
 * Declaring the constants
 *
 * Quick logs (PRD §2.6, §4.12, §4.13): journal, meal and weight each reward once per local day through a `{module}_{date}`
 * ledger key, side quests reward their first three a day, a backdated or quest-linked entry never calls the ledger, and the
 * monthly entry cap only ever advises.
 */

function journalSave(date: string): CommandSpec {
  return { type: 'journal.save', payload: { id: randomUUID(), draft: { date, text: 'E2E journal entry' } } };
}

const QUICK_LOGS: readonly QuickLog[] = [
  { module: 'journal', xp: 5, command: journalSave },
  { module: 'meal', xp: 3, command: date => ({ type: 'meal.log', payload: { id: randomUUID(), draft: { date, name: 'E2E meal', calories: 420, mealType: 'cooked' } } }) },
  { module: 'weight', xp: 3, command: date => ({ type: 'weight.save', payload: { date, kg: 70.5 } }) },
];

const MONTHLY_ENTRY_CAP = 100;

async function seedJournalEntries(accountId: string, date: string, count: number): Promise<void> {
  await memoirDb()`
    INSERT INTO journal_entries (id, account_id, date, text)
    SELECT gen_random_uuid(), ${accountId}::bigint, ${date}::date, 'E2E seeded entry' FROM generate_series(1, ${count})
  `;
}

async function journalCount(accountId: string): Promise<number> {
  const [row] = await memoirDb()<{ n: number }[]>`SELECT count(*)::int AS n FROM journal_entries WHERE account_id = ${accountId}::bigint`;
  return row?.n ?? 0;
}

async function mealOf(accountId: string, mealId: string): Promise<MealRow> {
  const [row] = await memoirDb()<MealRow[]>`
    SELECT name, calories, note, preset_id::text AS "presetId" FROM meals WHERE account_id = ${accountId}::bigint AND id = ${mealId}::uuid
  `;
  if (!row) throw new MemoirRowMissingError(`meal ${mealId} has no row`);
  return row;
}

test.describe('memoir quick logs', () => {
  test.describe('first-of-day reward', () => {
    test('should reward journal, meal and weight once a day across a literal replay and two concurrent submissions for the same day', async ({ memoir }) => {
      const replaying = await rolloverSubject(memoir, 'ql-replay');
      const racing = await rolloverSubject(memoir, 'ql-race');
      const today = localToday();

      for (const quickLog of QUICK_LOGS) {
        const command = quickLog.command(today);
        const first = await submitSpec(replaying.ctx, command);
        expect(first, quickLog.module).toMatchObject({ status: 'applied', result: { rewarded: true, xpAwarded: quickLog.xp, coinsAwarded: 0 } });
        expect(await replayCommand(replaying.ctx, first, command), quickLog.module).toMatchObject({ status: 'applied', replayed: true, result: first.result });

        const outcomes = await raceCommands(racing.ctx, racing.accountId, [quickLog.command(today), quickLog.command(today)]);
        const rewarded = outcomes.filter(outcome => outcome.result['rewarded'] === true);
        expect(rewarded, `${quickLog.module}: exactly one racer is rewarded`).toHaveLength(1);
        expect(rewarded[0]?.result['xpAwarded']).toBe(quickLog.xp);
        const other = outcomes.find(outcome => outcome !== rewarded[0]);
        if (quickLog.module === 'weight')
          expect(other, 'the second weight of a day asks to replace the first').toMatchObject({ status: 'rejected', result: { kind: 'needs-confirmation' } });
        else expect(other).toMatchObject({ status: 'applied', result: { rewarded: false, xpAwarded: 0 } });
      }

      for (const subject of [replaying, racing]) {
        const events = await heroEvents(subject.accountId, ['journal', 'meal', 'weight']);
        expect(events.map(event => [event.type, event.date, event.xpDelta]).sort()).toEqual([
          ['journal', today, 5],
          ['meal', today, 3],
          ['weight', today, 3],
        ]);
        expect((await rolloverAccount(subject.accountId)).totalXp).toBe(11);
      }
      expect(await journalCount(racing.accountId), 'both racers’ entries saved').toBe(2);
    });

    test('should never reward a backdated entry, and reward only the first three side quests of a day', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'ql-backdated');
      const today = localToday();
      const yesterday = addDays(today, -1);

      for (const quickLog of QUICK_LOGS) {
        expect(await submitSpec(subject.ctx, quickLog.command(yesterday)), quickLog.module).toMatchObject({
          status: 'applied',
          result: { rewarded: false, xpAwarded: 0, linkageOffer: null },
        });
      }
      const backdatedSideQuest = await submitCommand(subject.ctx, 'sidequest.log', { id: randomUUID(), draft: { date: yesterday, name: 'E2E backdated', statAffinity: 'body' } });
      expect(backdatedSideQuest.result, 'even the first of its day').toMatchObject({ rewarded: false, xpAwarded: 0, statTicked: false });
      expect(await heroEvents(subject.accountId)).toEqual([]);

      const sideQuests: Record<string, unknown>[] = [];
      for (let ordinal = 1; ordinal <= 4; ordinal++) {
        const outcome = await submitCommand(subject.ctx, 'sidequest.log', { id: randomUUID(), draft: { date: today, name: `E2E side quest ${ordinal}`, statAffinity: 'body' } });
        expectApplied(outcome);
        sideQuests.push(outcome.result);
      }
      expect(sideQuests.map(result => [result['rewarded'], result['xpAwarded'], result['coinsAwarded'], result['statTicked']])).toEqual([
        [true, 8, 1, true],
        [true, 8, 1, true],
        [true, 8, 1, true],
        [false, 0, 0, false],
      ]);
      expect(await heroEvents(subject.accountId, ['side_quest'])).toHaveLength(3);
      const [stats] = await memoirDb()<{ body: number }[]>`SELECT stat_body AS body FROM accounts WHERE id = ${subject.accountId}::bigint`;
      expect(stats?.body).toBe(3);
      expect(await rolloverAccount(subject.accountId)).toMatchObject({ totalXp: 24, coins: 3 });

      expect(await submitSpec(subject.ctx, journalSave(today)), 'today’s slot was never spent by the backdated entry').toMatchObject({
        result: { rewarded: true, xpAwarded: 5 },
      });
    });
  });

  test('should offer a linked quest instead of rewarding the log, and never grant both the quest and the log', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'ql-linkage');
    const today = localToday();
    const name = `E2E journal quest ${randomUUID()}`;
    const created = await submitCommand(subject.ctx, 'quest.create', { ...dailyQuestDraft(name, today), moduleLink: 'journal' });
    expectApplied(created);
    const questId = String(created.result['id']);

    expect((await submitSpec(subject.ctx, journalSave(today))).result).toMatchObject({
      rewarded: false,
      xpAwarded: 0,
      linkageOffer: { status: 'offered', questId, questName: name, date: today },
    });
    expect(await heroEvents(subject.accountId)).toEqual([]);

    expect((await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, today))).result).toMatchObject({ state: 'completed', xpAwarded: 10 });
    expect((await submitSpec(subject.ctx, journalSave(today))).result).toMatchObject({ rewarded: false, xpAwarded: 0, linkageOffer: { status: 'already-completed', questId } });
    expect((await heroEvents(subject.accountId, ['quest_complete', 'journal'])).map(event => event.type)).toEqual(['quest_complete']);

    const meal = await submitCommand(subject.ctx, 'meal.log', { id: randomUUID(), draft: { date: today, name: 'E2E unlinked meal', calories: 300, mealType: 'ate_out' } });
    expect(meal.result, 'a module no quest links to still rewards').toMatchObject({ rewarded: true, xpAwarded: 3, linkageOffer: null });
  });

  test('should advise at 80 and 100 entries a month but save every entry past the cap', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'ql-entry-cap');
    const today = localToday();
    const save = async (): Promise<Record<string, unknown>> => {
      const outcome = await submitCommand(subject.ctx, 'journal.save', { id: randomUUID(), draft: { date: today, text: 'E2E capped entry' } });
      expectApplied(outcome);
      return outcome.result['advisory'] as Record<string, unknown>;
    };
    const advisory = (used: number, level: string): Record<string, unknown> => ({ module: 'journal', used, limit: MONTHLY_ENTRY_CAP, level, blocksSave: false });

    await seedJournalEntries(subject.accountId, today, 78);
    expect(await save()).toMatchObject({ ...advisory(79, 'clear'), message: null });
    const approaching = await save();
    expect(approaching).toMatchObject({ ...advisory(80, 'approaching'), ratio: 0.8 });
    expect(approaching['message']).toEqual(expect.any(String));

    await seedJournalEntries(subject.accountId, today, 19);
    expect(await save()).toMatchObject({ ...advisory(100, 'reached'), ratio: 1 });
    expect(await save()).toMatchObject(advisory(101, 'reached'));
    expect(await journalCount(subject.accountId)).toBe(101);
  });

  test('should refuse to replace a day’s weight without confirmation, writing nothing, and replace it once confirmed without a second reward', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'ql-weight');
    const today = localToday();
    const weightOn = async (): Promise<string | undefined> => {
      const [row] = await memoirDb()<{ kg: string }[]>`SELECT kg::text FROM weights WHERE account_id = ${subject.accountId}::bigint AND date = ${today}::date`;
      return row?.kg;
    };

    expect((await submitCommand(subject.ctx, 'weight.save', { date: today, kg: 72.5 })).result).toMatchObject({ rewarded: true, xpAwarded: 3, replaced: false });
    const unconfirmed = await submitCommand(subject.ctx, 'weight.save', { date: today, kg: 71 });
    expect(unconfirmed).toMatchObject({ status: 'rejected', result: { kind: 'needs-confirmation', existing: { date: today, kg: '72.50' } } });
    expect(await weightOn()).toBe('72.50');

    const confirmed = await submitCommand(subject.ctx, 'weight.save', { date: today, kg: 71, confirmedReplacement: true });
    expect(confirmed).toMatchObject({ status: 'applied', result: { date: today, replaced: true, xpAwarded: 0, coinsAwarded: 0 } });
    expect(await weightOn()).toBe('71.00');
    expect(await heroEvents(subject.accountId, ['weight'])).toHaveLength(1);
    expect((await rolloverAccount(subject.accountId)).totalXp).toBe(3);
  });

  test('should snapshot a meal preset onto the logged meal, so editing the preset leaves it unchanged', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'ql-meal-preset');
    const today = localToday();
    const preset = await submitCommand(subject.ctx, 'meal.savePreset', { preset: { name: 'E2E oats', calories: 350, mealType: 'cooked', note: 'plain' } });
    expectApplied(preset);
    const presetId = String(preset.result['id']);

    const firstId = randomUUID();
    expectApplied(await submitCommand(subject.ctx, 'meal.logPreset', { id: firstId, presetId, date: today }));
    expect(await mealOf(subject.accountId, firstId)).toEqual({ name: 'E2E oats', calories: 350, note: 'plain', presetId });

    expectApplied(await submitCommand(subject.ctx, 'meal.preset.update', { id: presetId, patch: { name: 'E2E oats deluxe', calories: 510, note: null } }));
    expect(await mealOf(subject.accountId, firstId), 'the logged meal keeps its snapshot').toEqual({ name: 'E2E oats', calories: 350, note: 'plain', presetId });

    expectFailed(await submitCommand(subject.ctx, 'meal.logPreset', { id: randomUUID(), presetId: '999999999999', date: today }), 'QLG_001');
    const secondId = randomUUID();
    expectApplied(await submitCommand(subject.ctx, 'meal.logPreset', { id: secondId, presetId, date: today }));
    expect(await mealOf(subject.accountId, secondId)).toEqual({ name: 'E2E oats deluxe', calories: 510, note: null, presetId });
  });
});

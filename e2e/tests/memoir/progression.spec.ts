/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { memoirDb } from '../../lib';
import { expectApplied } from './concurrency-helpers';
import { expect, test } from './fixtures';
import { type CommandOutcome, getAccount, submitCommand } from './helpers';
import { addDays, createQuest, heroEvents, localToday, questDraft, rolloverAccount, rolloverSubject } from './rollover-helpers';
import {
  achievementsEarned,
  achievementUnlockEvents,
  type CommandSpec,
  cosmeticUnlocks,
  displayedTitle,
  expectFailed,
  occurrenceOf,
  raceCommands,
  replayCommand,
  seedRescheduleEvents,
  setCoins,
  setStats,
  submitSpec,
  titlesEarned,
} from './quest-helpers';

/**
 * Declaring the constants
 *
 * Progression (PRD §2.9, §4.7, §4.8): achievements and titles are evaluated inside the command that moves their counters and
 * inserted against natural keys, so a grant lands once at its threshold and is never taken back; cosmetics are bought with
 * coins through the hero ledger and equipped one per kind. Catalogue numbers come from `rules/achievement.ts`,
 * `rules/title.ts` and `progression/cosmetic.catalogue.ts`.
 */

function purchase(cosmeticId: string): CommandSpec {
  return { type: 'cosmetic.purchase', payload: { cosmeticId } };
}

async function earnedIds(read: Promise<{ id: string }[]>): Promise<string[]> {
  return (await read).map(row => row.id);
}

test.describe('memoir progression', () => {
  test.describe('achievements and titles', () => {
    test('should grant the first-completion and bronze-streak achievements exactly at their thresholds, once each, and never revoke them', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'prog-streak');
      const today = localToday();
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -2) });
      const complete = (id: string, date: string): CommandSpec => ({ type: 'quest.complete', payload: occurrenceOf(id, date) });

      expectApplied(await submitSpec(subject.ctx, complete(questId, addDays(today, -2))));
      expect(await earnedIds(achievementsEarned(subject.accountId))).toEqual(['first_quest_completed']);
      expect((await submitSpec(subject.ctx, complete(questId, addDays(today, -1)))).result).toMatchObject({ streak: { currentDays: 2 } });
      expect(await earnedIds(achievementsEarned(subject.accountId)), 'a two-day run is one short of bronze').toEqual(['first_quest_completed']);

      const third = complete(questId, today);
      const bronze = await submitSpec(subject.ctx, third);
      expect(bronze.result).toMatchObject({ streak: { currentDays: 3 }, milestone: 'bronze' });
      const granted = await achievementsEarned(subject.accountId);
      expect(granted.map(row => row.id)).toEqual(['first_bronze_streak', 'first_quest_completed']);

      expect(await replayCommand(subject.ctx, bronze, third)).toMatchObject({ status: 'applied', replayed: true });
      const reset = await memoirDb()`
        UPDATE progress_counters SET counters = jsonb_set(jsonb_set(counters, '{counters,longestStreakDays}', '0'), '{counters,questsCompleted}', '0')
        WHERE account_id = ${subject.accountId}::bigint
      `;
      expect(reset.count).toBe(1);
      const otherId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      expectApplied(await submitSpec(subject.ctx, complete(otherId, today)));

      expect(await achievementsEarned(subject.accountId), 'a grant survives its predicate no longer holding, and is not re-inserted').toEqual(granted);
      expect(await achievementUnlockEvents(subject.accountId)).toEqual(['first_bronze_streak', 'first_quest_completed']);
    });

    test('should grant the rolling-window Honest Planner title on the tenth reason-tagged reschedule within 90 days, and keep it once the window empties', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'prog-honest-planner');
      const today = localToday();
      const seededId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -120) });
      const questId = await createQuest(subject.ctx, { strictness: 'routine', startDate: addDays(today, -3) });
      const laterId = await createQuest(subject.ctx, { strictness: 'routine', startDate: today });
      await seedRescheduleEvents(
        subject.accountId,
        seededId,
        [10, 20, 30, 40, 50, 60, 70, 80].map(days => addDays(today, -days)),
        'schedule_conflict',
      );
      await seedRescheduleEvents(
        subject.accountId,
        seededId,
        [91, 95, 100].map(days => addDays(today, -days)),
        'schedule_conflict',
      );
      await seedRescheduleEvents(subject.accountId, seededId, [addDays(today, -5)], null);
      const reschedule = (id: string, date: string): Promise<CommandOutcome> =>
        submitCommand(subject.ctx, 'quest.reschedule', { ...occurrenceOf(id, date), toMin: 600, reasonTag: 'schedule_conflict' });

      /* Yesterday's window starts 90 days back, so it holds the eight tagged seeds and this one; the untagged seed never counts. */
      expectApplied(await reschedule(questId, addDays(today, -1)));
      expect(await titlesEarned(subject.accountId)).toEqual([]);
      expectApplied(await reschedule(questId, today));
      const granted = await titlesEarned(subject.accountId);
      expect(granted.map(row => row.id)).toEqual(['honest_planner']);

      await memoirDb()`DELETE FROM reschedule_events WHERE account_id = ${subject.accountId}::bigint AND quest_id = ${seededId}::bigint`;
      expectApplied(await reschedule(laterId, today));
      expect(await titlesEarned(subject.accountId), 'three tagged reschedules left in the window, and the title stays').toEqual(granted);
    });

    test('should grant the cross-stat title when the last of the four stats reaches 30, not one tick before', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'prog-cross-stat');
      const today = localToday();
      await setStats(subject.accountId, { discipline: 30, body: 30, wealth: 30, mind: 28 });
      const created = await submitCommand(subject.ctx, 'quest.create', { ...questDraft({ strictness: 'routine', startDate: addDays(today, -1) }), statAffinity: 'mind' });
      expectApplied(created);
      const questId = String(created.result['id']);

      expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, addDays(today, -1))));
      expect(await titlesEarned(subject.accountId), 'mind at 29').toEqual([]);
      expect(await earnedIds(achievementsEarned(subject.accountId))).toContain('all_stats_touched');

      expectApplied(await submitCommand(subject.ctx, 'quest.complete', occurrenceOf(questId, today)));
      expect(await earnedIds(titlesEarned(subject.accountId))).toEqual(['cross_stat_climber']);
    });
  });

  test.describe('cosmetics', () => {
    test('should charge a cosmetic’s exact price once across replays and concurrent submissions, and refuse achievement-only, unknown and unaffordable ones', async ({
      memoir,
    }) => {
      const subject = await rolloverSubject(memoir, 'prog-purchase');
      const coins = async (): Promise<number> => (await rolloverAccount(subject.accountId)).coins;
      await setCoins(subject.accountId, 210);

      const bronze = purchase('badge_bronze');
      const bought = await submitSpec(subject.ctx, bronze);
      expect(bought).toMatchObject({ status: 'applied', result: { cosmeticId: 'badge_bronze', unlocked: true, charged: true, coinsSpent: 50 } });
      expect(await coins()).toBe(160);
      expect(await replayCommand(subject.ctx, bought, bronze)).toMatchObject({ status: 'applied', replayed: true, result: bought.result });
      expect(await submitSpec(subject.ctx, bronze), 'owning it already').toMatchObject({ status: 'superseded', result: { unlocked: true, charged: false } });
      expect(await coins()).toBe(160);

      expectFailed(await submitSpec(subject.ctx, purchase('badge_gold_streak')), 'CSM_004');
      expectFailed(await submitSpec(subject.ctx, purchase('badge_e2e_unknown')), 'CSM_002');

      const racers = await raceCommands(subject.ctx, subject.accountId, [purchase('badge_silver'), purchase('badge_silver')]);
      expect(racers.map(outcome => outcome.status).sort()).toEqual(['applied', 'superseded']);
      expect(racers.find(outcome => outcome.status === 'superseded')?.result).toMatchObject({ charged: false });
      expect(await coins()).toBe(10);

      expectFailed(await submitSpec(subject.ctx, purchase('accent_ember')), 'HRO_001');
      expect(await coins()).toBe(10);
      expect((await heroEvents(subject.accountId, ['coin_spend'])).map(event => event.coinsDelta)).toEqual([-50, -150]);
      expect(await cosmeticUnlocks(subject.accountId)).toEqual([
        { cosmeticId: 'badge_bronze', kind: 'badge', source: 'coin', equipped: false },
        { cosmeticId: 'badge_silver', kind: 'badge', source: 'coin', equipped: false },
      ]);

      await setCoins(subject.accountId, 100);
      expect(await submitSpec(subject.ctx, purchase('accent_ember'))).toMatchObject({ status: 'applied', result: { coinsSpent: 100 } });
      expect(await coins()).toBe(0);
    });

    test('should keep exactly one equipped cosmetic per kind and refuse equipping one never unlocked', async ({ memoir }) => {
      const subject = await rolloverSubject(memoir, 'prog-equip');
      await setCoins(subject.accountId, 275);
      for (const cosmeticId of ['badge_bronze', 'badge_silver', 'theme_sunrise']) expectApplied(await submitSpec(subject.ctx, purchase(cosmeticId)));
      const equip = (cosmeticId: string): Promise<CommandOutcome> => submitCommand(subject.ctx, 'cosmetic.equip', { cosmeticId });
      const equipped = async (): Promise<Record<string, boolean>> => Object.fromEntries((await cosmeticUnlocks(subject.accountId)).map(row => [row.cosmeticId, row.equipped]));

      expectFailed(await equip('accent_frost'), 'CSM_003');
      expectFailed(await equip('badge_e2e_unknown'), 'CSM_002');

      expect(await equip('badge_bronze')).toMatchObject({ status: 'applied', result: { cosmeticId: 'badge_bronze', kind: 'badge', equipped: true } });
      expectApplied(await equip('theme_sunrise'));
      expectApplied(await equip('badge_silver'));
      expect(await equipped()).toEqual({ badge_bronze: false, badge_silver: true, theme_sunrise: true });

      expectApplied(await equip('badge_bronze'));
      expect(await equipped()).toEqual({ badge_bronze: true, badge_silver: false, theme_sunrise: true });
    });
  });

  test('should display only an earned title and clear it with null', async ({ memoir }) => {
    const subject = await rolloverSubject(memoir, 'prog-title');
    const display = (titleId: string | null): Promise<CommandOutcome> => submitCommand(subject.ctx, 'title.display', { titleId });

    expectFailed(await display('quiet_year'), 'TTL_001');
    expect(await displayedTitle(subject.accountId)).toBeNull();

    await memoirDb()`INSERT INTO titles_earned (account_id, title_id) VALUES (${subject.accountId}::bigint, 'returner')`;
    expect(await display('returner')).toMatchObject({ status: 'applied', result: { displayedTitleId: 'returner' } });
    expect((await getAccount(subject.ctx)).displayedTitleId).toBe('returner');

    expectFailed(await display('quiet_year'), 'TTL_001');
    expect(await displayedTitle(subject.accountId), 'a refused display leaves the current one').toBe('returner');

    expect(await display(null)).toMatchObject({ status: 'applied', result: { displayedTitleId: null } });
    expect(await displayedTitle(subject.accountId)).toBeNull();
  });
});

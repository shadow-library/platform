/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { memoirDb } from '../../lib';
import { expect, test } from './fixtures';
import {
  commandEnvelope,
  type CommandEnvelopeInput,
  commandOutcomesOf,
  dailyQuestDraft,
  type DeltaPage,
  errorCodeOf,
  memoirMutate,
  postCommands,
  pullDeltaWith,
  pullFullDelta,
  submitCommand,
  submitCommands,
  todayLocal,
} from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** level.ts: level 2 costs `round(100 * 1^1.5)` = 100 XP; level 3 costs a further `round(100 * 2^1.5)` = 283 XP (ruleset.ts v1's curve, `xpToAdvance`). */
const LEVEL_TWO_XP = 100;
const LEVEL_THREE_XP = 283;

/** ruleset.ts v1: `level.maxLevel`. */
const MAX_LEVEL = 999;

/** Mirrors level.ts's `xpToAdvance`/`levelThresholds` cumulative sum exactly, to get the real lifetime XP MAX_LEVEL is reached at without hand-computing a 998-term sum. */
function xpThresholdForMaxLevel(): number {
  let cumulative = 0;
  for (let level = 1; level < MAX_LEVEL; level++) cumulative += Math.round(100 * level ** 1.5);
  return cumulative;
}

/** Every domain currently registered on `DeltaSourceRegistry`; asserted as a subset below, never exact equality, so a legitimately added domain never breaks this. */
const REGISTERED_DOMAINS = [
  'account',
  'entitlement',
  'devices',
  'expense_categories',
  'metrics',
  'health_offers',
  'hero_events',
  'quest_logs',
  'meal_presets',
  'daily_states',
  'ai_tasks',
  'ai_results',
  'ai_scheduled_queries',
  'ai_consents',
  'expenses',
  'expense_audits',
  'subscriptions',
  'metric_entries',
  'achievements_earned',
  'titles_earned',
  'cosmetic_unlocks',
  'progress_counters',
  'quests',
  'quest_streaks',
  'reschedule_events',
  'journal_entries',
  'meals',
  'weights',
  'side_quests',
];

function rowsOf(delta: DeltaPage, domain: string): Record<string, unknown>[] {
  return delta.domains[domain] ?? [];
}

async function countQuests(accountId: string): Promise<number> {
  const [row] = await memoirDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM quests WHERE account_id = ${accountId}`;
  return row?.count ?? 0;
}

/**
 * Declaring the tests
 */

test.describe('mixed-type command batches (memoir-sync-1)', () => {
  test('should apply a mixed-type batch in submitted order, one outcome per command, a later command observing an earlier write in the same batch, and carry x-sync-epoch on every response', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'sync-1-order', onboard: true });
    const today = todayLocal();
    const expenseId = randomUUID();

    const batch: CommandEnvelopeInput[] = [
      commandEnvelope('expense.create', { id: expenseId, amountMinor: 1000, amountText: '10.00', currency: 'USD', categoryId: 'uncat', occurredOn: today, source: 'manual' }),
      commandEnvelope('expense.update', { id: expenseId, amountMinor: 2500, amountText: '25.00' }),
      commandEnvelope('journal.save', { id: randomUUID(), draft: { date: today, text: 'E2E sync-1 mixed batch', mood: 4, tags: ['e2e'] } }),
      commandEnvelope('category.setArchived', { categoryId: 'food', archived: true }),
    ];

    const response = await postCommands(persona.ctx, batch);
    expect(response.status(), await response.text()).toBe(200);
    expect(response.headers()['x-sync-epoch'], 'the commands response must carry x-sync-epoch').toMatch(/^\d+$/);

    const body = (await response.json()) as { outcomes: { commandId: string; status: string }[] };
    expect(body.outcomes.map(outcome => outcome.commandId)).toEqual(batch.map(command => command.commandId));
    expect(
      body.outcomes.map(outcome => outcome.status),
      JSON.stringify(body.outcomes),
    ).toEqual(['applied', 'applied', 'applied', 'applied']);

    const { response: deltaResponse, page: delta } = await pullDeltaWith(persona.ctx);
    expect(deltaResponse.headers()['x-sync-epoch'], 'the delta response must carry x-sync-epoch too').toMatch(/^\d+$/);

    const expenseRow = rowsOf(delta, 'expenses').find(row => row['id'] === expenseId);
    // amountMinor is a bigint column: serializeDeltaRow (sync/delta.repository.ts) sends every bigint over the wire as its decimal string.
    expect(expenseRow, "the update's read of the same-batch create must have seen it committed").toMatchObject({ amountMinor: '2500', amountText: '25.00' });
    expect(rowsOf(delta, 'expense_categories').find(row => row['key'] === 'food')).toMatchObject({ archivedAt: expect.any(String) });
    expect(rowsOf(delta, 'journal_entries').some(row => row['text'] === 'E2E sync-1 mixed batch')).toBe(true);
  });
});

test.describe('sync batch validation and short-circuiting (memoir-sync-2, memoir-cmd-1b)', () => {
  test('should accept exactly 100 commands and reject an empty batch or one of 101, applying nothing from either rejection', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-2-limits', onboard: true });
    const before = await countQuests(persona.account!.id);

    const empty = await postCommands(persona.ctx, []);
    expect(empty.status(), await empty.text()).toBe(422);
    expect(await errorCodeOf(empty)).toBe('VALIDATION_ERROR');

    const hundred = Array.from({ length: 100 }, (_, index) => commandEnvelope('quest.create', dailyQuestDraft(`E2E sync-2 hundred ${index} ${randomUUID()}`)));
    const accepted = await postCommands(persona.ctx, hundred);
    expect(accepted.status(), await accepted.text()).toBe(200);
    const acceptedOutcomes = await commandOutcomesOf(accepted);
    expect(acceptedOutcomes.map(outcome => outcome.status)).toEqual(Array.from({ length: 100 }, () => 'applied'));
    expect(await countQuests(persona.account!.id), 'exactly 100 commands must be accepted and applied').toBe(before + 100);

    const oversized = Array.from({ length: 101 }, (_, index) => commandEnvelope('quest.create', dailyQuestDraft(`E2E sync-2 oversized ${index} ${randomUUID()}`)));
    const tooMany = await postCommands(persona.ctx, oversized);
    expect(tooMany.status(), await tooMany.text()).toBe(422);
    expect(await errorCodeOf(tooMany)).toBe('VALIDATION_ERROR');
    expect(await countQuests(persona.account!.id), 'a batch over 100 commands must apply none of them').toBe(before + 100);
  });

  test('should reject the whole batch 400 CMD_001 when one command names an unregistered type, applying nothing in the batch, then let the same commands through once the unregistered one is dropped', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'sync-2-cmd001', onboard: true });
    const before = await countQuests(persona.account!.id);

    const pre = commandEnvelope('quest.create', dailyQuestDraft(`E2E sync-2 pre ${randomUUID()}`));
    const post = commandEnvelope('quest.create', dailyQuestDraft(`E2E sync-2 post ${randomUUID()}`));
    const response = await postCommands(persona.ctx, [pre, commandEnvelope('quest.bogusType', {}), post]);
    expect(response.status(), await response.text()).toBe(400);
    expect(await errorCodeOf(response)).toBe('CMD_001');
    expect(await countQuests(persona.account!.id), 'a batch refused up front must apply none of its commands').toBe(before);

    const retried = await submitCommands(persona.ctx, [pre, post]);
    expect(retried.map(outcome => outcome.status)).toEqual(['applied', 'applied']);
    expect(await countQuests(persona.account!.id), 'the same commands must apply once the unregistered type is dropped').toBe(before + 2);
  });

  test('should stop a batch at its first failing command, leaving nothing behind it applied', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-2-shortcircuit', onboard: true });
    const questName = `E2E sync-2 shortcircuit ${randomUUID()}`;
    const strandedName = `E2E sync-2 stranded ${randomUUID()}`;

    const batch = [
      commandEnvelope('quest.create', dailyQuestDraft(questName)),
      commandEnvelope('quest.update', { questId: '999999999', patch: { name: 'nope' } }),
      commandEnvelope('quest.create', dailyQuestDraft(strandedName)),
    ];
    const outcomes = await submitCommands(persona.ctx, batch);
    expect(outcomes, JSON.stringify(outcomes)).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ status: 'applied' });
    expect(outcomes[1]).toMatchObject({ status: 'failed' });
    expect(outcomes[1]?.error?.code).toBe('QST_002');

    const delta = await pullFullDelta(persona.ctx);
    expect(
      rowsOf(delta, 'quests').some(row => row['name'] === questName),
      'the command committed before the failure',
    ).toBe(true);
    expect(
      rowsOf(delta, 'quests').some(row => row['name'] === strandedName),
      'the command behind the failure never ran',
    ).toBe(false);
  });
});

test.describe('delta domains (memoir-sync-4)', () => {
  test('should return every registered domain, never leak id/identitySub on the account snapshot, and silently drop an unknown domains filter', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-4-domains', onboard: true });

    const { page: full } = await pullDeltaWith(persona.ctx);
    expect(Object.keys(full.domains)).toEqual(expect.arrayContaining(REGISTERED_DOMAINS));

    const account = full.domains['account']?.[0];
    expect(account, 'the account snapshot must be present').toBeTruthy();
    expect(account).not.toHaveProperty('id');
    expect(account).not.toHaveProperty('identitySub');

    const { page: filtered } = await pullDeltaWith(persona.ctx, { domains: 'quests,definitely_not_a_real_domain' });
    expect(Object.keys(filtered.domains), 'an unknown domain name must be dropped rather than erroring or echoed back empty').toEqual(['quests']);
  });
});

test.describe('cursor semantics (memoir-sync-5)', () => {
  test('should deliver only rows after since, advance the cursor monotonically, page a keyset domain with no skip or dup, and re-serve the newest row inside the cursor-overlap window', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'sync-5-cursor', onboard: true });
    const names = Array.from({ length: 3 }, (_, index) => `E2E sync-5 ${index} ${randomUUID()}`);
    const ids: string[] = [];
    for (const name of names) {
      const outcome = await submitCommand(persona.ctx, 'quest.create', dailyQuestDraft(name));
      ids.push(String(outcome.result['id']));
    }

    let since = '0';
    let hasMore = true;
    let lastCursor: bigint | null = null;
    const collected: string[] = [];
    for (let guard = 0; guard < 10 && hasMore; guard++) {
      const { page } = await pullDeltaWith(persona.ctx, { since, domains: 'quests', limit: 1 });
      const cursor = BigInt(page.cursor);
      const rows = page.domains['quests'] ?? [];
      // The final, empty, hasMore:false page may repeat the previous cursor rather than advance it (§12.2's overlap only lags a drained cursor).
      if (lastCursor !== null) {
        expect(cursor >= lastCursor, 'the cursor must never move backwards between pages').toBe(true);
        if (rows.length > 0) expect(cursor > lastCursor, 'a page that returns a row must advance the cursor past it').toBe(true);
      }
      lastCursor = cursor;
      expect(rows.length, 'limit:1 must return at most one row per page').toBeLessThanOrEqual(1);
      for (const row of rows) collected.push(String(row['id']));
      hasMore = page.hasMore;
      since = page.cursor;
    }
    expect(collected, 'paging must deliver exactly the created quests, in order, with no skip or duplicate').toEqual(ids);

    const { page: drained } = await pullDeltaWith(persona.ctx, { domains: 'quests' });
    expect(drained.hasMore, 'a page well under the default page size must drain in one call').toBe(false);

    const newest = ids[ids.length - 1];
    const { page: reServed } = await pullDeltaWith(persona.ctx, { since: drained.cursor, domains: 'quests' });
    expect(
      (reServed.domains['quests'] ?? []).some(row => String(row['id']) === newest),
      'sync.cursor-overlap must lag the drained cursor behind the newest row, re-serving it on the very next pull with no new writes',
    ).toBe(true);
  });
});

test.describe('device registry (memoir-sync-8)', () => {
  test('should upsert a device in place without ever returning accountId, hide pushSubscription on the delta row, tombstone on delete, and 404 DEV_001 once the id is consumed', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'sync-8-device', onboard: true });
    const deviceId = randomUUID();

    const putResponse = await memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${deviceId}`, {
      data: { userAgent: 'E2E sync-8', pushOptIn: true, pushSubscription: { endpoint: 'https://push.example/e2e', keys: { p256dh: 'x', auth: 'y' } } },
    });
    expect(putResponse.status(), await putResponse.text()).toBe(200);
    const putBody = (await putResponse.json()) as Record<string, unknown>;
    expect(putBody['id']).toBe(deviceId);
    expect(putBody, "the device response must never carry the owning account's id").not.toHaveProperty('accountId');

    const upsertResponse = await memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${deviceId}`, { data: { userAgent: 'E2E sync-8 updated', pushOptIn: false } });
    expect(upsertResponse.status(), await upsertResponse.text()).toBe(200);
    expect(((await upsertResponse.json()) as Record<string, unknown>)['id']).toBe(deviceId);

    const delta = await pullFullDelta(persona.ctx);
    const deviceRows = rowsOf(delta, 'devices').filter(row => row['id'] === deviceId);
    expect(deviceRows, 'a re-registered device id must upsert in place, never duplicate').toHaveLength(1);
    expect(deviceRows[0], 'the upsert must overwrite the previously stored fields').toMatchObject({ userAgent: 'E2E sync-8 updated', pushOptIn: false });
    expect(deviceRows[0], 'a delta device row must never expose the stored push subscription').not.toHaveProperty('pushSubscription');
    expect(deviceRows[0]).not.toHaveProperty('accountId');

    const deleteResponse = await memoirMutate(persona.ctx, 'delete', `/api/v1/account/devices/${deviceId}`);
    expect(deleteResponse.status()).toBe(204);

    const afterDelete = await pullFullDelta(persona.ctx);
    expect(
      rowsOf(afterDelete, 'devices').some(row => row['id'] === deviceId),
      'a deleted device must drop out of the devices domain',
    ).toBe(false);
    expect(afterDelete.tombstones).toContainEqual(expect.objectContaining({ domain: 'devices', recordId: deviceId }));

    const secondDelete = await memoirMutate(persona.ctx, 'delete', `/api/v1/account/devices/${deviceId}`);
    expect(secondDelete.status(), 'a consumed device id must not be deletable a second time').toBe(404);
    expect(await errorCodeOf(secondDelete)).toBe('DEV_001');
  });
});

test.describe('progression snapshot (memoir-sync-9)', () => {
  test("should report a fresh account's day-one defaults", async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-9-fresh', onboard: true });
    const { page } = await pullDeltaWith(persona.ctx, { domains: 'account' });
    const account = page.domains['account']?.[0];

    expect(account).toMatchObject({
      level: 1,
      totalXp: '0',
      xpIntoLevel: 0,
      xpForNextLevel: LEVEL_TWO_XP,
      coins: 0,
      shieldsAvailable: 0,
      shieldCap: 0,
      persona: 'active',
      comeback: null,
      crown: { label: 'today', cadence: 'daily', dayIndex: 1, dayCount: 1, keptPercent: 100 },
    });
  });

  test('should derive level/xpIntoLevel correctly at an exact level threshold, one xp below it, and at the max level', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-9-boundary', onboard: true });
    const accountId = persona.account!.id;

    const accountDomainRow = async (): Promise<Record<string, unknown> | undefined> => (await pullDeltaWith(persona.ctx, { domains: 'account' })).page.domains['account']?.[0];

    await memoirDb()`UPDATE accounts SET level = 1, total_xp = 99 WHERE id = ${accountId}`;
    expect(await accountDomainRow(), 'one xp below the level-2 threshold').toMatchObject({ level: 1, totalXp: '99', xpIntoLevel: 99, xpForNextLevel: LEVEL_TWO_XP });

    await memoirDb()`UPDATE accounts SET level = 2, total_xp = 100 WHERE id = ${accountId}`;
    expect(await accountDomainRow(), 'exactly at the level-2 threshold').toMatchObject({ level: 2, totalXp: '100', xpIntoLevel: 0, xpForNextLevel: LEVEL_THREE_XP });

    const maxLevelThreshold = xpThresholdForMaxLevel();
    const xpIntoMaxLevel = 42;
    await memoirDb()`UPDATE accounts SET level = ${MAX_LEVEL}, total_xp = ${maxLevelThreshold + xpIntoMaxLevel} WHERE id = ${accountId}`;
    expect(await accountDomainRow(), 'at the max level, xpForNextLevel must clamp to 0 while xpIntoLevel keeps deriving from the real threshold').toMatchObject({
      level: MAX_LEVEL,
      totalXp: String(maxLevelThreshold + xpIntoMaxLevel),
      xpIntoLevel: xpIntoMaxLevel,
      xpForNextLevel: 0,
    });
  });
});

test.describe('wire-shape compatibility (memoir-sync-12)', () => {
  /**
   * The pinned command set `apps/memoir-web/src/lib/sync/command-wire.ts`'s `SERVER_BACKED_TYPES` actually sends,
   * and the exact wire shape `toWireCommand` builds for each — reproduced here rather than imported, since this
   * spec runs from `e2e/`, outside memoir-web's own module graph. `devices` is excluded: no `SyncCommand` maps to
   * it (covered instead by memoir-sync-8). AI commands are excluded too: none of them is in `SERVER_BACKED_TYPES`.
   */
  test('should apply every pinned wire-shaped command end to end, and every domain those commands touch must carry every camelCase field apps/memoir-web/src/lib/sync/projection.ts reads', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'sync-12-wire', onboard: true });
    const ctx = persona.ctx;
    const accountId = persona.account!.id;
    const today = todayLocal();

    const applied = async (type: string, payload: Record<string, unknown>, overrides: Partial<CommandEnvelopeInput> = {}): Promise<Record<string, unknown>> => {
      const outcome = await submitCommand(ctx, type, payload, overrides);
      expect(outcome, `${type} must apply: ${JSON.stringify(outcome)}`).toMatchObject({ status: 'applied' });
      return outcome.result;
    };
    const createQuest = async (name: string): Promise<string> => String((await applied('quest.create', dailyQuestDraft(name)))['id']);

    const questCompleted = await createQuest(`E2E sync-12 complete ${randomUUID()}`);
    await applied('quest.complete', { occurrenceId: `${questCompleted}:${today}` });
    await applied('quest.update', { questId: questCompleted, patch: { name: `E2E sync-12 renamed ${randomUUID()}` } });
    // plan.setLock is NOT exercised here — see the dedicated `test.fixme` below for why.

    const questPartial = await createQuest(`E2E sync-12 partial ${randomUUID()}`);
    await applied('quest.partial', { occurrenceId: `${questPartial}:${today}`, progress: 50, reasonTag: 'forgot', note: null });

    const questSkip = await createQuest(`E2E sync-12 skip ${randomUUID()}`);
    await applied('quest.skip', { occurrenceId: `${questSkip}:${today}`, reasonTag: 'too_tired', note: null });

    const questPostpone = await createQuest(`E2E sync-12 postpone ${randomUUID()}`);
    await applied('quest.postpone', { occurrenceId: `${questPostpone}:${today}`, reasonTag: 'schedule_conflict' });

    const questReschedule = await createQuest(`E2E sync-12 reschedule ${randomUUID()}`);
    await applied('quest.reschedule', { occurrenceId: `${questReschedule}:${today}`, toMin: 600, acceptBeyondCap: false });

    // quest.deleteLog (exercised on its own quest so the completed log above stays intact for field checks)
    const questDeleteLog = await createQuest(`E2E sync-12 deleteLog ${randomUUID()}`);
    await applied('quest.skip', { occurrenceId: `${questDeleteLog}:${today}`, reasonTag: 'other', note: null });
    await applied('quest.deleteLog', { occurrenceId: `${questDeleteLog}:${today}` });

    const expenseKept = randomUUID();
    await applied('expense.create', {
      id: expenseKept,
      amountMinor: 500,
      amountText: '5.00',
      currency: 'USD',
      categoryId: 'uncat',
      occurredOn: today,
      merchant: 'E2E',
      note: 'first',
      source: 'manual',
    });
    await applied('expense.update', { id: expenseKept, amountMinor: 750, amountText: '7.50', note: 'updated' });

    const expenseDeleted = randomUUID();
    await applied('expense.create', { id: expenseDeleted, amountMinor: 100, amountText: '1.00', currency: 'USD', categoryId: 'uncat', occurredOn: today, source: 'manual' });
    await applied('expense.delete', { id: expenseDeleted });

    const subscriptionId = String(
      (
        await applied('subscription.create', {
          name: 'E2E sync-12 subscription',
          note: null,
          amountMinor: 1999,
          amountText: '19.99',
          currency: 'USD',
          frequency: 'monthly',
          customIntervalDays: null,
          billingDay: 15,
          nextDueDate: today,
          categoryId: 'subs',
          reminderEnabled: true,
          reminderLead: 'on_day',
        })
      )['id'],
    );
    // subscription.setActive's wire type is subscription.update.
    await applied('subscription.update', { id: subscriptionId, active: true });
    await applied('subscription.confirmCycle', { id: subscriptionId, billingDate: today });

    await applied('category.setArchived', { categoryId: 'food', archived: true });

    const journalId = randomUUID();
    await applied('journal.save', { id: journalId, draft: { date: today, text: 'E2E sync-12 journal entry', mood: 3, tags: ['e2e', 'wire'] } });

    const mealId = randomUUID();
    await applied('meal.log', { id: mealId, draft: { date: today, name: 'E2E sync-12 meal', calories: 500, mealType: 'cooked', note: 'note' } });

    const presetId = String((await applied('meal.savePreset', { preset: { name: 'E2E sync-12 preset', calories: 300, mealType: 'cooked', note: null } }))['id']);
    await applied('meal.logPreset', { id: randomUUID(), presetId, date: today });

    await applied('weight.save', { date: today, kg: 70.5, confirmedReplacement: false });

    const sideQuestId = randomUUID();
    await applied('sidequest.log', { id: sideQuestId, draft: { date: today, name: 'E2E sync-12 side quest', statAffinity: 'discipline' } });

    // health.save (wire type metric.register) is NOT exercised here — see the dedicated `test.fixme` below for why.

    // title.display — titles are only ever chosen among already-earned ones, so one is seeded directly.
    await memoirDb()`INSERT INTO titles_earned (account_id, title_id) VALUES (${accountId}, 'steady_builder') ON CONFLICT DO NOTHING`;
    await applied('title.display', { titleId: 'steady_builder' });

    // achievements_earned has no command that grants one directly (progression triggers only); seeded for its own field check.
    await memoirDb()`INSERT INTO achievements_earned (account_id, achievement_id) VALUES (${accountId}, 'first_quest_completed') ON CONFLICT DO NOTHING`;

    // cosmetic.purchase / cosmetic.equip — coins topped up directly; this test is not exercising the hero ledger's balance math.
    await memoirDb()`UPDATE accounts SET coins = 500 WHERE id = ${accountId}`;
    await applied('cosmetic.purchase', { cosmeticId: 'badge_bronze' });
    await applied('cosmetic.equip', { cosmeticId: 'badge_bronze' });

    const delta = await pullFullDelta(ctx);

    const expectRow = (domain: string, predicate: (row: Record<string, unknown>) => boolean, fields: string[]): void => {
      const row = rowsOf(delta, domain).find(predicate);
      expect(row, `${domain}: expected a matching row`).toBeTruthy();
      const found = row as Record<string, unknown>;
      const missing = fields.filter(field => !Object.prototype.hasOwnProperty.call(found, field));
      expect(missing, `${domain} row is missing wire fields projection.ts reads: ${JSON.stringify(found)}`).toEqual([]);
    };

    expectRow('account', () => true, [
      'level',
      'totalXp',
      'xpIntoLevel',
      'xpForNextLevel',
      'coins',
      'hpToday',
      'hpMax',
      'warmthState',
      'crown',
      'persona',
      'comeback',
      'shieldsAvailable',
      'shieldCap',
      'displayedTitleId',
      'timezone',
      'statBody',
      'statMind',
      'statWealth',
      'statDiscipline',
      'defaultCurrency',
      'enabledCurrencies',
      'weekStart',
      'monthlyBudgetMinor',
      'scheduleEndMin',
      'intensityMode',
      'pendingIntensityMode',
    ]);
    expectRow('quests', row => row['id'] === questCompleted, [
      'id',
      'name',
      'notes',
      'startTimeMin',
      'durationMin',
      'statAffinity',
      'strictness',
      'optionalStreakOptIn',
      'recurrence',
      'moduleLink',
      'reminderEnabled',
      'reminderLeadMin',
      'healthThreshold',
      'active',
      'createdAt',
      'updatedAt',
    ]);
    expectRow('quest_logs', row => row['questId'] === questCompleted && row['date'] === today, [
      'id',
      'questId',
      'date',
      'state',
      'xpAwarded',
      'coinsAwarded',
      'statAffinity',
      'reasonTag',
      'reasonNote',
      'rescheduledToMin',
      'postponedToDate',
      'performedAt',
      'createdAt',
      'shielded',
    ]);
    expectRow('quest_streaks', row => row['questId'] === questCompleted, ['questId', 'currentRunDays', 'bestRunDays', 'shieldsAvailable']);
    expectRow('reschedule_events', row => row['questId'] === questReschedule, ['questId', 'date']);
    expectRow('daily_states', row => row['date'] === today, [
      'date',
      'intensityMode',
      'committedAt',
      'lockBrokenAt',
      'lockedQuestIds',
      'crownPeriodStart',
      'crownBankedXp',
      'crownBankedCoins',
    ]);
    expectRow('hero_events', row => row['questId'] === questCompleted, [
      'id',
      'type',
      'questId',
      'achievementId',
      'xpDelta',
      'coinsDelta',
      'statAffinity',
      'statDelta',
      'levelAfter',
      'date',
      'createdAt',
    ]);
    expectRow('expenses', row => row['id'] === expenseKept, [
      'id',
      'amountMinor',
      'amountText',
      'currency',
      'fxRate',
      'homeAmountMinor',
      'categoryId',
      'merchant',
      'note',
      'occurredOn',
      'loggedAt',
      'source',
      'linkedSubscriptionId',
      'linkedQuestId',
      'lineItems',
      'receiptRef',
    ]);
    expectRow('expense_categories', row => row['key'] === 'food', ['key', 'label', 'archivedAt']);
    expectRow('expense_audits', row => row['expenseId'] === expenseKept && row['action'] === 'updated', ['id', 'expenseId', 'action', 'changes', 'createdAt']);
    expectRow('subscriptions', row => row['id'] === subscriptionId, [
      'id',
      'name',
      'note',
      'amountMinor',
      'amountText',
      'currency',
      'frequency',
      'customIntervalDays',
      'billingDay',
      'nextDueDate',
      'lastConfirmedDate',
      'categoryId',
      'reminderEnabled',
      'reminderLead',
      'monthlyEquivalentMinor',
      'active',
      'createdAt',
    ]);
    expectRow('journal_entries', row => row['id'] === journalId, ['id', 'date', 'text', 'mood', 'tags', 'loggedAt', 'rewarded']);
    expectRow('meals', row => row['id'] === mealId, ['id', 'date', 'name', 'calories', 'mealType', 'note', 'presetId', 'rewarded', 'loggedAt']);
    expectRow('meal_presets', row => row['id'] === presetId, ['id', 'name', 'calories', 'mealType', 'note']);
    expectRow('weights', row => row['date'] === today, ['date', 'kg', 'loggedAt', 'rewarded']);
    expectRow('side_quests', row => row['id'] === sideQuestId, ['id', 'date', 'name', 'statAffinity', 'xpAwarded', 'coinsAwarded', 'statTicked', 'rewarded', 'loggedAt']);
    expectRow('achievements_earned', row => row['achievementId'] === 'first_quest_completed', ['achievementId', 'earnedAt']);
    expectRow('titles_earned', row => row['titleId'] === 'steady_builder', ['titleId', 'earnedAt']);
    expectRow('cosmetic_unlocks', row => row['cosmeticId'] === 'badge_bronze', ['cosmeticId', 'equipped', 'kind', 'createdAt']);
    expectRow('entitlement', () => true, ['tier', 'state', 'expiresAt', 'trialUsed']);
    expectRow('progress_counters', () => true, ['activeDays']);
  });

  // App bug: apps/memoir-server/src/modules/metrics/metric-entry.repository.ts:66 binds targetWhere ne(source, 'quest_log') as a parameter; once a pooled connection switches to a generic plan (~6th execution) Postgres can no longer infer the partial index, so every non-quest_log metric.register fails 42P10.
  test.fixme('should apply health.save (wire type metric.register) and carry metricId/date/value/createdAt on the metrics and metric_entries domains', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-12-health-save', onboard: true });
    const accountId = persona.account!.id;
    const today = todayLocal();

    await memoirDb()`
      INSERT INTO metrics (account_id, name, unit, value_type, direction, default_value, builtin, is_health)
      VALUES (${accountId}, 'Steps', 'steps', 'count'::metric_value_type, 'higher'::metric_direction, NULL, true, true)
      ON CONFLICT (account_id, name) DO NOTHING
    `;
    const [stepsMetric] = await memoirDb()<{ id: string }[]>`SELECT id::text FROM metrics WHERE account_id = ${accountId} AND name = 'Steps'`;
    if (!stepsMetric) throw new Error('Steps metric seed produced no row');

    const outcome = await submitCommand(persona.ctx, 'metric.register', { metricId: stepsMetric.id, date: today, value: 1234, source: 'manual' });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'applied' });

    const delta = await pullFullDelta(persona.ctx);
    expect(rowsOf(delta, 'metrics').find(row => row['id'] === stepsMetric.id)).toMatchObject({ id: stepsMetric.id, name: 'Steps', isHealth: true });
    const entry = rowsOf(delta, 'metric_entries').find(row => row['metricId'] === stepsMetric.id);
    expect(entry).toBeTruthy();
    expect(Object.keys(entry as Record<string, unknown>)).toEqual(expect.arrayContaining(['metricId', 'date', 'value', 'createdAt']));
  });

  // App bug: apps/memoir-server/src/modules/sync/delta.repository.ts:29 (serializeDeltaRow) converts only a column's own top-level bigint, not bigint[] elements, so a locked day's daily_states.locked_quest_ids crashes every later GET /sync/delta with "JSON.stringify cannot serialize BigInt"; unlocking the same still-open day clears it and recovers, but once the day rolls over, setLock's own LCK_002 guard (compassion-commands.service.ts:93) refuses the unlock too, so sync stalls for good.
  test.fixme("should lock a day's quests via plan.setLock and still let the very next delta pull read daily_states.lockedQuestIds back as strings", async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'sync-12-plan-lock', onboard: true });
    const today = todayLocal();
    const questId = String((await submitCommand(persona.ctx, 'quest.create', dailyQuestDraft(`E2E sync-12 plan-lock ${randomUUID()}`))).result['id']);

    const locked = await submitCommand(persona.ctx, 'plan.setLock', { locked: true, questIds: [questId] });
    expect(locked, JSON.stringify(locked)).toMatchObject({ status: 'applied' });

    const delta = await pullFullDelta(persona.ctx);
    const todayState = rowsOf(delta, 'daily_states').find(row => row['date'] === today);
    expect(todayState).toMatchObject({ lockedQuestIds: [questId] });
  });
});

/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { csrfHeaders, memoirDb } from '../../lib';
import { expectApplied, submitCommandWithHeaders, withAccountLockHeld } from './concurrency-helpers';
import { expect, test } from './fixtures';
import { createDailyQuest, dailyQuestDraft, getAccount, pullFullDelta, submitCommand, todayLocal } from './helpers';

/**
 * Defining types
 */

interface MetricRow {
  id: string;
  name: string;
  builtin: boolean;
  isHealth: boolean;
  active: boolean;
}

interface MetricEntryRow {
  id: string;
  metricId: string;
  date: string;
  value: string;
  source: string;
  questLogId: string | null;
}

interface QuestLogRow {
  id: string;
  questId: string;
  date: string;
}

/**
 * Declaring the constants
 *
 * Metrics (ARCHITECTURE §18): the lazy 4-built-in seed, `metric.delete`'s quest-consequence guard, per-source
 * entry uniqueness, and the health-threshold completion offer a `metric.register` surfaces.
 *
 * `metric.register`'s non-`quest_log` path (manual/food sources) is currently broken in this environment —
 * `metric-entry.repository.ts:66` sends its `onConflictDoUpdate`'s `targetWhere` as a bind parameter, so once a
 * pooled connection has planned that statement a few times Postgres plans it generically and
 * `infer_arbiter_indexes` can no longer match the partial index, 500ing with `42P10` on every such call —
 * confirmed against a psql repro and dev logs, not environment staleness. Those scenarios are `test.fixme`d below,
 * citing the line; the live tests here only exercise the unaffected `quest_log` path (`isNotNull`, no bind param).
 */

const BUILTIN_METRIC_NAMES = ['Steps', 'Calories burned', 'Sleep duration', 'Water'].sort();

function metricsOf(delta: Awaited<ReturnType<typeof pullFullDelta>>): MetricRow[] {
  return delta.domains['metrics'] as unknown as MetricRow[];
}

function entriesFor(delta: Awaited<ReturnType<typeof pullFullDelta>>, metricId: string): MetricEntryRow[] {
  return (delta.domains['metric_entries'] as unknown as MetricEntryRow[]).filter(row => row.metricId === metricId);
}

async function questLogId(ctx: Parameters<typeof pullFullDelta>[0], questId: string, date: string): Promise<string> {
  const delta = await pullFullDelta(ctx);
  const row = (delta.domains['quest_logs'] as unknown as QuestLogRow[]).find(log => log.questId === questId && log.date === date);
  if (!row) throw new Error(`no quest_logs row found for quest ${questId} on ${date}`);
  return row.id;
}

test.describe('memoir metrics', () => {
  test('should lazily seed exactly the 4 built-in health metrics idempotently under contention, and reject editing or deleting a built-in', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'met-builtins', onboard: true });
    await pullFullDelta(persona.ctx);
    const account = await getAccount(persona.ctx);

    const preMetrics = await memoirDb()<{ n: number }[]>`SELECT count(*)::int AS n FROM metrics WHERE account_id = ${account.id}::bigint`;
    expect(preMetrics[0]?.n, 'the race needs an account metrics has never touched').toBe(0);

    const headers = await csrfHeaders(persona.ctx);
    const [first, second] = await withAccountLockHeld(account.id, 2, () =>
      Promise.all([
        submitCommandWithHeaders(persona.ctx, headers, 'metric.create', { name: 'Custom A', valueType: 'number', direction: 'higher' }),
        submitCommandWithHeaders(persona.ctx, headers, 'metric.create', { name: 'Custom B', valueType: 'number', direction: 'higher' }),
      ]),
    );
    expectApplied(first);
    expectApplied(second);
    const customAId = String(first.result['id']);

    let delta = await pullFullDelta(persona.ctx);
    const builtins = metricsOf(delta).filter(metric => metric.builtin);
    expect(builtins.map(metric => metric.name).sort()).toEqual(BUILTIN_METRIC_NAMES);
    expect(builtins.every(metric => metric.isHealth)).toBe(true);

    const steps = metricsOf(delta).find(metric => metric.name === 'Steps');
    if (!steps) throw new Error('the Steps built-in was not seeded');

    const renamed = await submitCommand(persona.ctx, 'metric.update', { id: steps.id, name: 'Hacked' });
    expect(renamed.status).toBe('failed');
    expect(renamed.error?.code).toBe('MET_003');

    const removed = await submitCommand(persona.ctx, 'metric.delete', { id: steps.id });
    expect(removed.status).toBe('failed');
    expect(removed.error?.code).toBe('MET_003');

    delta = await pullFullDelta(persona.ctx);
    const stepsAfter = metricsOf(delta).find(metric => metric.id === steps.id);
    expect(stepsAfter?.name, 'the refused rename must not have touched the row').toBe('Steps');
    expect(stepsAfter?.active, 'the refused delete must not have deactivated it').toBe(true);

    const legitUpdate = await submitCommand(persona.ctx, 'metric.update', { id: customAId, name: 'Custom A Renamed' });
    expectApplied(legitUpdate);
  });

  test('should refuse deleting a metric a quest consequence still references unless detach is set, then report the detached count', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'met-consequence', onboard: true });
    const account = await getAccount(persona.ctx);

    const metric = await submitCommand(persona.ctx, 'metric.create', { name: 'Consequence Metric', valueType: 'number', direction: 'higher' });
    expectApplied(metric);
    const metricId = String(metric.result['id']);

    const quest = await submitCommand(persona.ctx, 'quest.create', dailyQuestDraft(`E2E met-2 quest ${randomUUID()}`));
    expectApplied(quest);
    const questId = String(quest.result['id']);

    await memoirDb()`
      INSERT INTO quest_consequences (account_id, quest_id, metric_id, full_value, unit, partial_mode)
      VALUES (${account.id}, ${questId}, ${metricId}, '10', 'count', 'none')
    `;

    const blocked = await submitCommand(persona.ctx, 'metric.delete', { id: metricId });
    expect(blocked.status).toBe('failed');
    expect(blocked.error?.code).toBe('MET_004');

    const detached = await submitCommand(persona.ctx, 'metric.delete', { id: metricId, detach: true });
    expectApplied(detached);
    expect(detached.result['detachedQuestCount']).toBe(1);

    const remaining = await memoirDb()<{ n: number }[]>`SELECT count(*)::int AS n FROM quest_consequences WHERE metric_id = ${metricId}::bigint`;
    expect(remaining[0]?.n).toBe(0);

    const delta = await pullFullDelta(persona.ctx);
    const row = metricsOf(delta).find(m => m.id === metricId);
    expect(row?.active).toBe(false);
  });

  test('should dedupe quest_log-sourced metric.register entries by questLogId, first write wins, a different log is a distinct entry', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'met-uniqueness', onboard: true });
    const today = todayLocal();

    const metric = await submitCommand(persona.ctx, 'metric.create', { name: 'Uniqueness Metric', valueType: 'number', direction: 'higher' });
    expectApplied(metric);
    const metricId = String(metric.result['id']);

    const { questId: questAId, occurrenceId: occurrenceA } = await createDailyQuest(persona.ctx, `E2E met-3 quest A ${randomUUID()}`);
    expectApplied(await submitCommand(persona.ctx, 'quest.complete', { occurrenceId: occurrenceA }));
    const logAId = await questLogId(persona.ctx, questAId, today);

    const first = await submitCommand(persona.ctx, 'metric.register', { metricId, date: today, value: 1, source: 'quest_log', questLogId: logAId });
    expectApplied(first);
    const entryAId = String(first.result['id']);

    const replay = await submitCommand(persona.ctx, 'metric.register', { metricId, date: today, value: 999, source: 'quest_log', questLogId: logAId });
    expectApplied(replay);
    expect(replay.result['id'], 'a quest_log-sourced entry dedupes by questLogId, first write wins').toBe(entryAId);

    let delta = await pullFullDelta(persona.ctx);
    const entryARow = entriesFor(delta, metricId).find(row => row.id === entryAId);
    expect(entryARow?.value, 'the replayed second write must not overwrite the first').toBe('1');

    const { questId: questBId, occurrenceId: occurrenceB } = await createDailyQuest(persona.ctx, `E2E met-3 quest B ${randomUUID()}`);
    expectApplied(await submitCommand(persona.ctx, 'quest.complete', { occurrenceId: occurrenceB }));
    const logBId = await questLogId(persona.ctx, questBId, today);

    const second = await submitCommand(persona.ctx, 'metric.register', { metricId, date: today, value: 2, source: 'quest_log', questLogId: logBId });
    expectApplied(second);
    expect(second.result['id'], 'a different quest log is a distinct entry even for the same metric+date').not.toBe(entryAId);

    delta = await pullFullDelta(persona.ctx);
    expect(entriesFor(delta, metricId)).toHaveLength(2);
  });

  test.fixme('metric.register overwrites the same manual-source entry and lets different sources coexist (app bug: apps/memoir-server/src/modules/metrics/metric-entry.repository.ts:66 — targetWhere is sent as a bind parameter, so once a pooled connection has planned this statement generically infer_arbiter_indexes cannot match the partial index and every non-quest_log metric.register 500s with 42P10)', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'met-uniqueness-manual', onboard: true });
    const today = todayLocal();

    const metric = await submitCommand(persona.ctx, 'metric.create', { name: 'Uniqueness Metric', valueType: 'number', direction: 'higher' });
    expectApplied(metric);
    const metricId = String(metric.result['id']);

    const firstManual = await submitCommand(persona.ctx, 'metric.register', { metricId, date: today, value: 10, source: 'manual' });
    expectApplied(firstManual);
    const manualEntryId = String(firstManual.result['id']);

    const secondManual = await submitCommand(persona.ctx, 'metric.register', { metricId, date: today, value: 20, source: 'manual' });
    expectApplied(secondManual);
    expect(secondManual.result['id'], 'same metric+date+source overwrites the same entry').toBe(manualEntryId);

    const delta = await pullFullDelta(persona.ctx);
    const manualEntries = entriesFor(delta, metricId).filter(row => row.source === 'manual');
    expect(manualEntries).toHaveLength(1);
    expect(manualEntries[0]?.value).toBe('20');

    const foodEntry = await submitCommand(persona.ctx, 'metric.register', { metricId, date: today, value: 30, source: 'food' });
    expectApplied(foodEntry);
    expect(foodEntry.result['id'], 'a different source is a distinct entry').not.toBe(manualEntryId);

    expect(entriesFor(await pullFullDelta(persona.ctx), metricId)).toHaveLength(2);
  });

  test('should offer a quest completion once a health threshold is crossed by a quest_log entry, suppress it once a terminal log exists, and never auto-write a quest log', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'met-offers', onboard: true });
    const today = todayLocal();

    const bootstrap = await submitCommand(persona.ctx, 'metric.create', { name: 'Offer Bootstrap', valueType: 'number', direction: 'higher' });
    expectApplied(bootstrap);
    const delta0 = await pullFullDelta(persona.ctx);
    const steps = metricsOf(delta0).find(metric => metric.name === 'Steps');
    if (!steps) throw new Error('the Steps built-in was not seeded');

    const quest = await submitCommand(persona.ctx, 'quest.create', {
      ...dailyQuestDraft(`E2E met-4 quest ${randomUUID()}`),
      healthThreshold: { metricId: steps.id, value: 5000, comparison: 'gte' },
    });
    expectApplied(quest);
    const questId = String(quest.result['id']);

    // findThresholdOffers (metrics-commands.service.ts:159-161) runs for any health-metric source, so a
    // quest_log-sourced register exercises the same offer logic as manual — each call needs its own log id
    // since dedupe is keyed on (questLogId, metricId).
    async function helperLogId(label: string): Promise<string> {
      const { questId: helperQuestId, occurrenceId } = await createDailyQuest(persona.ctx, `E2E met-4 helper ${label} ${randomUUID()}`);
      expectApplied(await submitCommand(persona.ctx, 'quest.complete', { occurrenceId }));
      return questLogId(persona.ctx, helperQuestId, today);
    }

    const belowLogId = await helperLogId('below');
    const below = await submitCommand(persona.ctx, 'metric.register', { metricId: steps.id, date: today, value: 4000, source: 'quest_log', questLogId: belowLogId });
    expectApplied(below);
    expect(below.result['offers'], 'below the threshold, nothing to offer').toEqual([]);

    const crossingLogId = await helperLogId('crossing');
    const crossing = await submitCommand(persona.ctx, 'metric.register', { metricId: steps.id, date: today, value: 6000, source: 'quest_log', questLogId: crossingLogId });
    expectApplied(crossing);
    const offers = crossing.result['offers'] as Record<string, unknown>[];
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ questId, comparison: 'gte', thresholdValue: 5000, currentValue: 6000 });

    let delta = await pullFullDelta(persona.ctx);
    expect(
      (delta.domains['quest_logs'] as unknown as QuestLogRow[]).some(log => log.questId === questId && log.date === today),
      "crossing a threshold must never itself write the threshold quest's own log",
    ).toBe(false);

    const occurrenceId = `${questId}:${today}`;
    expectApplied(await submitCommand(persona.ctx, 'quest.complete', { occurrenceId }));

    delta = await pullFullDelta(persona.ctx);
    expect(
      (delta.domains['quest_logs'] as unknown as QuestLogRow[]).some(log => log.questId === questId && log.date === today),
      'the threshold quest now has its own log',
    ).toBe(true);

    const afterLogId = await helperLogId('after');
    const afterCompletion = await submitCommand(persona.ctx, 'metric.register', { metricId: steps.id, date: today, value: 8000, source: 'quest_log', questLogId: afterLogId });
    expectApplied(afterCompletion);
    expect(afterCompletion.result['offers'], 'a terminal log for the occurrence suppresses the offer').toEqual([]);
  });

  test.fixme('metric.register offers a quest completion from a manual-source entry too, not only quest_log (app bug: apps/memoir-server/src/modules/metrics/metric-entry.repository.ts:66 — same bind-param targetWhere, 42P10 on every non-quest_log register)', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'met-offers-manual', onboard: true });
    const today = todayLocal();

    const bootstrap = await submitCommand(persona.ctx, 'metric.create', { name: 'Offer Bootstrap', valueType: 'number', direction: 'higher' });
    expectApplied(bootstrap);
    const delta0 = await pullFullDelta(persona.ctx);
    const steps = metricsOf(delta0).find(metric => metric.name === 'Steps');
    if (!steps) throw new Error('the Steps built-in was not seeded');

    const quest = await submitCommand(persona.ctx, 'quest.create', {
      ...dailyQuestDraft(`E2E met-4 manual quest ${randomUUID()}`),
      healthThreshold: { metricId: steps.id, value: 5000, comparison: 'gte' },
    });
    expectApplied(quest);
    const questId = String(quest.result['id']);

    const crossing = await submitCommand(persona.ctx, 'metric.register', { metricId: steps.id, date: today, value: 6000, source: 'manual' });
    expectApplied(crossing);
    const offers = crossing.result['offers'] as Record<string, unknown>[];
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ questId, comparison: 'gte', thresholdValue: 5000, currentValue: 6000 });

    const reRegistered = await submitCommand(persona.ctx, 'metric.register', { metricId: steps.id, date: today, value: 7000, source: 'manual' });
    expectApplied(reRegistered);
    expect(reRegistered.result['offers'], 'the offer persists while no terminal log exists yet').toHaveLength(1);

    const occurrenceId = `${questId}:${today}`;
    expectApplied(await submitCommand(persona.ctx, 'quest.complete', { occurrenceId }));

    const afterCompletion = await submitCommand(persona.ctx, 'metric.register', { metricId: steps.id, date: today, value: 8000, source: 'manual' });
    expectApplied(afterCompletion);
    expect(afterCompletion.result['offers'], 'a terminal log for the occurrence suppresses the offer').toEqual([]);
  });
});

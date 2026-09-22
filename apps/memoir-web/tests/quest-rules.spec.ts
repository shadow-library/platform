import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type Command, MemoirEngine, type QuestDraft } from '@/lib/data';
import { type DeltaPage, projectWorldState, resolveThresholdMetric, SyncedDataProvider, toWireCommand } from '@/lib/sync';

import { createTestEngine } from './sync-harness';

const TODAY = '2026-08-24';
const YESTERDAY = '2026-08-23';
const TOMORROW = '2026-08-25';
const STEPS_METRIC = { id: '501', name: 'Steps', isHealth: true };
const LAST_FRIDAY_RULE = {
  frequency: 'monthly',
  interval: 1,
  startDate: '2026-01-01',
  end: { kind: 'never' },
  exceptions: [],
  pattern: { kind: 'nth_weekday', weekday: 5, ordinal: 'last' },
};

function questRow(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: `Quest ${id}`, durationMin: 20, startTimeMin: 420, strictness: 'routine', recurrence: { frequency: 'daily' }, active: true, ...extra };
}

function lockRow(date: string, lockedQuestIds: string[], lockBrokenAt: string | null): Record<string, unknown> {
  return { date, intensityMode: 'standard', committedAt: `${date}T06:00:00.000Z`, lockedQuestIds, lockBrokenAt };
}

function draft(healthThreshold: QuestDraft['healthThreshold']): QuestDraft {
  return {
    name: 'Walk 8,000 steps',
    notes: null,
    startTimeMinutes: null,
    durationMinutes: 30,
    statAffinity: 'body',
    strictness: 'goal',
    optionalStreakOptIn: false,
    recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], dayOfMonth: null, startDate: TODAY, end: { kind: 'never' }, exceptions: [] },
    consequences: [],
    moduleLink: null,
    notification: { enabled: false, leadMinutes: 10 },
    healthThreshold,
    active: true,
  };
}

describe('projectWorldState quest locks', () => {
  it('should not lock today once a postpone broke today’s lock', async () => {
    const engine = new MemoirEngine(projectWorldState({ quests: [questRow('1')], daily_states: [lockRow(TODAY, ['1'], `${TODAY}T09:30:00.000Z`)] }, TODAY));

    expect((await engine.getQuest('1')).scheduleLocked).toBe(false);
    expect((await engine.getDay(TODAY)).occurrences[0]?.locked).toBe(false);
  });

  it('should keep today’s lock when only an earlier day’s lock was broken', async () => {
    const world = projectWorldState({ quests: [questRow('1')], daily_states: [lockRow(YESTERDAY, ['1'], `${YESTERDAY}T09:30:00.000Z`), lockRow(TODAY, ['1'], null)] }, TODAY);
    const engine = new MemoirEngine(world);

    expect((await engine.getQuest('1')).scheduleLocked).toBe(true);
    expect(world.locks.has(YESTERDAY)).toBe(false);
  });
});

describe('MemoirEngine break rules', () => {
  it('should break today’s lock when a locked quest is postponed, but not when it is skipped', async () => {
    const rows = { quests: [questRow('1'), questRow('2')], daily_states: [lockRow(TODAY, ['1', '2'], null)] };
    const skipped = new MemoirEngine(projectWorldState(rows, TODAY));
    const postponed = new MemoirEngine(projectWorldState(rows, TODAY));

    await skipped.dispatchCommand({ type: 'quest.skip', occurrenceId: `1:${TODAY}` });
    await postponed.dispatchCommand({ type: 'quest.postpone', occurrenceId: `1:${TODAY}` });

    expect((await skipped.getQuest('2')).scheduleLocked).toBe(true);
    expect((await postponed.getQuest('2')).scheduleLocked).toBe(false);
  });

  it('should leave another day’s lock alone when a quest on that day is postponed, as only the open day’s lock can break', async () => {
    const engine = new MemoirEngine(projectWorldState({ quests: [questRow('1')], daily_states: [lockRow(TOMORROW, ['1'], null)] }, TODAY));

    await engine.dispatchCommand({ type: 'quest.postpone', occurrenceId: `1:${TOMORROW}` });

    expect(engine.world.locks.has(TOMORROW)).toBe(true);
    expect((await engine.getDay(TOMORROW)).occurrences[0]?.locked).toBe(true);
  });

  it('should spend a held shield without touching HP, and never for a recovery quest', async () => {
    const engine = new MemoirEngine(
      projectWorldState(
        {
          account: [{ level: 2, hpToday: 3, hpMax: 5, intensityMode: 'high_intensity' }],
          quests: [questRow('1'), questRow('2', { strictness: 'recovery' })],
          quest_streaks: [
            { questId: '1', currentRunDays: 12, bestRunDays: 12, shieldsAvailable: 1 },
            { questId: '2', currentRunDays: 0, bestRunDays: 0, shieldsAvailable: 1 },
          ],
        },
        TODAY,
      ),
    );

    await engine.dispatchCommand({ type: 'quest.postpone', occurrenceId: `1:${TODAY}` });
    await engine.dispatchCommand({ type: 'quest.skip', occurrenceId: `2:${TODAY}` });

    const day = await engine.getDay(TODAY);
    expect(day.hero.hp).toBe(3);
    expect(day.occurrences.find(item => item.questId === '1')).toMatchObject({ state: 'postponed', streakDays: 12, shields: 0 });
    expect(day.occurrences.find(item => item.questId === '2')).toMatchObject({ state: 'skipped', shields: 1 });
  });

  it('should price a day by its snapshot intensity and fall back to the account only from today on', async () => {
    const engine = new MemoirEngine(
      projectWorldState(
        {
          account: [{ level: 2, hpToday: 3, hpMax: 5, intensityMode: 'standard' }],
          quests: [questRow('1')],
          daily_states: [
            { date: YESTERDAY, intensityMode: 'high_intensity' },
            { date: TODAY, intensityMode: 'low_intensity' },
          ],
        },
        TODAY,
      ),
    );
    const bare = new MemoirEngine(projectWorldState({ quests: [questRow('1')] }, TODAY));

    expect((await engine.getDay(YESTERDAY)).occurrences[0]?.dayIntensity).toBe('demanding');
    expect((await engine.getDay(TODAY)).occurrences[0]?.dayIntensity).toBe('gentle');
    expect((await engine.getDay(TOMORROW)).occurrences[0]?.dayIntensity).toBe('standard');
    expect((await engine.getDay('2026-08-20')).occurrences[0]?.dayIntensity).toBeNull();
    expect((await bare.getDay(TODAY)).occurrences[0]?.dayIntensity).toBeNull();
  });

  it('should price a day not yet opened by the staged intensity the server applies when it opens', async () => {
    const engine = new MemoirEngine(
      projectWorldState(
        {
          account: [{ level: 2, hpToday: 3, hpMax: 5, intensityMode: 'standard', pendingIntensityMode: 'low_intensity' }],
          quests: [questRow('1')],
          daily_states: [{ date: TODAY, intensityMode: 'standard' }],
        },
        TODAY,
      ),
    );

    expect((await engine.getDay(TODAY)).occurrences[0]?.dayIntensity).toBe('standard');
    expect((await engine.getDay(TOMORROW)).occurrences[0]?.dayIntensity).toBe('gentle');
  });
});

describe('quest threshold wire', () => {
  it('should send a builder threshold by its synced metric id and read it back after sync', () => {
    const world = projectWorldState({ metrics: [STEPS_METRIC] }, TODAY);
    const threshold = { metricKey: 'steps', value: 8000, comparison: 'gte' } as const;
    const create = resolveThresholdMetric({ type: 'quest.create', draft: draft(threshold) }, world.metricIds);
    const update = resolveThresholdMetric({ type: 'quest.update', questId: '7', patch: { healthThreshold: threshold } }, world.metricIds);

    const created = toWireCommand(create as Command).payload['healthThreshold'];
    expect(created).toEqual({ metricId: '501', value: 8000, comparison: 'gte' });
    expect(toWireCommand(update as Command).payload).toEqual({ questId: '7', patch: { healthThreshold: { metricId: '501', value: 8000, comparison: 'gte' } } });

    const synced = projectWorldState({ metrics: [STEPS_METRIC], quests: [questRow('7', { healthThreshold: created })] }, TODAY);
    expect(synced.quests[0]?.healthThreshold).toEqual(threshold);
  });

  it('should send a threshold switched off as null', () => {
    expect(toWireCommand({ type: 'quest.update', questId: '7', patch: { healthThreshold: null } }).payload).toEqual({ questId: '7', patch: { healthThreshold: null } });
  });

  describe('SyncedDataProvider', () => {
    beforeEach(() => {
      setSystemTime(new Date(`${TODAY}T12:00:00`));
    });
    afterEach(() => setSystemTime());

    it('should refuse a threshold the metrics catalogue cannot address yet instead of queueing it', async () => {
      const page: DeltaPage = { cursor: '1', hasMore: false, tombstones: [], domains: { quests: [] } };
      const { engine, server } = createTestEngine({ pages: [page], today: TODAY });
      await engine.start();
      const provider = new SyncedDataProvider(engine);

      const result = await provider.dispatchCommand({ type: 'quest.create', draft: draft({ metricKey: 'steps', value: 8000, comparison: 'gte' }) });

      expect(result).toMatchObject({
        status: 'rejected',
        message: 'Health metrics aren’t set up for this account yet, so the threshold can’t be saved. Turn it off to save the quest.',
      });
      expect(await engine.outbox.size()).toBe(0);
      expect(await provider.listQuests('all')).toHaveLength(0);
      expect(server.batches).toHaveLength(0);
    });
  });
});

describe('monthly nth weekday wire', () => {
  it('should read a last-weekday rule and send it back unchanged', () => {
    const [quest] = projectWorldState({ quests: [questRow('9', { recurrence: LAST_FRIDAY_RULE })] }, TODAY).quests;

    expect(quest?.recurrence.nthWeekday).toEqual({ weekday: 'fri', ordinal: 'last' });
    expect(toWireCommand({ type: 'quest.update', questId: '9', patch: { recurrence: quest!.recurrence } }).payload).toEqual({
      questId: '9',
      patch: { recurrence: LAST_FRIDAY_RULE },
    });
  });

  it('should schedule the quest on the last weekday of the month', async () => {
    const engine = new MemoirEngine(projectWorldState({ quests: [questRow('9', { recurrence: LAST_FRIDAY_RULE })] }, TODAY));

    expect((await engine.getDay('2026-08-28')).occurrences.map(item => item.questId)).toEqual(['9']);
    expect((await engine.getDay('2026-08-21')).occurrences).toHaveLength(0);
  });

  it('should not read an ordinal the server never stores as a weekday of the month', () => {
    const [quest] = projectWorldState({ quests: [questRow('9', { recurrence: { ...LAST_FRIDAY_RULE, pattern: { kind: 'nth_weekday', weekday: 5, ordinal: 5 } } })] }, TODAY).quests;

    expect(quest?.recurrence.nthWeekday).toBeUndefined();
  });
});

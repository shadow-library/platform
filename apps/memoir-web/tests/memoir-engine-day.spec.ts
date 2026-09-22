import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { MemoirEngine } from '@/lib/data';
import { projectWorldState } from '@/lib/sync';

const TODAY = '2026-08-22';

function questRow(id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name, durationMin: 20, startTimeMin: 420, strictness: 'routine', recurrence: { frequency: 'daily' }, active: true, ...extra };
}

function logRow(questId: string, date: string, state: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `${questId}-${date}`, questId, date, state, xpAwarded: 0, coinsAwarded: 0, createdAt: `${date}T08:00:00.000Z`, ...extra };
}

function engineOver(rows: Parameters<typeof projectWorldState>[0]): MemoirEngine {
  return new MemoirEngine(projectWorldState(rows, TODAY));
}

describe('MemoirEngine.getDay', () => {
  afterEach(() => setSystemTime());

  it('should hold the end-of-day summary until the wake window closes', async () => {
    const engine = engineOver({
      account: [{ level: 2, hpToday: 4, hpMax: 5, scheduleEndMin: 1320 }],
      quests: [questRow('q1', 'Morning run'), questRow('q2', 'Read 20 pages')],
      quest_logs: [logRow('q1', TODAY, 'completed'), logRow('q2', TODAY, 'partial')],
    });

    setSystemTime(new Date(2026, 7, 22, 14, 30));
    expect((await engine.getDay(TODAY)).summary).toBeNull();

    setSystemTime(new Date(2026, 7, 22, 22, 15));
    expect((await engine.getDay(TODAY)).summary?.detail).toBe('1 of 2 quests completed, 1 partial.');
  });

  it('should keep a rescheduled occurrence in Coming up at its new time', async () => {
    const engine = engineOver({
      quests: [questRow('q1', 'Morning run'), questRow('q2', 'Late walk', { startTimeMin: 1260 })],
      quest_logs: [logRow('q1', TODAY, 'rescheduled', { rescheduledToMin: 1200 })],
    });

    const upcoming = (await engine.getDay(TODAY)).upcoming;
    expect(upcoming.slice(0, 2)).toEqual([
      { id: `q1:${TODAY}`, when: '20:00', title: 'Morning run', meta: 'Today · moved from 07:00' },
      { id: `q2:${TODAY}`, when: '21:00', title: 'Late walk', meta: 'Today' },
    ]);
  });

  it('should date a closed streak from its first unshielded break, not the daily misses after it', async () => {
    const away = Array.from({ length: 11 }, (_, index) => logRow('q1', `2026-08-${String(11 + index).padStart(2, '0')}`, 'missed'));
    const engine = engineOver({
      quests: [questRow('q1', 'Morning run')],
      quest_streaks: [{ questId: 'q1', currentRunDays: 0, bestRunDays: 41, shieldsAvailable: 0 }],
      quest_logs: [logRow('q1', '2026-08-08', 'completed'), logRow('q1', '2026-08-09', 'skipped', { shielded: true }), logRow('q1', '2026-08-10', 'missed'), ...away],
    });

    const [streak] = (await engine.getDay(TODAY)).streaks;
    expect(streak?.label).toBe('ended at 41');
    expect(streak?.note).toBe('Closed 12 days ago. The record stays.');
  });

  it('should date a closed streak from the first scheduled day after the last kept one when no break was logged', async () => {
    const engine = engineOver({
      quests: [questRow('q1', 'Morning run')],
      quest_streaks: [{ questId: 'q1', currentRunDays: 0, bestRunDays: 41, shieldsAvailable: 0 }],
      quest_logs: [logRow('q1', '2026-08-07', 'completed'), logRow('q1', '2026-08-09', 'partial')],
    });

    expect((await engine.getDay(TODAY)).streaks[0]?.note).toBe('Closed 12 days ago. The record stays.');
  });

  it('should leave HP to the day close when a quest is skipped', async () => {
    const engine = engineOver({
      account: [{ level: 2, hpToday: 4, hpMax: 5 }],
      quests: [questRow('q1', 'Morning run'), questRow('q2', 'Recovery walk', { strictness: 'recovery' })],
      quest_streaks: [
        { questId: 'q1', currentRunDays: 5, bestRunDays: 5, shieldsAvailable: 1 },
        { questId: 'q2', currentRunDays: 0, bestRunDays: 0, shieldsAvailable: 1 },
      ],
    });

    await engine.dispatchCommand({ type: 'quest.skip', occurrenceId: `q1:${TODAY}` });
    await engine.dispatchCommand({ type: 'quest.skip', occurrenceId: `q2:${TODAY}` });

    const day = await engine.getDay(TODAY);
    expect(day.hero.hp).toBe(4);
    expect(day.occurrences.find(item => item.questId === 'q1')).toMatchObject({ streakDays: 5, shields: 0 });
    expect(day.occurrences.find(item => item.questId === 'q2')).toMatchObject({ shields: 1 });
  });
});

describe('MemoirEngine.getPlan', () => {
  it('should read a past rescheduled occurrence as missed on the plan', async () => {
    const engine = engineOver({ quests: [questRow('q1', 'Morning run')], quest_logs: [logRow('q1', '2026-08-21', 'rescheduled', { rescheduledToMin: 1200 })] });

    const plan = await engine.getPlan({ scope: 'week', anchor: TODAY });
    expect(plan.days.find(day => day.date === '2026-08-21')?.items[0]?.state).toBe('missed');
  });
});

describe('MemoirEngine.getQuest', () => {
  it('should describe a one-day-a-week quest in the singular', async () => {
    const engine = engineOver({ quests: [questRow('q1', 'Weekly review', { recurrence: { frequency: 'weekly', daysOfWeek: [6] }, durationMin: 30 })] });

    expect((await engine.getQuest('q1')).loadSummary).toBe('About 30m on the days it runs, 1 day a week.');
  });
});

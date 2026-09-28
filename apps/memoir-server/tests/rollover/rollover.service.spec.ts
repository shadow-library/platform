import '@server/bootstrap';

import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type GrantIntent, type HeroLedger, type RolloverGate } from '@modules/commands';
import { type ProgressionService } from '@modules/progression';
import { type RolloverRepository, RolloverService } from '@modules/rollover';
import { EMPTY_STREAK_STATE, type StreakState } from '@modules/rules';
import { type SchedulerService } from '@modules/scheduler';
import { type DeltaRepository, type DeltaSourceRegistry } from '@modules/sync';
import { type Account, type DailyState, type Quest, type QuestLog, type RecoveryQuest } from '@server/database';

const ACCOUNT_ID = 1n;
const QUEST_ID = 10n;

class FakeRolloverStore {
  account: Account.Row;
  readonly dailyStates = new Map<string, DailyState.Row>();
  readonly questLogs: QuestLog.Row[] = [];
  readonly recoveries: RecoveryQuest.Row[] = [];
  readonly streaks = new Map<bigint, StreakState>();
  readonly quests: Quest.Row[] = [];
  private nextId = 100n;

  constructor(account: Partial<Account.Row>) {
    this.account = {
      id: ACCOUNT_ID,
      timezone: 'UTC',
      intensityMode: 'standard',
      deletionState: 'none',
      lastHpDate: null,
      lastActiveDate: null,
      returnerThresholdDays: 7,
      pendingReturnerShields: 0,
      ...account,
    } as Account.Row;
  }

  addDailyQuest(): void {
    const recurrence = { frequency: 'daily', interval: 1, startDate: { year: 2026, month: 1, day: 1 }, end: { kind: 'never' } };
    this.quests.push({
      id: QUEST_ID,
      accountId: ACCOUNT_ID,
      name: 'Walk',
      strictness: 'routine',
      statAffinity: 'body',
      recurrence,
      active: true,
      optionalStreakOptIn: false,
    } as Quest.Row);
  }

  addLog(date: string, state: QuestLog.State): void {
    this.questLogs.push({ id: this.id(), accountId: ACCOUNT_ID, questId: QUEST_ID, date, state, strictness: 'routine', crownSliceWeight: '1.00' } as QuestLog.Row);
  }

  addPendingRecovery(date: string): void {
    this.recoveries.push({ id: this.id(), accountId: ACCOUNT_ID, date, state: 'pending', sourceQuestId: QUEST_ID } as RecoveryQuest.Row);
  }

  openDay(date: string): void {
    this.dailyStates.set(date, this.dailyStateRow({ date, rolloverAt: null }));
  }

  repository(): RolloverRepository {
    const repository = {
      runSerialized: async (_accountId: bigint, operation: (tx: unknown) => Promise<unknown>) => operation({}),
      readCurrency: async () => ({ timezone: this.account.timezone, lastHpDate: this.account.lastHpDate, deletionState: this.account.deletionState }),
      lockAccount: async () => ({ ...this.account }),
      updateAccount: async (_tx: unknown, _accountId: bigint, values: Partial<Account.Row>) => {
        this.account = { ...this.account, ...values };
      },
      lockDailyState: async (_tx: unknown, _accountId: bigint, date: string) => this.dailyStates.get(date) ?? null,
      findDailyState: async (_tx: unknown, _accountId: bigint, date: string) => this.dailyStates.get(date) ?? null,
      listDailyStates: async (_tx: unknown, _accountId: bigint, from: string, to: string) => [...this.dailyStates.values()].filter(state => state.date >= from && state.date <= to),
      upsertDailyState: async (_tx: unknown, values: Partial<DailyState.Row> & { date: string }) => {
        const existing = this.dailyStates.get(values.date);
        if (existing?.rolloverAt) return;
        this.dailyStates.set(values.date, { ...(existing ?? this.dailyStateRow({ date: values.date })), ...values });
      },
      listActiveQuests: async () => this.quests.filter(quest => quest.active),
      listQuestLogs: async (_tx: unknown, _accountId: bigint, from: string, to: string) => this.questLogs.filter(log => log.date >= from && log.date <= to),
      insertMiss: async (_tx: unknown, values: Partial<QuestLog.Row> & { questId: bigint; date: string }) => {
        if (this.questLogs.some(log => log.questId === values.questId && log.date === values.date)) return null;
        const log = { id: this.id(), ...values } as QuestLog.Row;
        this.questLogs.push(log);
        return log;
      },
      lockStreak: async (_tx: unknown, _accountId: bigint, questId: bigint) => this.streaks.get(questId) ?? EMPTY_STREAK_STATE,
      writeStreak: async (_tx: unknown, _accountId: bigint, questId: bigint, _date: string, state: StreakState) => {
        this.streaks.set(questId, state);
      },
      insertShieldConsumption: async () => undefined,
      listShieldedQuests: async () => new Set<bigint>(),
      expirePendingRecovery: async (_tx: unknown, _accountId: bigint, date: string) => {
        const expired = this.recoveries.filter(recovery => recovery.state === 'pending' && recovery.date <= date);
        for (const recovery of expired) recovery.state = 'expired';
        return expired;
      },
      insertRecoveryQuest: async () => null,
      insertReturnerEvent: async () => ({}),
      insertComebackEvent: async () => true,
    };
    return repository as unknown as RolloverRepository;
  }

  private dailyStateRow(values: Partial<DailyState.Row> & { date: string }): DailyState.Row {
    return {
      accountId: ACCOUNT_ID,
      intensityMode: 'standard',
      hpStart: 5,
      hpEnd: 5,
      hpMax: 5,
      crownXpRemaining: 0,
      crownCoinsRemaining: 0,
      committedAt: null,
      lockedQuestIds: [],
      lockBrokenAt: null,
      rolloverAt: null,
      ...values,
    } as DailyState.Row;
  }

  private id(): bigint {
    this.nextId += 1n;
    return this.nextId;
  }
}

function harness(store: FakeRolloverStore) {
  const grants: GrantIntent[] = [];
  const closedDays: string[] = [];
  const heroLedger = { grant: async (_tx: unknown, _accountId: bigint, intents: GrantIntent[]) => grants.push(...intents) } as unknown as HeroLedger;
  const progression = {
    onDayClosed: async (_tx: unknown, _accountId: bigint, date: string) => closedDays.push(date),
    onLockedDayCleared: async () => undefined,
    onCrownBanked: async () => undefined,
    onReturnerFired: async () => undefined,
  } as unknown as ProgressionService;
  const service = new RolloverService(store.repository(), heroLedger, progression, {} as RolloverGate, {} as DeltaSourceRegistry, {} as DeltaRepository, {} as SchedulerService);
  return { service, grants, closedDays };
}

function at(date: string): void {
  setSystemTime(new Date(`${date}T12:00:00Z`));
}

describe('RolloverService day walk', () => {
  afterEach(() => setSystemTime());

  it('should close the day an account was prepared on once the next day begins, and only once', async () => {
    const store = new FakeRolloverStore({});
    store.addDailyQuest();
    const { service, closedDays } = harness(store);

    at('2026-03-10');
    await service.catchUp(ACCOUNT_ID);
    expect(store.dailyStates.get('2026-03-10')?.rolloverAt).toBeNull();

    at('2026-03-11');
    await service.catchUp(ACCOUNT_ID);
    await service.catchUp(ACCOUNT_ID);

    expect(store.dailyStates.get('2026-03-10')?.rolloverAt).toBeInstanceOf(Date);
    expect(store.dailyStates.get('2026-03-10')?.missedCount).toBe(1);
    expect(store.questLogs.filter(log => log.date === '2026-03-10').map(log => log.state)).toEqual(['missed']);
    expect(store.dailyStates.get('2026-03-11')?.rolloverAt).toBeNull();
    expect(store.account.lastHpDate).toBe('2026-03-11');
    expect(closedDays).toEqual(['2026-03-10']);

    at('2026-03-13');
    await service.catchUp(ACCOUNT_ID);

    expect(closedDays).toEqual(['2026-03-10', '2026-03-11', '2026-03-12']);
  });

  it('should date the last activity to the prepared day a quest was completed on when that day closes', async () => {
    const store = new FakeRolloverStore({});
    store.addDailyQuest();
    const { service } = harness(store);

    at('2026-03-10');
    await service.catchUp(ACCOUNT_ID);
    store.addLog('2026-03-10', 'completed');
    at('2026-03-11');
    await service.catchUp(ACCOUNT_ID);

    expect(store.account.lastActiveDate).toBe('2026-03-10');
    expect(store.dailyStates.get('2026-03-10')?.missedCount).toBe(0);
  });

  it('should fire the Returner from the prepared day the owner was last active on', async () => {
    const store = new FakeRolloverStore({});
    store.addDailyQuest();
    const { service, grants } = harness(store);

    at('2026-03-10');
    await service.catchUp(ACCOUNT_ID);
    store.addLog('2026-03-10', 'completed');
    at('2026-03-18');
    await service.catchUp(ACCOUNT_ID);

    expect(grants.filter(grant => grant.type === 'returner_fired').map(grant => grant.date)).toEqual(['2026-03-18']);
  });

  it('should expire the Recovery pending on the prepared day when that day closes', async () => {
    const store = new FakeRolloverStore({});
    const { service, grants } = harness(store);

    at('2026-03-10');
    await service.catchUp(ACCOUNT_ID);
    store.addPendingRecovery('2026-03-10');
    at('2026-03-11');
    await service.catchUp(ACCOUNT_ID);

    expect(store.recoveries.map(recovery => recovery.state)).toEqual(['expired']);
    expect(grants.filter(grant => grant.type === 'recovery_expired')).toHaveLength(1);
  });

  it('should resume an account parked on an unclosed prepared day at that day, and expire Recoveries stranded on earlier days', async () => {
    const store = new FakeRolloverStore({ lastHpDate: '2026-03-10' });
    store.addDailyQuest();
    store.openDay('2026-03-08');
    store.openDay('2026-03-10');
    store.addPendingRecovery('2026-03-08');
    const { service, closedDays } = harness(store);

    at('2026-03-12');
    await service.catchUp(ACCOUNT_ID);

    expect(closedDays).toEqual(['2026-03-10', '2026-03-11']);
    expect(store.recoveries.map(recovery => recovery.state)).toEqual(['expired']);
    expect(store.account.lastHpDate).toBe('2026-03-12');
  });

  it('should not re-close a day the walk already closed', async () => {
    const store = new FakeRolloverStore({ lastHpDate: '2026-03-10' });
    store.addDailyQuest();
    store.dailyStates.set('2026-03-10', { ...(store.dailyStates.get('2026-03-10') ?? {}), date: '2026-03-10', rolloverAt: new Date('2026-03-11T00:00:00Z') } as DailyState.Row);
    const { service, closedDays } = harness(store);

    at('2026-03-11');
    await service.catchUp(ACCOUNT_ID);

    expect(closedDays).toEqual([]);
    expect(store.questLogs).toHaveLength(0);
    expect(store.account.lastHpDate).toBe('2026-03-11');
  });

  it('should skip a prepared day older than the catch-up bound rather than close it', async () => {
    const store = new FakeRolloverStore({ lastHpDate: '2025-11-01' });
    store.openDay('2025-11-01');
    const { service, closedDays } = harness(store);

    at('2026-03-10');
    await service.catchUp(ACCOUNT_ID);

    expect(closedDays).not.toContain('2025-11-01');
    expect(closedDays[0]).toBe('2025-12-10');
    expect(store.dailyStates.get('2025-11-01')?.rolloverAt).toBeNull();
  });
});

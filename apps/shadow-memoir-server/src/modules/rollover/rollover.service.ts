/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type GrantIntent, HeroLedger, RolloverGate } from '@modules/commands';
import { ProgressionService } from '@modules/progression';
import {
  addDays,
  applyStreakEvent,
  compareLocalDates,
  computeDayHp,
  computeMomentum,
  crownCadenceFor,
  crownPeriodOf,
  crownWeightFor,
  currentRuleset,
  daysBetween,
  evaluateComebackArming,
  formatLocalDate,
  grantStreakShield,
  type HpBreak,
  type IntensityMode,
  isCrownPeriodClose,
  type LocalDate,
  localDateAt,
  type MomentumBucket,
  occursOn,
  parseLocalDate,
  planReturnerShieldGrant,
  type RecentMiss,
  recomputeCrownDay,
  type RecurrenceRule,
  returnerFires,
  type Ruleset,
  startOfLocalDay,
  type Strictness,
} from '@modules/rules';
import { SchedulerService } from '@modules/scheduler';
import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource } from '@modules/sync';
import { APP_NAME } from '@server/constants';
import { type Account, type DailyState, type DatabaseTransaction, type Quest, type QuestLog, schema } from '@server/database';

import { RolloverRepository } from './rollover.repository';

/**
 * Defining types
 */

type WalkStep = 'advanced' | 'current';

interface DayContext {
  ruleset: Ruleset;
  account: Account.Row;
  timeZone: string;
  intensityMode: IntensityMode;
  day: LocalDate;
  date: string;
}

interface CrownDayOutcome {
  grantedXp: number;
  grantedCoins: number;
  remainingXp: number;
  remainingCoins: number;
  periodStart: string;
  bankedXp: number | null;
  bankedCoins: number | null;
}

/**
 * Declaring the constants
 */

export const ROLLOVER_ENGINE_VERSION = '1';

const HOLD_STATES: readonly QuestLog.State[] = ['completed', 'partial', 'late', 'recovery'];
const BREAK_STATES: readonly QuestLog.State[] = ['missed', 'skipped', 'postponed'];
const MOMENTUM_RECENT_DAYS = 3;
/** How far back a Returner fire looks for the pre-absence run length; longer than any streak the milestone tiers name. */
const PRE_ABSENCE_LOOKBACK_DAYS = 400;
const FAILURE_GAUGE = 'rollover.failures';

const isHold = (state: QuestLog.State): boolean => HOLD_STATES.includes(state);

const isBreak = (state: QuestLog.State): boolean => BREAK_STATES.includes(state);

/**
 * The day-closing engine of ARCHITECTURE §13. One transaction per elapsed day — bounded work, and a
 * crash after day N leaves days ≤ N closed with `accounts.last_hp_date` at N, so the next invocation
 * resumes at N+1 rather than replaying. Idempotence rests on `daily_states.rollover_at` plus the natural
 * key behind every write the day performs, so re-running a closed day is a no-op twice over.
 */
@Injectable()
export class RolloverService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, RolloverService.name);
  /** The `rollover.failures` gauge's backing set — an account joins on a raised walk and leaves the moment one completes, so the reading is "accounts currently behind", not a lifetime tally. */
  private readonly failedAccounts = new Set<bigint>();

  constructor(
    private readonly repository: RolloverRepository,
    private readonly heroLedger: HeroLedger,
    private readonly progressionService: ProgressionService,
    private readonly gate: RolloverGate,
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
    private readonly scheduler: SchedulerService,
  ) {}

  /** `daily_states` moves here from the sync spine, which held its delta source only until this — its owning — module existed (T-16's note). */
  onModuleInit(): void {
    this.gate.register(accountId => this.ensureCurrent(accountId));
    this.scheduler.registerGauge(FAILURE_GAUGE, () => this.failedAccounts.size);
    const source: KeysetDeltaSource = {
      domain: 'daily_states',
      kind: 'keyset',
      fetch: ({ since, limit }) => this.deltaRepository.fetchSince(schema.dailyStates, since, limit),
    };
    this.registry.register(source);
  }

  /**
   * The lazy entry point (§13.1). Quiet to the user and loud to the operator per §13.3: a failed day
   * aborts its own transaction, stops the walk where it failed, and is reported through `rollover_failed`
   * — the caller's command or delta pull still proceeds, against a state whose last day is honestly
   * still open rather than falsely closed.
   */
  async ensureCurrent(accountId: bigint): Promise<void> {
    try {
      await this.catchUp(accountId);
      this.failedAccounts.delete(accountId);
    } catch (error) {
      this.failedAccounts.add(accountId);
      this.logger.error('rollover_failed', { accountId: String(accountId), error });
    }
  }

  async catchUp(accountId: bigint): Promise<void> {
    if (await this.isCurrent(accountId)) return;

    const maxSteps = Config.get('rollover.catchup-max-days') + 2;
    for (let step = 0; step < maxSteps; step++) {
      const outcome = await this.repository.runSerialized(accountId, tx => this.advanceOne(tx, accountId));
      if (outcome === 'current') return;
    }
    throw AppError.internal(`rollover walk for account '${accountId}' did not converge within its catch-up bound`);
  }

  /** Deliberately lock-free: the overwhelmingly common answer is "already current", and paying for a lock to learn that would put every request behind every other request's rollover. */
  private async isCurrent(accountId: bigint): Promise<boolean> {
    const account = await this.repository.readCurrency(accountId);
    if (!account) return true;
    if (account.deletionState !== 'none') return true;
    return account.lastHpDate === formatLocalDate(localDateAt(Date.now(), account.timezone));
  }

  private async advanceOne(tx: DatabaseTransaction, accountId: bigint): Promise<WalkStep> {
    const account = await this.repository.lockAccount(tx, accountId);
    if (!account) return 'current';
    if (account.deletionState !== 'none') return 'current';

    const ruleset = currentRuleset();
    const timeZone = account.timezone;
    const today = localDateAt(Date.now(), timeZone);
    const lastHpDate = account.lastHpDate === null ? null : parseLocalDate(account.lastHpDate);
    if (lastHpDate !== null && compareLocalDates(lastHpDate, today) >= 0) return 'current';

    const day = this.nextDay(lastHpDate, today);
    const context: DayContext = { ruleset, account, timeZone, intensityMode: account.intensityMode, day, date: formatLocalDate(day) };

    if (compareLocalDates(day, today) >= 0) {
      await this.prepareToday(tx, context);
      return 'current';
    }

    await this.closeDay(tx, context);
    return 'advanced';
  }

  /**
   * §13.3's catch-up bound: days older than `rollover.catchup-max-days` are never terminalized, so an
   * absence of any length costs a fixed amount of work. The walk skips straight to the bound's first day,
   * which then opens at full HP because the day before it was never closed and carries no `hp_end`.
   */
  private nextDay(lastHpDate: LocalDate | null, today: LocalDate): LocalDate {
    const bound = addDays(today, -Config.get('rollover.catchup-max-days'));
    if (lastHpDate === null) return today;
    const next = addDays(lastHpDate, 1);
    return compareLocalDates(next, bound) < 0 ? bound : next;
  }

  /*!
   * Closing an elapsed day (§13.2, PRD §4.10 steps 1-7)
   */

  private async closeDay(tx: DatabaseTransaction, context: DayContext): Promise<void> {
    const { account, date } = context;
    const existing = await this.repository.lockDailyState(tx, account.id, date);
    if (existing?.rolloverAt) {
      await this.repository.updateAccount(tx, account.id, { lastHpDate: date });
      return;
    }

    const quests = await this.repository.listActiveQuests(tx, account.id);
    const scheduled = this.scheduledOn(quests, context.day);
    const logs = await this.repository.listQuestLogs(tx, account.id, date, date);
    const resolved = new Map(logs.map(log => [log.questId, log]));

    const missed = await this.recordMisses(tx, context, scheduled, resolved);
    for (const log of missed) resolved.set(log.questId, log);

    await this.repository.expirePendingRecovery(tx, account.id, date);

    const dayLogs = [...resolved.values()];
    const hp = await this.computeHp(tx, context, dayLogs);
    const crown = await this.settleCrown(tx, context, scheduled, dayLogs);
    const missedCount = dayLogs.filter(log => log.state === 'missed').length;

    await this.repository.upsertDailyState(tx, {
      accountId: account.id,
      date,
      intensityMode: context.intensityMode,
      hpStart: hp.hpStart,
      hpEnd: hp.hpEnd,
      hpMax: hp.hpMax,
      crownXpGranted: crown.grantedXp,
      crownXpRemaining: crown.remainingXp,
      crownCoinsGranted: crown.grantedCoins,
      crownCoinsRemaining: crown.remainingCoins,
      crownPeriodStart: crown.periodStart,
      crownBankedXp: crown.bankedXp,
      crownBankedCoins: crown.bankedCoins,
      missedCount,
      rolloverAt: new Date(),
      rolloverEngineVersion: ROLLOVER_ENGINE_VERSION,
      rulesetVersion: context.ruleset.version,
    });
    await this.progressionService.onDayClosed(tx, account.id, date, scheduled.length, missedCount);

    const active = dayLogs.some(log => isHold(log.state));
    const lastActiveDate = active && (account.lastActiveDate === null || account.lastActiveDate < date) ? date : undefined;
    await this.repository.updateAccount(tx, account.id, { lastHpDate: date, ...(lastActiveDate ? { lastActiveDate } : {}) });
  }

  /** Recovery-strictness quests are excluded here rather than filtered later: a Recovery that lapses expires silently, and a missed Recovery must never be able to spawn another (PRD Invariant 6). */
  private scheduledOn(quests: Quest.Row[], day: LocalDate): Quest.Row[] {
    return quests.filter(quest => quest.strictness !== 'recovery' && occursOn(quest.recurrence as RecurrenceRule, day));
  }

  private async recordMisses(tx: DatabaseTransaction, context: DayContext, scheduled: Quest.Row[], resolved: Map<bigint, QuestLog.Row>): Promise<QuestLog.Row[]> {
    const { ruleset, account, date } = context;
    const inserted: QuestLog.Row[] = [];

    for (const quest of scheduled) {
      if (resolved.has(quest.id)) continue;
      const log = await this.repository.insertMiss(tx, {
        accountId: account.id,
        questId: quest.id,
        date,
        state: 'missed',
        statAffinity: quest.statAffinity,
        strictness: quest.strictness,
        intensityModeAtLog: context.intensityMode,
        crownSliceWeight: crownWeightFor(ruleset, quest.strictness).toFixed(2),
        rulesetVersion: ruleset.version,
      });
      if (!log) continue;
      inserted.push(log);

      const prior = await this.repository.lockStreak(tx, account.id, quest.id);
      const transition = applyStreakEvent(ruleset, prior, {
        state: 'missed',
        strictness: quest.strictness,
        intensityMode: context.intensityMode,
        streakOptIn: quest.optionalStreakOptIn,
        onTime: false,
      });
      if (transition.outcome === 'neutral') continue;
      if (transition.shieldsConsumed > 0) await this.repository.insertShieldConsumption(tx, account.id, quest.id, date);
      await this.repository.writeStreak(tx, account.id, quest.id, date, transition.state);
    }

    return inserted;
  }

  /**
   * §13.2's "costs never double-count": every break of the day is charged through one `occurrenceKey`
   * per (quest, date), so a miss the engine wrote and the break it represents collapse into a single
   * deduction rather than two.
   */
  private async computeHp(tx: DatabaseTransaction, context: DayContext, dayLogs: QuestLog.Row[]): Promise<{ hpStart: number; hpEnd: number; hpMax: number }> {
    const { account, day, date } = context;
    const previous = await this.repository.findDailyState(tx, account.id, formatLocalDate(addDays(day, -1)));
    const shielded = await this.repository.listShieldedQuests(tx, account.id, date);

    const breaks: HpBreak[] = dayLogs
      .filter(log => isBreak(log.state))
      .map(log => ({
        occurrenceKey: `${log.questId}:${date}`,
        strictness: log.strictness as Strictness,
        state: log.state,
        shielded: shielded.has(log.questId),
        streakDaysBefore: 0,
      }));

    const hp = computeDayHp(context.ruleset, context.intensityMode, { previousHpEnd: previous?.hpEnd ?? null, breaks });
    return { hpStart: hp.hpStart, hpEnd: hp.hpEnd, hpMax: hp.hpMax };
  }

  /**
   * Crown is endowed per day from the day's own scheduled weight and forfeited slice by slice; under the
   * weekly cadence the daily remainders accumulate and bank once, on the period's closing day, keyed
   * `crownbanked_{periodStart}` so a re-close can never bank twice (§11.3, PRD §4.4).
   */
  private async settleCrown(tx: DatabaseTransaction, context: DayContext, scheduled: Quest.Row[], dayLogs: QuestLog.Row[]): Promise<CrownDayOutcome> {
    const { ruleset, account, day, date } = context;
    const cadence = crownCadenceFor(ruleset, context.intensityMode);
    const period = crownPeriodOf(ruleset, cadence, day);
    const periodStart = formatLocalDate(period.start);

    const weights = scheduled.map(quest => crownWeightFor(ruleset, quest.strictness));
    const forfeits = dayLogs.filter(log => isBreak(log.state));
    const crownDay = recomputeCrownDay(
      ruleset,
      weights,
      forfeits.map(log => Number(log.crownSliceWeight)),
    );

    const intents: GrantIntent[] = [];
    if (compareLocalDates(day, period.start) === 0 && crownDay.grantedXp + crownDay.grantedCoins > 0) {
      intents.push({ dedupeKey: `crowninit_${periodStart}`, type: 'crown_init', date, note: `endowed ${crownDay.grantedXp} xp / ${crownDay.grantedCoins} coins` });
    }
    for (const log of forfeits) intents.push({ dedupeKey: `crownforfeit_${log.id}`, type: 'crown_forfeit', date, questId: log.questId, questLogId: log.id, state: log.state });

    let bankedXp: number | null = null;
    let bankedCoins: number | null = null;
    if (isCrownPeriodClose(ruleset, cadence, day)) {
      const priorDays = compareLocalDates(period.start, day) < 0 ? await this.repository.listDailyStates(tx, account.id, periodStart, formatLocalDate(addDays(day, -1))) : [];
      const banked = this.bankAmount(priorDays, crownDay);
      bankedXp = banked.xp;
      bankedCoins = banked.coins;
      if (banked.xp + banked.coins > 0) intents.push({ dedupeKey: `crownbanked_${periodStart}`, type: 'crown_banked', date, xpDelta: banked.xp, coinsDelta: banked.coins });
    }

    if (intents.length > 0) await this.heroLedger.grant(tx, account.id, intents);
    if (bankedXp !== null && bankedCoins !== null && bankedXp + bankedCoins > 0) await this.progressionService.onCrownBanked(tx, account.id, date);
    return { ...crownDay, periodStart, bankedXp, bankedCoins };
  }

  private bankAmount(priorDays: DailyState.Row[], crownDay: { remainingXp: number; remainingCoins: number }): { xp: number; coins: number } {
    const prior = priorDays.reduce((total, state) => ({ xp: total.xp + state.crownXpRemaining, coins: total.coins + state.crownCoinsRemaining }), { xp: 0, coins: 0 });
    return { xp: prior.xp + crownDay.remainingXp, coins: prior.coins + crownDay.remainingCoins };
  }

  /*!
   * Preparing today (§13.2's second phase, PRD §4.10's "then, for today")
   */

  private async prepareToday(tx: DatabaseTransaction, context: DayContext): Promise<void> {
    const promoted = await this.promotePending(tx, context);
    const { ruleset, account, day, date } = promoted;

    const quests = await this.repository.listActiveQuests(tx, account.id);
    const scheduled = this.scheduledOn(quests, day);
    const history = await this.repository.listQuestLogs(tx, account.id, formatLocalDate(addDays(day, -ruleset.momentum.medianWindowDays)), date);
    const todayLogs = history.filter(log => log.date === date);

    const momentum = computeMomentum(ruleset, {
      recentCompletions: this.recentCompletions(history, day),
      trailingCompletions: this.trailingCompletions(history, day, ruleset.momentum.medianWindowDays),
    });

    const returner = await this.fireReturner(tx, promoted, quests);
    const armed = await this.armComeback(tx, promoted, history, momentum.bucket, returner);
    await this.spawnRecovery(tx, promoted, quests, history, returner);

    const hp = await this.computeHp(tx, promoted, todayLogs);
    const crown = this.settleCrownForOpenDay(promoted, scheduled, todayLogs);

    await this.repository.upsertDailyState(tx, {
      accountId: account.id,
      date,
      intensityMode: promoted.intensityMode,
      hpStart: hp.hpStart,
      hpEnd: hp.hpEnd,
      hpMax: hp.hpMax,
      crownXpGranted: crown.grantedXp,
      crownXpRemaining: crown.remainingXp,
      crownCoinsGranted: crown.grantedCoins,
      crownCoinsRemaining: crown.remainingCoins,
      crownPeriodStart: crown.periodStart,
      comebackArmed: armed,
      returnerActive: returner,
      returnerFired: returner,
      momentumBucket: momentum.bucket,
      missedCount: todayLogs.filter(log => log.state === 'missed').length,
      rulesetVersion: ruleset.version,
    });

    const active = todayLogs.some(log => isHold(log.state));
    await this.repository.updateAccount(tx, account.id, {
      hpToday: hp.hpEnd,
      hpStartToday: hp.hpStart,
      hpMax: hp.hpMax,
      lastHpDate: date,
      warmthState: momentum.bucket,
      crownPeriodStart: crown.periodStart,
      crownRemaining: crown.remainingXp,
      crownCoinsRemaining: crown.remainingCoins,
      ...(active && (account.lastActiveDate === null || account.lastActiveDate < date) ? { lastActiveDate: date } : {}),
    });
  }

  /**
   * §12.5's deferred-apply contract: a staged timezone or intensity change lands here, after every
   * elapsed day has closed under the settings it was actually lived under, and before any of today's
   * state is derived. Ordering is the whole guarantee — promoting earlier would re-date closed days.
   */
  private async promotePending(tx: DatabaseTransaction, context: DayContext): Promise<DayContext> {
    const { account } = context;
    if (!account.pendingTimezone && !account.pendingIntensityMode) return context;

    const timezone = account.pendingTimezone ?? account.timezone;
    const intensityMode = account.pendingIntensityMode ?? account.intensityMode;
    await this.repository.updateAccount(tx, account.id, { timezone, intensityMode, pendingTimezone: null, pendingIntensityMode: null });

    return { ...context, account: { ...account, timezone, intensityMode, pendingTimezone: null, pendingIntensityMode: null }, timeZone: timezone, intensityMode };
  }

  private recentCompletions(history: QuestLog.Row[], day: LocalDate): [number, number, number] {
    const counts: [number, number, number] = [0, 0, 0];
    for (const log of history) {
      if (!isHold(log.state)) continue;
      const offset = -daysBetween(day, this.dateOf(log.date));
      if (offset >= 0 && offset < MOMENTUM_RECENT_DAYS) counts[offset as 0 | 1 | 2] += 1;
    }
    return counts;
  }

  private trailingCompletions(history: QuestLog.Row[], day: LocalDate, windowDays: number): number[] {
    const counts = new Array<number>(windowDays).fill(0);
    for (const log of history) {
      if (!isHold(log.state)) continue;
      const offset = -daysBetween(day, this.dateOf(log.date));
      if (offset >= 0 && offset < windowDays) counts[offset] = (counts[offset] ?? 0) + 1;
    }
    return counts;
  }

  private async fireReturner(tx: DatabaseTransaction, context: DayContext, quests: Quest.Row[]): Promise<boolean> {
    const { ruleset, account, day, date } = context;
    if (account.lastActiveDate === null) return false;

    const daysSinceLastActivity = daysBetween(this.dateOf(account.lastActiveDate), day);
    if (!returnerFires(ruleset, { daysSinceLastActivity, thresholdDays: account.returnerThresholdDays })) return false;

    const candidates = await this.returnerCandidates(tx, context, quests);
    const plan = planReturnerShieldGrant(ruleset, candidates);
    const event = await this.repository.insertReturnerEvent(tx, account.id, {
      date,
      lastActiveDate: account.lastActiveDate,
      daysAbsent: daysSinceLastActivity,
      shieldTargetQuestId: plan.questId === null ? null : BigInt(plan.questId),
      shieldPending: plan.placement !== 'granted',
      intensityMode: context.intensityMode,
    });
    if (event && plan.placement === 'granted' && plan.questId !== null) {
      const questId = BigInt(plan.questId);
      const prior = await this.repository.lockStreak(tx, account.id, questId);
      const granted = grantStreakShield(ruleset, prior, plan.shields);
      await this.repository.writeStreak(tx, account.id, questId, date, granted.state);
    }
    if (event) {
      await this.heroLedger.grant(tx, account.id, [{ dedupeKey: `returner_${date}`, type: 'returner_fired', date }]);
      await this.progressionService.onReturnerFired(tx, account.id, date);
    }
    return true;
  }

  /**
   * PRD §4.6: the target is chosen on the run each Quest carried *before* the absence, which the walk
   * has by now broken — so the run is recounted backwards from the last active date rather than read off
   * the (already reset) `quest_streaks` projection.
   */
  private async returnerCandidates(
    tx: DatabaseTransaction,
    context: DayContext,
    quests: Quest.Row[],
  ): Promise<{ questId: string; preAbsenceStreakDays: number; createdOrder: number; shields: number }[]> {
    const { account } = context;
    if (account.lastActiveDate === null) return [];
    const lastActive = this.dateOf(account.lastActiveDate);
    const history = await this.repository.listQuestLogs(tx, account.id, formatLocalDate(addDays(lastActive, -PRE_ABSENCE_LOOKBACK_DAYS)), account.lastActiveDate);

    const byQuest = new Map<bigint, Set<string>>();
    for (const log of history) {
      if (!isHold(log.state)) continue;
      const dates = byQuest.get(log.questId) ?? new Set<string>();
      dates.add(log.date);
      byQuest.set(log.questId, dates);
    }

    const candidates: { questId: string; preAbsenceStreakDays: number; createdOrder: number; shields: number }[] = [];
    for (const quest of quests) {
      const dates = byQuest.get(quest.id);
      if (!dates) continue;
      let run = 0;
      while (dates.has(formatLocalDate(addDays(lastActive, -run)))) run += 1;
      if (run === 0) continue;
      const streak = await this.repository.lockStreak(tx, account.id, quest.id);
      candidates.push({ questId: String(quest.id), preAbsenceStreakDays: run, createdOrder: Number(quest.id), shields: streak.shields });
    }
    return candidates;
  }

  private async armComeback(tx: DatabaseTransaction, context: DayContext, history: QuestLog.Row[], momentum: MomentumBucket, returnerFired: boolean): Promise<boolean> {
    const { ruleset, account, day, date } = context;
    const recentMisses: RecentMiss[] = history
      .filter(log => log.state === 'missed')
      .map(log => ({ daysAgo: -daysBetween(day, this.dateOf(log.date)), strictness: log.strictness as Strictness }))
      .filter(miss => miss.daysAgo >= 1);

    const arming = evaluateComebackArming(ruleset, { intensityMode: context.intensityMode, momentum, returnerFired, recentMisses });
    if (!arming.armed) return false;

    await this.repository.insertComebackEvent(tx, account.id, date, context.intensityMode, arming.trigger?.kind ?? null);
    return true;
  }

  /** `recovery_quests (account, date)` is the one-per-day cap (PRD §3.6); the spawn is announced to `hero_events` only when the insert actually landed, so a replay grants nothing. */
  private async spawnRecovery(tx: DatabaseTransaction, context: DayContext, quests: Quest.Row[], history: QuestLog.Row[], returnerFired: boolean): Promise<void> {
    const { ruleset, account, day, date } = context;
    const yesterday = formatLocalDate(addDays(day, -1));
    const triggers = history.filter(log => log.date === yesterday && log.state === 'missed' && ruleset.recovery.triggeredByStrictness.includes(log.strictness as Strictness));
    if (triggers.length === 0) return;

    const source = triggers.reduce((best, log) => (Number(log.crownSliceWeight) > Number(best.crownSliceWeight) ? log : best));
    const sourceQuest = quests.find(quest => quest.id === source.questId);

    const recovery = await this.repository.insertRecoveryQuest(tx, account.id, {
      date,
      sourceQuestId: sourceQuest?.id ?? null,
      sourceQuestName: sourceQuest?.name ?? 'A quest you missed',
      triggerLogIds: triggers.map(log => log.id),
      isReturnerDay: returnerFired,
      expiresAt: new Date(startOfLocalDay(addDays(day, 1), context.timeZone)),
    });
    if (!recovery) return;

    await this.heroLedger.grant(tx, account.id, [{ dedupeKey: `recovery_spawned_${date}`, type: 'recovery_spawned', date, questId: sourceQuest?.id, questLogId: source.id }]);
  }

  /** Today's Crown is recomputed, never granted: the endowment audit event and the bank both belong to the day's close, which has not happened yet. */
  private settleCrownForOpenDay(context: DayContext, scheduled: Quest.Row[], todayLogs: QuestLog.Row[]): CrownDayOutcome {
    const { ruleset, day } = context;
    const period = crownPeriodOf(ruleset, crownCadenceFor(ruleset, context.intensityMode), day);
    const crownDay = recomputeCrownDay(
      ruleset,
      scheduled.map(quest => crownWeightFor(ruleset, quest.strictness)),
      todayLogs.filter(log => isBreak(log.state)).map(log => Number(log.crownSliceWeight)),
    );
    return { ...crownDay, periodStart: formatLocalDate(period.start), bankedXp: null, bankedCoins: null };
  }

  private dateOf(value: string): LocalDate {
    const date = parseLocalDate(value);
    if (!date) throw AppError.internal(`rollover read a malformed calendar date '${value}' from the database`);
    return date;
  }
}

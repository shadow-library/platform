/**
 * Importing npm packages
 */
import { and, eq, gte, isNotNull, or } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { HeroLedger } from '@modules/commands';
import {
  type AchievementId,
  addDays,
  currentRuleset,
  formatLocalDate,
  parseLocalDate,
  type ProgressCounters,
  streakTierMinDays,
  type Strictness,
  type TitleId,
  unlockedAchievements,
  unlockedTitles,
} from '@modules/rules';
import { type DatabaseTransaction, schema } from '@server/database';

import { cosmeticsUnlockedByAchievement } from './cosmetic.catalogue';
import { GrantsRepository } from './grants.repository';
import { type CountersEnvelope, ProgressCountersRepository } from './progress-counters.repository';

/**
 * Defining types
 */

export interface QuestCompletionSignal {
  date: string;
  strictness: Strictness;
  isAnchor: boolean;
  priorStreakDays: number;
  postStreakDays: number;
}

/**
 * Declaring the constants
 */

const RESCHEDULE_REASON_WINDOW_DAYS = 90;

/**
 * The incremental Achievement/Title evaluator ARCHITECTURE §26 calls for: every trigger method reads the
 * account's counters row `FOR UPDATE`, folds in one event's worth of state, persists it, and checks the
 * two catalogues against the merged snapshot — all inside the caller's own command transaction, which is
 * already serialized per-account (§11.1), so this needs no locking beyond that row read.
 *
 * Achievements and Titles are checked together because they share the same merged `ProgressCounters`
 * input; `achievements_earned`/`titles_earned` are natural-key `U`s (ARCHITECTURE §10.4), so a predicate
 * re-checked on every later trigger is harmless — it just re-derives "already granted" and no-ops.
 */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly counters: ProgressCountersRepository,
    private readonly grants: GrantsRepository,
    private readonly heroLedger: HeroLedger,
  ) {}

  async onQuestCompletion(tx: DatabaseTransaction, accountId: bigint, signal: QuestCompletionSignal): Promise<void> {
    const ruleset = currentRuleset();
    const silverThreshold = streakTierMinDays(ruleset, 'silver');
    const reachedSilver = signal.priorStreakDays < silverThreshold && signal.postStreakDays >= silverThreshold;

    await this.mutate(tx, accountId, signal.date, envelope => {
      const c = envelope.counters;
      const isNewActiveDay = envelope.lastActiveCountedDate !== signal.date;
      return {
        counters: {
          ...c,
          questsCompleted: c.questsCompleted + 1,
          completionsByStrictness: { ...c.completionsByStrictness, [signal.strictness]: c.completionsByStrictness[signal.strictness] + 1 },
          longestStreakDays: Math.max(c.longestStreakDays, signal.postStreakDays),
          longestAnchorStreakDays: signal.isAnchor ? Math.max(c.longestAnchorStreakDays, signal.postStreakDays) : c.longestAnchorStreakDays,
          questsReachingSilverStreak: c.questsReachingSilverStreak + (reachedSilver ? 1 : 0),
          completionsAfterReturner: envelope.returnerPending ? c.completionsAfterReturner + 1 : c.completionsAfterReturner,
          activeDays: isNewActiveDay ? c.activeDays + 1 : c.activeDays,
        },
        lastActiveCountedDate: isNewActiveDay ? signal.date : envelope.lastActiveCountedDate,
        returnerPending: false,
      };
    });
  }

  async onSubscriptionConfirmed(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({
      ...envelope,
      counters: { ...envelope.counters, subscriptionsConfirmed: envelope.counters.subscriptionsConfirmed + 1 },
    }));
  }

  /** OCR scanning has no command transaction of its own (ARCHITECTURE §14.3's endpoint is a plain authenticated route) — this opens a short-lived one just for the counter/grant write. */
  async onReceiptScanned(accountId: bigint, date: string): Promise<void> {
    await this.counters.transaction(tx =>
      this.mutate(tx, accountId, date, envelope => ({ ...envelope, counters: { ...envelope.counters, receiptsScanned: envelope.counters.receiptsScanned + 1 } })),
    );
  }

  async onCrownBanked(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({ ...envelope, counters: { ...envelope.counters, crownsBanked: envelope.counters.crownsBanked + 1 } }));
  }

  /** Called once per terminalized day (rollover `closeDay`); `first_full_hp_day` (PRD §4.7 #12) is "no missed Quests across a full day" — a day with at least one scheduled occurrence and zero misses. */
  async onDayClosed(tx: DatabaseTransaction, accountId: bigint, date: string, scheduledCount: number, missedCount: number): Promise<void> {
    if (scheduledCount === 0 || missedCount > 0) return;
    await this.mutate(tx, accountId, date, envelope => ({ ...envelope, counters: { ...envelope.counters, fullHpDays: envelope.counters.fullHpDays + 1 } }));
  }

  /** Fires alongside the Returner ritual (rollover `fireReturner`); arms `completionsAfterReturner` for the next hold-state quest completion (the `returner` title, PRD §4.8). */
  async onReturnerFired(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({
      ...envelope,
      counters: { ...envelope.counters, returnerRitualsCompleted: envelope.counters.returnerRitualsCompleted + 1 },
      returnerPending: true,
    }));
  }

  /** A reason tag or note landed on any event — reschedule, skip/postpone, or a quest-log edit (the `reflective_practitioner` title, PRD §4.8). */
  async onReasonTagged(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({ ...envelope, counters: { ...envelope.counters, reasonTaggedEvents: envelope.counters.reasonTaggedEvents + 1 } }));
  }

  /** `honest_planner`'s 90-day window is not a monotonic total (T-12's note), so it re-evaluates the catalogues without changing any stored counter. */
  async onRescheduleReasonLogged(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.evaluate(tx, accountId, date);
  }

  /**
   * Not yet called by any command — Recovery Quest completion is T-20 scope and does not exist in this
   * worktree. Wired ahead of that command landing so `first_recovery_completed`/`restorer` need only a
   * one-line call from wherever T-20's `RecoverQuest`-equivalent handler commits its completion.
   */
  async onRecoveryQuestCompleted(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({
      ...envelope,
      counters: {
        ...envelope.counters,
        completionsByStrictness: { ...envelope.counters.completionsByStrictness, recovery: envelope.counters.completionsByStrictness.recovery + 1 },
      },
    }));
  }

  /** Not yet called by any command — the Comeback claim flow is T-20 scope. See {@link onRecoveryQuestCompleted}. */
  async onComebackBonusClaimed(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({ ...envelope, counters: { ...envelope.counters, comebackBonusesClaimed: envelope.counters.comebackBonusesClaimed + 1 } }));
  }

  /** Not yet called by any command — the Overload/lock mechanic (PRD §4.11) is not built in this worktree. See {@link onRecoveryQuestCompleted}. */
  async onLockedDayCleared(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<void> {
    await this.mutate(tx, accountId, date, envelope => ({ ...envelope, counters: { ...envelope.counters, lockedDaysCleared: envelope.counters.lockedDaysCleared + 1 } }));
  }

  private async mutate(tx: DatabaseTransaction, accountId: bigint, date: string, mutator: (envelope: CountersEnvelope) => CountersEnvelope): Promise<void> {
    const envelope = await this.counters.readForUpdate(tx, accountId);
    const next = mutator(envelope);
    await this.counters.write(tx, accountId, next);
    await this.evaluate(tx, accountId, date, next);
  }

  private async evaluate(tx: DatabaseTransaction, accountId: bigint, date: string, envelope?: CountersEnvelope): Promise<void> {
    const ruleset = currentRuleset();
    const resolved = envelope ?? (await this.counters.readForUpdate(tx, accountId));
    const account = await this.readAccountStats(tx, accountId);
    const reschedulesWithReasonIn90Days = await this.countReschedulesWithReason(tx, accountId, date);

    const progress: ProgressCounters = {
      ...resolved.counters,
      totalXp: account.totalXp,
      level: account.level,
      stats: account.stats,
      reschedulesWithReasonIn90Days,
    };

    const earnedAchievements = await this.grants.listEarnedAchievementIds(tx, accountId);
    for (const achievementId of unlockedAchievements(ruleset, progress, earnedAchievements)) await this.grantAchievement(tx, accountId, achievementId, date);

    const earnedTitles = await this.grants.listEarnedTitleIds(tx, accountId);
    for (const titleId of unlockedTitles(ruleset, progress, earnedTitles as TitleId[])) await this.grants.grantTitle(tx, accountId, titleId);
  }

  private async grantAchievement(tx: DatabaseTransaction, accountId: bigint, achievementId: AchievementId, date: string): Promise<void> {
    const granted = await this.grants.grantAchievement(tx, accountId, achievementId);
    if (!granted) return;
    await this.heroLedger.grant(tx, accountId, [{ dedupeKey: `achievement:${achievementId}`, type: 'achievement_unlock', date, achievementId }]);
    for (const cosmetic of cosmeticsUnlockedByAchievement(achievementId)) await this.grants.unlockCosmetic(tx, accountId, cosmetic.id, cosmetic.kind, 'achievement');
  }

  private async readAccountStats(tx: DatabaseTransaction, accountId: bigint): Promise<{ totalXp: number; level: number; stats: ProgressCounters['stats'] }> {
    const [account] = await tx
      .select({
        totalXp: schema.accounts.totalXp,
        level: schema.accounts.level,
        statDiscipline: schema.accounts.statDiscipline,
        statBody: schema.accounts.statBody,
        statWealth: schema.accounts.statWealth,
        statMind: schema.accounts.statMind,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    if (!account) throw AppError.internal(`ProgressionService addressed account '${accountId}' which does not exist`);
    return {
      totalXp: Number(account.totalXp),
      level: account.level,
      stats: { discipline: account.statDiscipline, body: account.statBody, wealth: account.statWealth, mind: account.statMind },
    };
  }

  private async countReschedulesWithReason(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<number> {
    const today = parseLocalDate(date);
    if (!today) throw AppError.internal(`ProgressionService received a malformed calendar date '${date}'`);
    const since = formatLocalDate(addDays(today, -(RESCHEDULE_REASON_WINDOW_DAYS - 1)));
    const rows = await tx
      .select({ id: schema.rescheduleEvents.id })
      .from(schema.rescheduleEvents)
      .where(
        and(
          eq(schema.rescheduleEvents.accountId, accountId),
          gte(schema.rescheduleEvents.date, since),
          or(isNotNull(schema.rescheduleEvents.reasonTag), isNotNull(schema.rescheduleEvents.reasonNote)),
        ),
      );
    return rows.length;
  }
}

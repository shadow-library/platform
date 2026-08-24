/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { currentRuleset, EMPTY_STREAK_STATE, levelFor, recomputeStreak, type StreakEvent } from '@modules/rules';
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { logMetric, pseudoAccountId } from '@server/telemetry';

import { type AccountMirrorRow, ReconciliationRepository } from './reconciliation.repository';

/**
 * Defining types
 */

interface MirrorDrift {
  accountId: bigint;
  fields: string[];
}

/**
 * Declaring the constants
 */

const DRIFT_SWEEP = 'reconciliation-drift';
const STREAK_SAMPLE_SWEEP = 'reconciliation-streak-sample';
const PRUNE_SWEEP = 'reconciliation-command-log-prune';
const WEDGED_ACCOUNTS_LIMIT = 200;
const DETAIL_LOG_CAP = 20;
const MS_PER_DAY = 86_400_000;

/**
 * ARCHITECTURE §11.4/§26/§30: three independent weekly sweeps, all read-only against the mirrors they
 * check — a detected drift or divergence is an alert, never a write. `hero_events`/`quest_logs` stay the
 * authoritative recomputation source; nothing here ever repairs `accounts`/`quest_streaks` in place.
 *
 * `logMetric`'s `value` field is unreadable in the shipped log stream — `manifestLogRedactionFormat`
 * redacts any top-level `value` key to defend `metric_entries.value` (T-23's numeric health data), and
 * that redaction is name-based, not call-site-aware (`tests/privacy/canary.spec.ts`'s formatter-level
 * case). Every alert here is therefore occurrence-based (the line is only emitted when there's something
 * to page on) rather than a `value > N` comparison — `docs/observability.md` documents this per metric.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, ReconciliationService.name);

  constructor(
    private readonly repository: ReconciliationRepository,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    const cadenceMs = Config.get('reconciliation.sweep-interval-minutes') * 60_000;
    this.scheduler.registerSweep(DRIFT_SWEEP, cadenceMs, () => this.runDriftSweep());
    this.scheduler.registerSweep(STREAK_SAMPLE_SWEEP, cadenceMs, () => this.runStreakSampleSweep());
    this.scheduler.registerSweep(PRUNE_SWEEP, cadenceMs, () => this.runCommandLogPrune());
  }

  /**
   * §11.4's weekly mirror check plus the wedged-rollover surface (T-19's note): both read `accounts`
   * fleet-wide, so they share one sweep tick rather than two passes over the same table.
   */
  async runDriftSweep(): Promise<void> {
    const ruleset = currentRuleset();
    const rows = await this.repository.listAccountMirrors();
    const drifted: MirrorDrift[] = rows.map(row => ({ accountId: row.accountId, fields: this.mismatchedFields(ruleset, row) })).filter(drift => drift.fields.length > 0);

    for (const drift of drifted) {
      logMetric(
        this.logger,
        'Reconciliation: account mirror drift detected',
        'reconciliation.drift',
        1,
        { accountPseudoId: pseudoAccountId(drift.accountId), fields: drift.fields },
        'warn',
      );
    }
    this.logger.info('Reconciliation drift sweep complete', { accountsChecked: rows.length, driftedAccounts: drifted.length });

    const lagDays = Config.get('reconciliation.wedged-last-hp-lag-days');
    const wedged = await this.repository.findWedgedAccounts(lagDays, WEDGED_ACCOUNTS_LIMIT);
    if (wedged.length > 0) {
      logMetric(this.logger, 'Reconciliation: wedged-rollover accounts detected', 'reconciliation.wedged_accounts', wedged.length, {
        lagDays,
        accountPseudoIds: wedged.slice(0, DETAIL_LOG_CAP).map(pseudoAccountId),
      });
    }
  }

  /** Every mismatch this account carries, named for the alert line rather than left as a boolean — the operator's first triage question is always "which field". */
  private mismatchedFields(ruleset: ReturnType<typeof currentRuleset>, row: AccountMirrorRow): string[] {
    const fields: string[] = [];
    if (row.totalXp !== row.sumXp) fields.push('total_xp');
    if (row.coins !== row.sumCoins) fields.push('coins');
    if (row.statDiscipline !== row.sumDiscipline) fields.push('stat_discipline');
    if (row.statBody !== row.sumBody) fields.push('stat_body');
    if (row.statWealth !== row.sumWealth) fields.push('stat_wealth');
    if (row.statMind !== row.sumMind) fields.push('stat_mind');
    if (levelFor(ruleset, Number(row.totalXp)) !== row.level) fields.push('level');
    return fields;
  }

  /**
   * §26's "pure rebuild function in `rules` + weekly reconciliation compare-and-alert" for
   * `quest_streaks`: a random sample is rebuilt from `quest_logs` history via `recomputeStreak` and
   * compared to the live projection. `intensityModeAtLog`/`strictness` come off each log row rather than
   * the quest's current settings, so a later edit to the quest never manufactures a false divergence;
   * `optionalStreakOptIn` has no per-log snapshot and is read at its current value — a quest whose
   * opt-in flag changed after some of its history could show a stale-flag false positive, a known
   * narrower gap than the alternative of rebuilding against nothing at all.
   */
  async runStreakSampleSweep(): Promise<void> {
    const ruleset = currentRuleset();
    const sampleSize = Config.get('reconciliation.streak-sample-size');
    const samples = await this.repository.sampleStreaks(sampleSize);

    const diverged: { accountPseudoId: string; questId: string }[] = [];
    for (const sample of samples) {
      const streakOptIn = await this.repository.findQuestStreakOptIn(sample.questId);
      if (streakOptIn === null) continue;

      const history = await this.repository.listQuestLogHistory(sample.accountId, sample.questId);
      const events: StreakEvent[] = history.map(log => ({
        state: log.state,
        strictness: log.strictness,
        intensityMode: log.intensityModeAtLog,
        streakOptIn,
        onTime: log.state === 'completed',
      }));
      const rebuilt = recomputeStreak(ruleset, events, EMPTY_STREAK_STATE);

      const matches =
        rebuilt.currentDays === sample.currentRunDays &&
        rebuilt.longestDays === sample.bestRunDays &&
        rebuilt.shields === sample.shieldsAvailable &&
        rebuilt.completionsTowardShield === sample.completionsTowardShield;
      if (!matches) diverged.push({ accountPseudoId: pseudoAccountId(sample.accountId), questId: String(sample.questId) });
    }

    this.logger.info('Quest streak sample rebuild-compare complete', { sampled: samples.length, diverged: diverged.length });
    if (diverged.length > 0) {
      logMetric(this.logger, 'Quest streak sample rebuild-compare found a divergence', 'quest_streak.divergence', diverged.length, { sampled: samples.length, diverged }, 'warn');
    }
  }

  /**
   * §11.3: `command_log` beyond retention carries no correctness weight — every grant key is
   * deterministic, so a pruned-and-replayed command still converges through `hero_events`' own
   * dedupe. Batch-limited and bounded per run (`…prune-max-batches`) so a large backlog drains over
   * several sweeps rather than holding row locks for one unbounded delete.
   */
  async runCommandLogPrune(): Promise<void> {
    const retentionDays = Config.get('reconciliation.command-log-retention-days');
    const batchSize = Config.get('reconciliation.command-log-prune-batch-size');
    const maxBatches = Config.get('reconciliation.command-log-prune-max-batches');
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);

    let pruned = 0;
    let batches = 0;
    let removed = batchSize;
    while (removed >= batchSize && batches < maxBatches) {
      removed = await this.repository.pruneCommandLogBatch(cutoff, batchSize);
      pruned += removed;
      batches++;
    }

    logMetric(this.logger, 'command_log prune sweep complete', 'command_log.pruned', pruned, { retentionDays, batches, hitBatchLimit: batches >= maxBatches });
  }
}

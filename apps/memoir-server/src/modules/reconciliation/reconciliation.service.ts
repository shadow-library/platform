import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { currentRuleset, EMPTY_STREAK_STATE, levelFor, recomputeStreak, type StreakEvent } from '@modules/rules';
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { logMetric, pseudoAccountId } from '@server/telemetry';

import { type AccountMirrorRow, ReconciliationRepository } from './reconciliation.repository';

interface MirrorDrift {
  accountId: bigint;
  fields: string[];
}

const DRIFT_SWEEP = 'reconciliation-drift';
const STREAK_SAMPLE_SWEEP = 'reconciliation-streak-sample';
const PRUNE_SWEEP = 'reconciliation-command-log-prune';
const WEDGED_ACCOUNTS_LIMIT = 200;
const DETAIL_LOG_CAP = 20;
const MS_PER_DAY = 86_400_000;

/**
 * Three independent weekly sweeps, all read-only: a detected drift is an alert, never a write. `hero_events`/`quest_logs` stay the
 * authoritative source; nothing repairs `accounts`/`quest_streaks` in place.
 * `logMetric`'s `value` is redacted in shipped logs (`manifestLogRedactionFormat` redacts any top-level `value` key by name), so every alert
 * is occurrence-based, not a `value > N` comparison.
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

  /** The weekly mirror check and the wedged-rollover surface both read `accounts` fleet-wide, so they share one sweep tick. */
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
   * Rebuilds a random sample of `quest_streaks` from `quest_logs` via `recomputeStreak` and compares it to the live projection.
   * `intensityModeAtLog`/`strictness` come from each log row, so later quest edits cause no false divergence;
   * `optionalStreakOptIn` has no per-log snapshot and is read at its current value, so a changed opt-in can yield a stale-flag false positive.
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
   * `command_log` beyond retention carries no correctness weight: grant keys are deterministic, so a pruned-and-replayed command converges through `hero_events` dedupe.
   * Pruning is batch-limited and bounded per run (`…prune-max-batches`) so a large backlog drains over several sweeps.
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

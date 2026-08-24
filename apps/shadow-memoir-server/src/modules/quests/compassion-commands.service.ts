/**
 * Importing npm packages
 */
import { and, eq, inArray } from 'drizzle-orm';
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { CommandBus, type CommandContext, type CommandResult, HeroLedger } from '@modules/commands';
import { addDays, capacityWarningFor, computeCapacity, computeReward, currentRuleset, formatLocalDate, type LocalDate, parseLocalDate, type QuestLogState } from '@modules/rules';
import { RolloverRepository } from '@modules/rollover';
import { AppErrorCode } from '@server/classes';
import { schema } from '@server/database';

/**
 * Declaring the constants
 */

const HOLD_STATES: readonly QuestLogState[] = ['completed', 'partial', 'late', 'recovery'];

/**
 * Registers `recovery.complete` and `plan.setLock` (ARCHITECTURE §10.3, PRD §2.4/§4.3/§4.6). Both
 * mutate `daily_states` outside the rollover walk, so every write goes through `RolloverRepository`'s
 * `rollover_at IS NULL` guard rather than a bespoke one here.
 */
@Injectable()
export class CompassionCommandsService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly heroLedger: HeroLedger,
    private readonly rolloverRepository: RolloverRepository,
  ) {}

  onModuleInit(): void {
    this.commandBus.registerHandler('recovery.complete', ctx => this.completeRecovery(ctx));
    this.commandBus.registerHandler('plan.setLock', ctx => this.setLock(ctx));
  }

  /** Pending-only (PRD §3.6): reward via the ledger, then a P6 second Comeback arming — this time via recovery, lifting the day's fire allowance to 2. */
  private async completeRecovery(ctx: CommandContext): Promise<CommandResult> {
    const ruleset = currentRuleset();
    const date = ctx.envelope.localDate;
    const reflectionText = this.parseReflection(ctx.envelope.payload['reflectionText']);

    const updated = await this.rolloverRepository.completeRecoveryQuest(ctx.tx, ctx.accountId, date, reflectionText);
    if (!updated) {
      const existing = await this.rolloverRepository.findRecoveryForDate(ctx.tx, ctx.accountId, date);
      if (!existing) throw AppErrorCode.RCV_001.create();
      return { status: 'superseded', result: { id: String(existing.id), state: existing.state } };
    }

    const reward = computeReward(ruleset, { strictness: 'recovery', band: 'on_time', completion: 'full', streakDays: 0, lockActive: false, oneShot: 'none' });
    const [grant] = await this.heroLedger.grant(ctx.tx, ctx.accountId, [
      {
        dedupeKey: `recovery_completed_${updated.id}`,
        type: 'recovery_completed',
        date,
        xpDelta: reward.xp,
        coinsDelta: reward.coins,
        questId: updated.sourceQuestId ?? undefined,
      },
    ]);
    if (!grant) throw AppError.internal(`HeroLedger.grant returned no outcome for recovery quest '${updated.id}'`);

    const dailyState = await this.rolloverRepository.lockDailyState(ctx.tx, ctx.accountId, date);
    let comebackReArmed = false;
    if (dailyState && dailyState.rolloverAt === null) {
      const applied = await this.rolloverRepository.updateDailyStateIfOpen(ctx.tx, ctx.accountId, date, { comebackArmed: true, comebackArmedViaRecovery: true });
      if (applied) {
        comebackReArmed = await this.rolloverRepository.insertComebackEvent(ctx.tx, ctx.accountId, date, {
          kind: 're_armed',
          sourceQuestLogId: updated.triggerLogIds[0] ?? null,
          intensityMode: dailyState.intensityMode,
        });
      }
    }

    return {
      status: 'applied',
      result: { id: String(updated.id), state: updated.state, xpAwarded: grant.xpDelta, coinsAwarded: grant.coinsDelta, comebackReArmed },
    };
  }

  /** Open day only (`rollover_at IS NULL`); capacity thresholds are advisory in the result and never refuse the lock (PRD §4.11 — "never blocks"). */
  private async setLock(ctx: CommandContext): Promise<CommandResult> {
    const ruleset = currentRuleset();
    const date = ctx.envelope.localDate;
    const locked = ctx.envelope.payload['locked'] === true;

    const dailyState = await this.rolloverRepository.lockDailyState(ctx.tx, ctx.accountId, date);
    if (!dailyState || dailyState.rolloverAt !== null) throw AppErrorCode.LCK_002.create();

    if (!locked) {
      await this.rolloverRepository.updateDailyStateIfOpen(ctx.tx, ctx.accountId, date, { committedAt: null, lockedQuestIds: [], lockBrokenAt: null });
      return { status: 'applied', result: { locked: false, lockedQuestIds: [] } };
    }

    const questIds = this.parseQuestIds(ctx.envelope.payload['questIds']);
    const owned = await ctx.tx
      .select({ id: schema.quests.id })
      .from(schema.quests)
      .where(and(eq(schema.quests.accountId, ctx.accountId), inArray(schema.quests.id, questIds), eq(schema.quests.active, true)));
    if (owned.length !== questIds.length) throw AppErrorCode.LCK_001.create();

    const day = parseLocalDate(date);
    if (!day) throw AppError.internal(`plan.setLock addressed a malformed local date '${date}'`);
    const capacity = computeCapacity(ruleset, {
      trailingCompletions: await this.trailingCompletions(ctx, day, ruleset.capacity.medianWindowDays),
      momentum: dailyState.momentumBucket,
      priorDayHeavyMiss: false,
    });
    const warning = capacityWarningFor(ruleset, { plannedLoad: questIds.length, capacity: capacity.capacity, onLockAttempt: true, daysSinceLastSoftWarning: null });

    await this.rolloverRepository.updateDailyStateIfOpen(ctx.tx, ctx.accountId, date, { committedAt: new Date(), lockedQuestIds: questIds, lockBrokenAt: null });
    return {
      status: 'applied',
      result: { locked: true, lockedQuestIds: questIds.map(String), capacityWarning: warning, capacity: capacity.capacity, plannedLoad: questIds.length },
    };
  }

  private async trailingCompletions(ctx: CommandContext, day: LocalDate, windowDays: number): Promise<number[]> {
    const from = formatLocalDate(addDays(day, -windowDays));
    const to = formatLocalDate(addDays(day, -1));
    const history = await this.rolloverRepository.listQuestLogs(ctx.tx, ctx.accountId, from, to);
    const counts = new Map<string, number>();
    for (const log of history) {
      if (!HOLD_STATES.includes(log.state)) continue;
      counts.set(log.date, (counts.get(log.date) ?? 0) + 1);
    }
    return [...counts.values()];
  }

  private parseReflection(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new ValidationError('reflectionText', "'reflectionText' must be a string");
    return value;
  }

  private parseQuestIds(value: unknown): bigint[] {
    if (!Array.isArray(value) || value.length === 0) throw new ValidationError('questIds', "'questIds' must be a non-empty array of quest ids");
    return value.map(id => {
      if (typeof id !== 'string' || !/^\d+$/.test(id)) throw new ValidationError('questIds', "'questIds' must contain string quest ids");
      return BigInt(id);
    });
  }
}

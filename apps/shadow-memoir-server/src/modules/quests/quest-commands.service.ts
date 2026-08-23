/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { CommandBus, type CommandContext, type CommandResult, HeroLedger } from '@modules/commands';
import {
  addDays,
  applyStreakEvent,
  clampPerformedAt,
  type CompletionKind,
  computeReward,
  currentRuleset,
  daysBetween,
  formatLocalDate,
  type IntensityMode,
  type LocalDate,
  occursOn,
  parseLocalDate,
  type RecurrenceRule,
  resolveTimingBand,
  type Ruleset,
  type TimeZone,
  type TimingBand,
  zonedFieldsAt,
} from '@modules/rules';
import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource } from '@modules/sync';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type HeroEvent, type Quest, type QuestLog, schema } from '@server/database';

import { type OccurrenceRef, parseOccurrenceId, parseQuestDraft, parseQuestPatch, parseReasonNote, parseReasonTag } from './quest-command.types';
import { QuestLogRepository, type QuestLogWrite } from './quest-log.repository';
import { QuestRepository } from './quest.repository';
import { QuestStreakRepository } from './quest-streak.repository';

/**
 * Defining types
 */

interface AccountSnapshot {
  timezone: TimeZone;
  intensityMode: IntensityMode;
}

interface OccurrenceContext {
  quest: Quest.Row;
  ref: OccurrenceRef;
  occurrenceDate: LocalDate;
}

interface ResolvedTiming {
  band: TimingBand;
  daysElapsed: number;
  performedAt: Date | null;
}

/**
 * Declaring the constants
 */

/** PRD §2.2: the reschedule cap is a command-layer policy, not a versioned reward number, so it does not live in `Ruleset`. */
const RESCHEDULE_CAP_PER_WINDOW = 2;
const RESCHEDULE_WINDOW_DAYS = 7;
const EDIT_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

function requiredMinute(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1439) throw new ValidationError(field, `'${field}' must be an integer between 0 and 1439`);
  return value;
}

function heroEventTypeFor(completion: CompletionKind, band: TimingBand): HeroEvent.Type {
  if (completion === 'partial') return 'quest_partial';
  return band === 'on_time' ? 'quest_complete' : 'quest_late';
}

function logStateFor(completion: CompletionKind, band: TimingBand): QuestLog.State {
  if (completion === 'partial') return 'partial';
  return band === 'on_time' ? 'completed' : 'late';
}

/**
 * Registers the quest CRUD, occurrence-action, and log-edit command handlers (ARCHITECTURE §9.3, §11.2)
 * and the `quests`/`quest_logs`/`quest_streaks` delta sources (moved here from T-16's placeholder in
 * `sync-delta-sources.service.ts` now that this module exists).
 */
@Injectable()
export class QuestCommandsService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly heroLedger: HeroLedger,
    private readonly questRepository: QuestRepository,
    private readonly questLogRepository: QuestLogRepository,
    private readonly questStreakRepository: QuestStreakRepository,
    private readonly deltaRegistry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
  ) {}

  onModuleInit(): void {
    this.commandBus.registerHandler('quest.create', ctx => this.createQuest(ctx));
    this.commandBus.registerHandler('quest.update', ctx => this.updateQuest(ctx));
    this.commandBus.registerHandler('quest.delete', ctx => this.deleteQuest(ctx));
    this.commandBus.registerHandler('quest.complete', ctx => this.resolveCompletion(ctx, 'full'));
    this.commandBus.registerHandler('quest.partial', ctx => this.resolveCompletion(ctx, 'partial'));
    this.commandBus.registerHandler('quest.skip', ctx => this.resolveBreak(ctx, 'skipped'));
    this.commandBus.registerHandler('quest.postpone', ctx => this.resolveBreak(ctx, 'postponed'));
    this.commandBus.registerHandler('quest.reschedule', ctx => this.reschedule(ctx));
    this.commandBus.registerHandler('quest.attachReason', ctx => this.attachReason(ctx));
    this.commandBus.registerHandler('quest.editLog', ctx => this.editQuestLog(ctx));
    this.commandBus.registerHandler('quest.deleteLog', ctx => this.deleteQuestLog(ctx));

    this.deltaRegistry.register(this.keysetSource('quests', schema.quests));
    this.deltaRegistry.register(this.keysetSource('quest_logs', schema.questLogs));
    this.deltaRegistry.register(this.keysetSource('quest_streaks', schema.questStreaks));
  }

  private keysetSource(domain: string, table: Parameters<DeltaRepository['fetchSince']>[0]): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }

  /*!
   * Quest CRUD
   */

  private async createQuest(ctx: CommandContext): Promise<CommandResult> {
    const draft = parseQuestDraft(ctx.envelope.payload);
    if (draft.strictness === 'anchor' && draft.startTimeMinutes === null) throw AppErrorCode.QST_003.create();
    const quest = await this.questRepository.create(ctx.tx, draft);
    const entityRef = ctx.envelope.payload['entityRef'];
    const result: Record<string, unknown> = { id: String(quest.id) };
    if (typeof entityRef === 'string') result['entityRef'] = entityRef;
    return { status: 'applied', result };
  }

  private async updateQuest(ctx: CommandContext): Promise<CommandResult> {
    const questId = this.requireQuestId(ctx.envelope.payload);
    const patch = parseQuestPatch((ctx.envelope.payload['patch'] as Record<string, unknown>) ?? {});
    const quest = await this.questRepository.findByIdForUpdate(ctx.tx, questId);
    if (!quest) throw AppErrorCode.QST_002.create();

    const nextStrictness = patch.strictness ?? quest.strictness;
    const nextStartTime = patch.startTimeMinutes !== undefined ? patch.startTimeMinutes : quest.startTimeMin;
    if (nextStrictness === 'anchor' && nextStartTime === null) throw AppErrorCode.QST_003.create();

    const updated = await this.questRepository.update(ctx.tx, questId, patch);
    if (!updated) throw AppError.internal(`quest '${questId}' vanished mid-transaction`);
    return { status: 'applied', result: { id: String(updated.id) } };
  }

  private async deleteQuest(ctx: CommandContext): Promise<CommandResult> {
    const questId = this.requireQuestId(ctx.envelope.payload);
    const quest = await this.questRepository.softDelete(ctx.tx, questId);
    if (!quest) throw AppErrorCode.QST_002.create();
    return { status: 'applied', result: { id: String(quest.id), active: false } };
  }

  /*!
   * Occurrence actions — the full CompleteQuest/PartialCompleteQuest transaction (ARCHITECTURE §11.2)
   */

  private async resolveCompletion(ctx: CommandContext, completion: CompletionKind): Promise<CommandResult> {
    const ruleset = currentRuleset();
    const occurrence = await this.loadOccurrence(ctx);
    const account = await this.readAccount(ctx.tx, ctx.accountId);
    const timing = this.resolveTiming(ctx, ruleset, occurrence, account);
    const state = logStateFor(completion, timing.band);

    const priorStreak = await this.questStreakRepository.readForUpdate(ctx.tx, occurrence.quest.id);
    const transition = applyStreakEvent(ruleset, priorStreak, {
      state,
      strictness: occurrence.quest.strictness,
      intensityMode: account.intensityMode,
      streakOptIn: occurrence.quest.optionalStreakOptIn,
      onTime: timing.band === 'on_time',
    });
    const postStreakDays = transition.outcome === 'neutral' ? priorStreak.currentDays : transition.state.currentDays;

    const reward = computeReward(ruleset, {
      strictness: occurrence.quest.strictness,
      band: timing.band,
      completion,
      streakDays: postStreakDays,
      lockActive: false,
      oneShot: 'none',
    });

    const write: QuestLogWrite = {
      questId: occurrence.quest.id,
      date: occurrence.ref.date,
      state,
      xpAwarded: reward.xp,
      coinsAwarded: reward.coins,
      statAffinity: occurrence.quest.statAffinity,
      strictness: occurrence.quest.strictness,
      intensityModeAtLog: account.intensityMode,
      crownSliceWeight: ruleset.strictness[occurrence.quest.strictness].crownWeight.toFixed(2),
      rulesetVersion: ruleset.version,
      performedAt: timing.performedAt,
    };
    const log = await this.questLogRepository.upsertTerminal(ctx.tx, write);
    if (!log) return this.convergedResult(occurrence);

    if (transition.outcome !== 'neutral') await this.questStreakRepository.write(ctx.tx, occurrence.quest.id, occurrence.ref.date, transition.state);

    const [grant] = await this.heroLedger.grant(ctx.tx, ctx.accountId, [
      {
        dedupeKey: `${log.id}_xp`,
        type: heroEventTypeFor(completion, timing.band),
        date: occurrence.ref.date,
        xpDelta: reward.xp,
        coinsDelta: reward.coins,
        statAffinity: occurrence.quest.statAffinity,
        statDelta: reward.statTick,
        questId: occurrence.quest.id,
        questLogId: log.id,
        state,
      },
    ]);
    if (!grant) throw AppError.internal(`HeroLedger.grant returned no outcome for quest log '${log.id}'`);

    return {
      status: 'applied',
      result: {
        state,
        logId: String(log.id),
        band: timing.band,
        xpAwarded: grant.xpDelta,
        coinsAwarded: grant.coinsDelta,
        leveledUp: grant.leveledUp,
        levelAfter: grant.levelAfter,
        streak: {
          currentDays: transition.outcome === 'neutral' ? priorStreak.currentDays : transition.state.currentDays,
          shields: transition.outcome === 'neutral' ? priorStreak.shields : transition.state.shields,
        },
        shieldsEarned: transition.shieldsEarned,
        shieldsConsumed: transition.shieldsConsumed,
        milestone: transition.milestone,
      },
    };
  }

  private async resolveBreak(ctx: CommandContext, state: 'skipped' | 'postponed'): Promise<CommandResult> {
    const ruleset = currentRuleset();
    const occurrence = await this.loadOccurrence(ctx);
    if (state === 'postponed' && !ruleset.strictness[occurrence.quest.strictness].allowsPostpone) throw AppErrorCode.QST_005.create();

    const account = await this.readAccount(ctx.tx, ctx.accountId);
    const payload = ctx.envelope.payload;
    const reasonTag = parseReasonTag('reasonTag', payload['reasonTag']);
    const reasonNote = parseReasonNote('note', payload['note']);

    const priorStreak = await this.questStreakRepository.readForUpdate(ctx.tx, occurrence.quest.id);
    const transition = applyStreakEvent(ruleset, priorStreak, {
      state,
      strictness: occurrence.quest.strictness,
      intensityMode: account.intensityMode,
      streakOptIn: occurrence.quest.optionalStreakOptIn,
      onTime: false,
    });

    const write: QuestLogWrite = {
      questId: occurrence.quest.id,
      date: occurrence.ref.date,
      state,
      xpAwarded: 0,
      coinsAwarded: 0,
      statAffinity: occurrence.quest.statAffinity,
      strictness: occurrence.quest.strictness,
      intensityModeAtLog: account.intensityMode,
      crownSliceWeight: ruleset.strictness[occurrence.quest.strictness].crownWeight.toFixed(2),
      rulesetVersion: ruleset.version,
      reasonTag,
      reasonNote,
      postponedToDate: state === 'postponed' ? formatLocalDate(addDays(occurrence.occurrenceDate, 1)) : null,
    };
    const log = await this.questLogRepository.upsertTerminal(ctx.tx, write);
    if (!log) return this.convergedResult(occurrence);

    if (transition.outcome !== 'neutral') await this.questStreakRepository.write(ctx.tx, occurrence.quest.id, occurrence.ref.date, transition.state);

    return {
      status: 'applied',
      result: {
        state,
        logId: String(log.id),
        xpAwarded: 0,
        coinsAwarded: 0,
        streak: {
          currentDays: transition.outcome === 'neutral' ? priorStreak.currentDays : transition.state.currentDays,
          shields: transition.outcome === 'neutral' ? priorStreak.shields : transition.state.shields,
        },
        shieldsConsumed: transition.shieldsConsumed,
        announceBreak: transition.announceBreak,
        endedAtDays: transition.endedAtDays,
      },
    };
  }

  private async reschedule(ctx: CommandContext): Promise<CommandResult> {
    const ruleset = currentRuleset();
    const occurrence = await this.loadOccurrence(ctx);
    const schedulingModel = ruleset.strictness[occurrence.quest.strictness].schedulingModel;
    if (schedulingModel === 'day_level') throw AppErrorCode.QST_008.create();

    const payload = ctx.envelope.payload;
    const toMin = requiredMinute('toMin', payload['toMin']);
    const acceptBeyondCap = payload['acceptBeyondCap'] === true;
    const reasonTag = parseReasonTag('reasonTag', payload['reasonTag']);
    const reasonNote = parseReasonNote('note', payload['note']);

    const windowStart = formatLocalDate(addDays(occurrence.occurrenceDate, -(RESCHEDULE_WINDOW_DAYS - 1)));
    const usedInWindow = await this.questLogRepository.rescheduleCountInWindow(ctx.tx, occurrence.quest.id, windowStart);

    if (usedInWindow >= RESCHEDULE_CAP_PER_WINDOW && !acceptBeyondCap) {
      return {
        status: 'rejected',
        result: { kind: 'reschedule-cap', rescheduleCap: RESCHEDULE_CAP_PER_WINDOW, rescheduleCountInWindow: usedInWindow },
      };
    }

    if (usedInWindow >= RESCHEDULE_CAP_PER_WINDOW) {
      const postponed = await this.resolveBreak(ctx, 'postponed');
      return { status: postponed.status, result: { ...postponed.result, reclassifiedAsPostpone: true } };
    }

    const account = await this.readAccount(ctx.tx, ctx.accountId);
    await this.questLogRepository.insertRescheduleEvent(ctx.tx, {
      questId: occurrence.quest.id,
      date: occurrence.ref.date,
      fromMin: occurrence.quest.startTimeMin,
      toMin,
      reasonTag,
      reasonNote,
    });

    const write: QuestLogWrite = {
      questId: occurrence.quest.id,
      date: occurrence.ref.date,
      state: 'rescheduled',
      xpAwarded: 0,
      coinsAwarded: 0,
      statAffinity: occurrence.quest.statAffinity,
      strictness: occurrence.quest.strictness,
      intensityModeAtLog: account.intensityMode,
      crownSliceWeight: ruleset.strictness[occurrence.quest.strictness].crownWeight.toFixed(2),
      rulesetVersion: ruleset.version,
      rescheduledToMin: toMin,
    };
    const log = await this.questLogRepository.upsertReschedule(ctx.tx, write);
    if (!log) return this.convergedResult(occurrence);

    return {
      status: 'applied',
      result: { state: 'rescheduled', logId: String(log.id), rescheduledToMin: toMin, rescheduleCountInWindow: usedInWindow + 1, rescheduleCap: RESCHEDULE_CAP_PER_WINDOW },
    };
  }

  /*!
   * Quest-log edits (PRD §3.3 — 7-day window, terminal fields immutable)
   */

  private async attachReason(ctx: CommandContext): Promise<CommandResult> {
    const payload = ctx.envelope.payload;
    const reasonTag = parseReasonTag('reasonTag', payload['reasonTag']);
    const reasonNote = parseReasonNote('note', payload['note']);
    if (reasonTag === null && reasonNote === null) throw new ValidationError('reasonTag', 'Provide a reason tag or a note to attach');

    const log = await this.loadEditableLog(ctx);
    const updated = await this.questLogRepository.attachReason(ctx.tx, log.id, { reasonTag, reasonNote });
    if (!updated) throw AppError.internal(`quest log '${log.id}' vanished mid-transaction`);
    return { status: 'applied', result: { logId: String(updated.id), reasonTag: updated.reasonTag, reasonNote: updated.reasonNote } };
  }

  private async editQuestLog(ctx: CommandContext): Promise<CommandResult> {
    const payload = ctx.envelope.payload;
    const fields: { reasonTag?: QuestLog.ReasonTag | null; reasonNote?: string | null; reflectionText?: string | null } = {};
    if (payload['reasonTag'] !== undefined) fields.reasonTag = parseReasonTag('reasonTag', payload['reasonTag']);
    if (payload['note'] !== undefined) fields.reasonNote = parseReasonNote('note', payload['note']);
    if (payload['reflectionText'] !== undefined) fields.reflectionText = payload['reflectionText'] === null ? null : String(payload['reflectionText']);

    const log = await this.loadEditableLog(ctx);
    const updated = await this.questLogRepository.attachReason(ctx.tx, log.id, fields);
    if (!updated) throw AppError.internal(`quest log '${log.id}' vanished mid-transaction`);
    return { status: 'applied', result: { logId: String(updated.id), reasonTag: updated.reasonTag, reasonNote: updated.reasonNote, reflectionText: updated.reflectionText } };
  }

  /** Deletion carries no time window — a deliberate data-ownership stance (ARCHITECTURE §10.3) — and never touches `hero_events`. */
  private async deleteQuestLog(ctx: CommandContext): Promise<CommandResult> {
    const ref = parseOccurrenceId(ctx.envelope.payload);
    const log = await this.questLogRepository.findByOccurrence(ref.questId, ref.date);
    if (!log) throw AppErrorCode.QST_007.create();
    const removed = await this.questLogRepository.remove(ctx.tx, log.id);
    if (!removed) throw AppErrorCode.QST_007.create();
    return { status: 'applied', result: { logId: String(log.id), deleted: true } };
  }

  /*!
   * Shared helpers
   */

  private requireQuestId(payload: Record<string, unknown>): bigint {
    const value = payload['questId'];
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new ValidationError('questId', "'questId' is required");
    return BigInt(value);
  }

  private async loadOccurrence(ctx: CommandContext): Promise<OccurrenceContext> {
    const ref = parseOccurrenceId(ctx.envelope.payload);
    const quest = await this.questRepository.findByIdForUpdate(ctx.tx, ref.questId);
    if (!quest || !quest.active) throw AppErrorCode.QST_002.create();
    const occurrenceDate = parseLocalDate(ref.date);
    if (!occurrenceDate || !occursOn(quest.recurrence as RecurrenceRule, occurrenceDate)) throw AppErrorCode.QST_004.create({ date: ref.date });
    return { quest, ref, occurrenceDate };
  }

  private async loadEditableLog(ctx: CommandContext): Promise<QuestLog.Row> {
    const ref = parseOccurrenceId(ctx.envelope.payload);
    const log = await this.questLogRepository.findByOccurrence(ref.questId, ref.date);
    if (!log) throw AppErrorCode.QST_007.create();
    const ageMs = Date.now() - log.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_DAYS * MS_PER_DAY) throw AppErrorCode.QST_006.create();
    return log;
  }

  private async readAccount(tx: DatabaseTransaction, accountId: bigint): Promise<AccountSnapshot> {
    const [account] = await tx
      .select({ timezone: schema.accounts.timezone, intensityMode: schema.accounts.intensityMode })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    if (!account) throw AppErrorCode.QST_002.create();
    return account as AccountSnapshot;
  }

  /**
   * §12.5: online commands ignore client time and use server `now()`; an offline `performedAt` is
   * clamped to `[occurrenceDateStart, serverNow]` (`lastAckedSyncAt` is left `null`, i.e. the clamp's
   * lower bound falls back to the occurrence's own start of day — see the module report on why the
   * device's exact last-sync instant isn't threaded in yet).
   */
  private resolveTiming(ctx: CommandContext, ruleset: Ruleset, occurrence: OccurrenceContext, account: AccountSnapshot): ResolvedTiming {
    let daysElapsed: number;
    let minuteOfDay: number;
    let performedAt: Date | null;

    if (ctx.envelope.performedAt) {
      const clamp = clampPerformedAt({
        performedAt: new Date(ctx.envelope.performedAt).getTime(),
        serverNow: Date.now(),
        lastAckedSyncAt: null,
        occurrenceDate: occurrence.occurrenceDate,
        timeZone: account.timezone,
      });
      daysElapsed = clamp.daysElapsed;
      minuteOfDay = clamp.minuteOfDay;
      performedAt = new Date(clamp.instant);
    } else {
      const fields = zonedFieldsAt(Date.now(), account.timezone);
      daysElapsed = daysBetween(occurrence.occurrenceDate, fields.date);
      minuteOfDay = fields.minuteOfDay;
      performedAt = null;
    }

    const band = resolveTimingBand(ruleset, {
      strictness: occurrence.quest.strictness,
      startMinute: occurrence.quest.startTimeMin,
      durationMinutes: occurrence.quest.durationMin,
      daysElapsed,
      minuteOfDay,
    });
    return { band, daysElapsed, performedAt };
  }

  /** §11.3: the second of two racing terminal actions reads back whatever actually won and reports it as `superseded`, never erroring. */
  private async convergedResult(occurrence: OccurrenceContext): Promise<CommandResult> {
    const existing = await this.questLogRepository.findByOccurrence(occurrence.quest.id, occurrence.ref.date);
    if (!existing) throw AppErrorCode.QST_002.create();
    return {
      status: 'superseded',
      result: { state: existing.state, logId: String(existing.id), xpAwarded: existing.xpAwarded, coinsAwarded: existing.coinsAwarded },
    };
  }
}

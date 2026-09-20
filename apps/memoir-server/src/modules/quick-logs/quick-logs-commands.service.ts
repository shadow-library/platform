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
import { formatLocalDate, localDateAt, type TimeZone } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type Meal, type Quest, schema } from '@server/database';
import { pseudoAccountId, TelemetryService } from '@server/telemetry';

import { deriveCapAdvisory, serializeCapAdvisory } from './entry-cap';
import { type JournalEntryDraft, JournalRepository } from './journal.repository';
import { type MealDraft, MealRepository } from './meal.repository';
import { type MealPresetDraft, MealPresetRepository } from './meal-preset.repository';
import { findLinkageMatch, serializeLinkageMatch } from './quest-linkage';
import { type SideQuestDraft, SideQuestRepository } from './side-quest.repository';
import { WeightRepository } from './weight.repository';

/**
 * Defining types
 */

interface RewardOutcome {
  rewarded: boolean;
  xpAwarded: number;
  coinsAwarded: number;
}

/**
 * Declaring the constants
 */

const JOURNAL_SAVE = 'journal.save';
const MEAL_LOG = 'meal.log';
const MEAL_LOG_PRESET = 'meal.logPreset';
const MEAL_PRESET_CREATE = 'meal.savePreset';
const MEAL_PRESET_UPDATE = 'meal.preset.update';
const MEAL_PRESET_DELETE = 'meal.preset.delete';
const WEIGHT_SAVE = 'weight.save';
const SIDEQUEST_LOG = 'sidequest.log';

const MEAL_TYPES: readonly Meal.MealType[] = ['cooked', 'ate_out'];
const STAT_AFFINITIES: readonly Quest.StatAffinity[] = ['discipline', 'body', 'wealth', 'mind'];

const JOURNAL_XP = 5;
const MEAL_XP = 3;
const WEIGHT_XP = 3;
const SIDE_QUEST_XP = 8;
const SIDE_QUEST_COINS = 1;
const SIDE_QUEST_DAILY_REWARD_LIMIT = 3;

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) throw new ValidationError(field, `'${field}' is required`);
  return value;
}

function optionalString(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];
  return typeof value === 'string' ? value : undefined;
}

function requireEnum<T extends string>(payload: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requireString(payload, field);
  if (!(allowed as readonly string[]).includes(value)) throw new ValidationError(field, `'${field}' must be one of ${allowed.join(', ')}`);
  return value as T;
}

function requireNonNegativeInteger(payload: Record<string, unknown>, field: string): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) throw new ValidationError(field, `'${field}' must be a non-negative integer`);
  return value;
}

function requireObject(payload: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = payload[field];
  if (typeof value !== 'object' || value === null) throw new ValidationError(field, `'${field}' is required`);
  return value as Record<string, unknown>;
}

function optionalMood(payload: Record<string, unknown>): number | null {
  const value = payload['mood'];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) throw new ValidationError('mood', "'mood' must be an integer between 1 and 5");
  return value;
}

function optionalTags(payload: Record<string, unknown>): string[] | null {
  const value = payload['tags'];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || !value.every(tag => typeof tag === 'string')) throw new ValidationError('tags', "'tags' must be an array of strings");
  return value;
}

function requireKg(payload: Record<string, unknown>): string {
  const value = payload['kg'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new ValidationError('kg', "'kg' must be a positive number");
  return value.toFixed(2);
}

/**
 * Registers `LogJournal`/`LogMeal`/`LogWeight`/`LogSideQuest` and meal-preset CRUD (ARCHITECTURE §10.3,
 * PRD §2.6, §3.9, §4.12–4.13). Every reward path routes through {@link HeroLedger} with a first-of-day
 * dedupe key (`journal_{date}`, `meal_{date}`, `weight_{date}`, `sidequest_{date}_{ordinal}` — PRD §4.12
 * verbatim), so a replay or a second device racing the same day's first entry converges to exactly one
 * grant without any bespoke locking here — the unique `(account_id, dedupe_key)` constraint is the whole
 * mechanism. A backdated entry (`date` behind the account's local today) and an entry whose module links
 * to an eligible, not-yet-completed or already-completed Quest occurrence both skip the `HeroLedger.grant`
 * call entirely rather than granting and hoping to net it out later — `hero_events` is append-only, so
 * "never call it" is the only sound way to guarantee zero deltas or "no double grant" (PRD §2.6/§4.12).
 */
@Injectable()
export class QuickLogsCommandsService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly heroLedger: HeroLedger,
    private readonly journalRepository: JournalRepository,
    private readonly mealRepository: MealRepository,
    private readonly mealPresetRepository: MealPresetRepository,
    private readonly weightRepository: WeightRepository,
    private readonly sideQuestRepository: SideQuestRepository,
    private readonly telemetry: TelemetryService,
  ) {}

  onModuleInit(): void {
    this.commandBus.registerHandler(JOURNAL_SAVE, ctx => this.saveJournal(ctx));
    this.commandBus.registerHandler(MEAL_LOG, ctx => this.logMeal(ctx));
    this.commandBus.registerHandler(MEAL_LOG_PRESET, ctx => this.logMealFromPreset(ctx));
    this.commandBus.registerHandler(MEAL_PRESET_CREATE, ctx => this.createMealPreset(ctx));
    this.commandBus.registerHandler(MEAL_PRESET_UPDATE, ctx => this.updateMealPreset(ctx));
    this.commandBus.registerHandler(MEAL_PRESET_DELETE, ctx => this.deleteMealPreset(ctx));
    this.commandBus.registerHandler(WEIGHT_SAVE, ctx => this.saveWeight(ctx));
    this.commandBus.registerHandler(SIDEQUEST_LOG, ctx => this.logSideQuest(ctx));
  }

  /*!
   * Journal
   */

  private async saveJournal({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const draftPayload = requireObject(envelope.payload, 'draft');
    const draft: JournalEntryDraft = {
      id: requireString(envelope.payload, 'id'),
      date: requireString(draftPayload, 'date'),
      text: requireString(draftPayload, 'text'),
      mood: optionalMood(draftPayload),
      tags: optionalTags(draftPayload),
    };

    const timezone = await this.timezoneOf(tx, accountId);
    const today = this.todayLocal(timezone);
    const backdated = draft.date !== today;
    const linkage = backdated ? null : await findLinkageMatch(tx, accountId, 'journal', draft.date);

    const reward = await this.grantFirstOfDay(tx, accountId, 'journal', draft.date, backdated, linkage !== null, JOURNAL_XP, 0);
    const entry = await this.journalRepository.create(tx, draft, reward.rewarded);

    const used = await this.journalRepository.countInRange(tx, this.monthStart(today), this.monthEnd(today));
    this.emitQuickLog(accountId, 'journal', reward.rewarded, backdated, linkage !== null);

    return {
      status: 'applied',
      result: {
        id: entry.id,
        rewarded: reward.rewarded,
        xpAwarded: reward.xpAwarded,
        coinsAwarded: reward.coinsAwarded,
        statTicked: false,
        linkageOffer: linkage ? serializeLinkageMatch(linkage) : null,
        advisory: serializeCapAdvisory(deriveCapAdvisory('journal', used)),
      },
    };
  }

  /*!
   * Meals
   */

  private async logMeal({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const draftPayload = requireObject(envelope.payload, 'draft');
    const draft: MealDraft = {
      id: requireString(envelope.payload, 'id'),
      date: requireString(draftPayload, 'date'),
      name: requireString(draftPayload, 'name'),
      calories: requireNonNegativeInteger(draftPayload, 'calories'),
      mealType: requireEnum(draftPayload, 'mealType', MEAL_TYPES),
      note: optionalString(draftPayload, 'note') ?? null,
      presetId: null,
    };
    return this.recordMeal(accountId, tx, draft);
  }

  private async logMealFromPreset({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const presetId = BigInt(requireString(payload, 'presetId'));
    const date = requireString(payload, 'date');
    const preset = await this.mealPresetRepository.findByIdInTx(tx, presetId);
    if (!preset) throw AppErrorCode.QLG_001.create();

    const draft: MealDraft = {
      id: requireString(payload, 'id'),
      date,
      name: preset.name,
      calories: preset.calories,
      mealType: preset.mealType,
      note: preset.note,
      presetId: preset.id,
    };
    return this.recordMeal(accountId, tx, draft);
  }

  private async recordMeal(accountId: bigint, tx: DatabaseTransaction, draft: MealDraft): Promise<CommandResult> {
    const timezone = await this.timezoneOf(tx, accountId);
    const today = this.todayLocal(timezone);
    const backdated = draft.date !== today;
    const linkage = backdated ? null : await findLinkageMatch(tx, accountId, 'meal', draft.date);

    const reward = await this.grantFirstOfDay(tx, accountId, 'meal', draft.date, backdated, linkage !== null, MEAL_XP, 0);
    const meal = await this.mealRepository.create(tx, draft, reward.rewarded);

    const used = await this.mealRepository.countInRange(tx, this.monthStart(today), this.monthEnd(today));
    this.emitQuickLog(accountId, 'meal', reward.rewarded, backdated, linkage !== null);

    return {
      status: 'applied',
      result: {
        id: meal.id,
        rewarded: reward.rewarded,
        xpAwarded: reward.xpAwarded,
        coinsAwarded: reward.coinsAwarded,
        statTicked: false,
        linkageOffer: linkage ? serializeLinkageMatch(linkage) : null,
        advisory: serializeCapAdvisory(deriveCapAdvisory('meals', used)),
      },
    };
  }

  private async createMealPreset({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const presetPayload = requireObject(envelope.payload, 'preset');
    const draft: MealPresetDraft = {
      name: requireString(presetPayload, 'name'),
      calories: requireNonNegativeInteger(presetPayload, 'calories'),
      mealType: requireEnum(presetPayload, 'mealType', MEAL_TYPES),
      note: optionalString(presetPayload, 'note') ?? null,
    };
    const preset = await this.mealPresetRepository.create(tx, draft);
    return { status: 'applied', result: { id: String(preset.id) } };
  }

  private async updateMealPreset({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const id = BigInt(requireString(payload, 'id'));
    const patchPayload = requireObject(payload, 'patch');

    const patch: Partial<MealPresetDraft> = {};
    if ('name' in patchPayload) patch.name = requireString(patchPayload, 'name');
    if ('calories' in patchPayload) patch.calories = requireNonNegativeInteger(patchPayload, 'calories');
    if ('mealType' in patchPayload) patch.mealType = requireEnum(patchPayload, 'mealType', MEAL_TYPES);
    if ('note' in patchPayload) patch.note = optionalString(patchPayload, 'note') ?? null;

    const preset = await this.mealPresetRepository.update(tx, id, patch);
    if (!preset) throw AppErrorCode.QLG_001.create();
    return { status: 'applied', result: { id: String(preset.id) } };
  }

  private async deleteMealPreset({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const id = BigInt(requireString(envelope.payload, 'id'));
    const preset = await this.mealPresetRepository.remove(tx, id);
    if (!preset) throw AppErrorCode.QLG_001.create();
    return { status: 'applied', result: { id: String(preset.id) } };
  }

  /*!
   * Weight
   */

  private async saveWeight({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const date = requireString(payload, 'date');
    const kg = requireKg(payload);
    const confirmedReplacement = payload['confirmedReplacement'] === true;

    const existing = await this.weightRepository.findForDate(tx, date);
    if (existing && !confirmedReplacement) {
      return {
        status: 'rejected',
        result: { kind: 'needs-confirmation', existing: { date: existing.date, kg: existing.kg, loggedAt: existing.loggedAt.toISOString() } },
      };
    }

    if (existing) {
      const updated = await this.weightRepository.replace(tx, date, kg);
      if (!updated) throw AppError.internal(`weight row for date '${date}' vanished mid-transaction`);
      return { status: 'applied', result: { date, rewarded: updated.rewarded, xpAwarded: 0, coinsAwarded: 0, statTicked: false, linkageOffer: null, replaced: true } };
    }

    const timezone = await this.timezoneOf(tx, accountId);
    const today = this.todayLocal(timezone);
    const backdated = date !== today;
    const linkage = backdated ? null : await findLinkageMatch(tx, accountId, 'weight', date);

    const reward = await this.grantFirstOfDay(tx, accountId, 'weight', date, backdated, linkage !== null, WEIGHT_XP, 0);
    const entry = await this.weightRepository.create(tx, date, kg, reward.rewarded);

    const used = await this.weightRepository.countInRange(tx, this.monthStart(today), this.monthEnd(today));
    this.emitQuickLog(accountId, 'weight', reward.rewarded, backdated, linkage !== null);

    return {
      status: 'applied',
      result: {
        date: entry.date,
        rewarded: reward.rewarded,
        xpAwarded: reward.xpAwarded,
        coinsAwarded: reward.coinsAwarded,
        statTicked: false,
        linkageOffer: linkage ? serializeLinkageMatch(linkage) : null,
        replaced: false,
        advisory: serializeCapAdvisory(deriveCapAdvisory('weight', used)),
      },
    };
  }

  /*!
   * Side quests
   */

  private async logSideQuest({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const draftPayload = requireObject(envelope.payload, 'draft');
    const draft: SideQuestDraft = {
      id: requireString(envelope.payload, 'id'),
      date: requireString(draftPayload, 'date'),
      name: requireString(draftPayload, 'name'),
      statAffinity: 'statAffinity' in draftPayload ? requireEnum(draftPayload, 'statAffinity', STAT_AFFINITIES) : null,
    };

    const timezone = await this.timezoneOf(tx, accountId);
    const today = this.todayLocal(timezone);
    const backdated = draft.date !== today;

    let reward: RewardOutcome = { rewarded: false, xpAwarded: 0, coinsAwarded: 0 };
    if (!backdated) {
      const rewardedToday = await this.sideQuestRepository.countRewardedOn(tx, draft.date);
      if (rewardedToday < SIDE_QUEST_DAILY_REWARD_LIMIT) reward = await this.grantSideQuest(tx, accountId, draft, rewardedToday + 1);
    }
    const statTicked = reward.rewarded ? 1 : 0;

    const entry = await this.sideQuestRepository.create(tx, draft, { xpAwarded: reward.xpAwarded, coinsAwarded: reward.coinsAwarded, statTicked, rewarded: reward.rewarded });
    const used = await this.sideQuestRepository.countInRange(tx, this.monthStart(today), this.monthEnd(today));
    this.emitQuickLog(accountId, 'side_quest', reward.rewarded, backdated, false);

    return {
      status: 'applied',
      result: {
        id: entry.id,
        rewarded: reward.rewarded,
        xpAwarded: reward.xpAwarded,
        coinsAwarded: reward.coinsAwarded,
        statTicked: statTicked === 1,
        advisory: serializeCapAdvisory(deriveCapAdvisory('sidequests', used)),
      },
    };
  }

  /*!
   * Shared helpers
   */

  /**
   * Journal/meal/weight all share this shape: one grant per day, keyed `{module}_{date}` (PRD §4.12).
   * Never calls `HeroLedger` at all when the entry is backdated or module-linked to an eligible Quest
   * occurrence — `hero_events` is append-only, so skipping the call is the only way to guarantee a zero
   * delta rather than granting and trying to claw it back.
   */
  private async grantFirstOfDay(
    tx: DatabaseTransaction,
    accountId: bigint,
    module: 'journal' | 'meal' | 'weight',
    date: string,
    backdated: boolean,
    linked: boolean,
    xp: number,
    coins: number,
  ): Promise<RewardOutcome> {
    if (backdated || linked) return { rewarded: false, xpAwarded: 0, coinsAwarded: 0 };

    const [grant] = await this.heroLedger.grant(tx, accountId, [{ dedupeKey: `${module}_${date}`, type: module, date, xpDelta: xp, coinsDelta: coins }]);
    if (!grant) throw AppError.internal(`HeroLedger.grant returned no outcome for '${module}_${date}'`);
    const applied = grant.status === 'applied';
    return { rewarded: applied, xpAwarded: applied ? grant.xpDelta : 0, coinsAwarded: applied ? grant.coinsDelta : 0 };
  }

  /** The PRD §4.12 first-3 rule: `ordinal` (1–3) is this call's slot for the day, dedupe-keyed so a replay of the same command never re-grants a slot it already claimed. */
  private async grantSideQuest(tx: DatabaseTransaction, accountId: bigint, draft: SideQuestDraft, ordinal: number): Promise<RewardOutcome> {
    const [grant] = await this.heroLedger.grant(tx, accountId, [
      {
        dedupeKey: `sidequest_${draft.date}_${ordinal}`,
        type: 'side_quest',
        date: draft.date,
        xpDelta: SIDE_QUEST_XP,
        coinsDelta: SIDE_QUEST_COINS,
        statAffinity: draft.statAffinity ?? undefined,
        statDelta: 1,
      },
    ]);
    if (!grant) throw AppError.internal(`HeroLedger.grant returned no outcome for side quest '${draft.id}'`);
    const applied = grant.status === 'applied';
    return { rewarded: applied, xpAwarded: applied ? grant.xpDelta : 0, coinsAwarded: applied ? grant.coinsDelta : 0 };
  }

  private async timezoneOf(tx: DatabaseTransaction, accountId: bigint): Promise<TimeZone> {
    const [account] = await tx.select({ timezone: schema.accounts.timezone }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    if (!account) throw AppError.internal(`quick-log command addressed account '${accountId}' which does not exist`);
    return account.timezone as TimeZone;
  }

  private todayLocal(timezone: TimeZone): string {
    return formatLocalDate(localDateAt(Date.now(), timezone));
  }

  private monthStart(today: string): string {
    return `${today.slice(0, 7)}-01`;
  }

  private monthEnd(today: string): string {
    return today;
  }

  private emitQuickLog(accountId: bigint, module: 'journal' | 'meal' | 'weight' | 'side_quest', rewarded: boolean, backdated: boolean, linked: boolean): void {
    this.telemetry.emit({ name: 'quick_log_recorded', pseudoId: pseudoAccountId(accountId), occurredAtMs: Date.now(), module, rewarded, backdated, linked });
  }
}

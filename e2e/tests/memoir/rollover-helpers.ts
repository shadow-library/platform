/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { memoirDb } from '../../lib';
import { type MemoirHarness, type MemoirPersona } from './fixtures';
import { dailyQuestDraft, memoirMutate, pullDelta, submitCommand } from './helpers';

/**
 * Defining types
 */

export type Strictness = 'anchor' | 'routine' | 'goal' | 'optional';
export type IntensityMode = 'standard' | 'low_intensity' | 'high_intensity';
export type QuestLogState = 'completed' | 'partial' | 'late' | 'recovery' | 'missed' | 'skipped' | 'postponed';

export interface RolloverQuestSpec {
  strictness: Strictness;
  startDate: string;
  name?: string;
  /** Required by an anchor; defaults to 08:00 for one. */
  startTimeMinutes?: number;
  /** Replaces the open-ended daily rule `dailyQuestDraft` builds. */
  recurrence?: Record<string, unknown>;
}

export interface RolloverSubject {
  readonly persona: MemoirPersona;
  readonly ctx: APIRequestContext;
  readonly accountId: string;
  readonly timeZone: string;
}

export interface AccountSettings {
  timezone?: string;
  intensityMode?: IntensityMode;
  returnerThresholdDays?: number;
  lastActiveDate?: string | null;
}

export interface RolloverAccountRow {
  lastHpDate: string | null;
  lastActiveDate: string | null;
  timezone: string;
  pendingTimezone: string | null;
  intensityMode: IntensityMode;
  pendingIntensityMode: IntensityMode | null;
  hpToday: number;
  hpStartToday: number;
  hpMax: number;
  totalXp: number;
  coins: number;
  pendingReturnerShields: number;
}

export interface DailyStateRow {
  date: string;
  intensityMode: IntensityMode;
  hpStart: number;
  hpEnd: number;
  hpMax: number;
  crownXpGranted: number;
  crownXpRemaining: number;
  crownCoinsGranted: number;
  crownCoinsRemaining: number;
  crownPeriodStart: string;
  crownBankedXp: number | null;
  crownBankedCoins: number | null;
  comebackArmed: boolean;
  returnerActive: boolean;
  returnerFired: boolean;
  missedCount: number;
  rolloverAt: Date | null;
}

export interface QuestLogRow {
  id: string;
  questId: string;
  date: string;
  state: QuestLogState;
  intensityModeAtLog: IntensityMode;
}

export interface RecoveryQuestRow {
  id: string;
  date: string;
  state: 'pending' | 'completed' | 'expired';
  sourceQuestId: string | null;
  triggerLogIds: string[];
  isReturnerDay: boolean;
  expiresAt: Date;
}

export interface ComebackEventRow {
  date: string;
  kind: string;
  triggerKind: string | null;
}

export interface ReturnerEventRow {
  date: string;
  lastActiveDate: string | null;
  daysAbsent: number;
  shieldTargetQuestId: string | null;
  shieldPending: boolean;
}

export interface HeroEventRow {
  type: string;
  date: string;
  questId: string | null;
  xpDelta: number;
  coinsDelta: number;
}

export interface QuestStreakRow {
  currentRunDays: number;
  shieldsAvailable: number;
  pendingShieldGrant: number;
}

export interface MissedAnchorRig extends RolloverSubject {
  readonly today: string;
  readonly yesterday: string;
  readonly anchorQuestId: string;
}

/**
 * Declaring the constants
 *
 * The rollover seeding rig. Rollover runs in-request (`RolloverGate`, before every command batch and delta pull) and walks
 * from `accounts.last_hp_date + 1`: every elapsed day is closed in its own transaction, then today is prepared. A spec
 * arranges "elapsed days" by rewinding `last_hp_date` to a terminalized day and removing the `daily_states` rows after
 * it, so the next pull closes those days from scratch under whatever quests, logs and account settings the spec seeded.
 * Leaving `last_hp_date`'s own day closed keeps the arrangement valid whether the walk resumes after that day or first
 * closes it when still open.
 */

const MS_PER_DAY = 86_400_000;
const DEFAULT_ANCHOR_START_MIN = 480;

export class RolloverRigError extends Error {
  override readonly name = 'RolloverRigError';
}

/** Today's calendar date in `timeZone`, the same `YYYY-MM-DD` rollover stamps on `daily_states.date`. */
export function localToday(timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Every date from `from` to `to`, both inclusive. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** ISO weekday, Monday = 1 … Sunday = 7 — the numbering the ruleset's weekly Crown anchor uses. */
export function isoWeekday(date: string): number {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** The instant `date` begins in `timeZone`, found by walking the UTC hours around it — enough for every whole-hour or half-hour zone. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const fromUtc = Date.parse(`${date}T00:00:00Z`);
  for (let minutes = -16 * 60; minutes <= 16 * 60; minutes += 15) {
    const instant = new Date(fromUtc + minutes * 60_000);
    if (localDateOf(instant, timeZone) === date) return instant;
  }
  throw new RolloverRigError(`could not locate the start of ${date} in ${timeZone}`);
}

export function localDayLengthMinutes(date: string, timeZone: string): number {
  return (startOfLocalDay(addDays(date, 1), timeZone).getTime() - startOfLocalDay(date, timeZone).getTime()) / 60_000;
}

function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** A `quest.create` payload for `spec`, built on `dailyQuestDraft` so a spec only states what differs. */
export function questDraft(spec: RolloverQuestSpec): Record<string, unknown> {
  const name = spec.name ?? `E2E rollover ${spec.strictness} ${crypto.randomUUID()}`;
  const draft: Record<string, unknown> = { ...dailyQuestDraft(name, spec.startDate), strictness: spec.strictness };
  const startTimeMinutes = spec.startTimeMinutes ?? (spec.strictness === 'anchor' ? DEFAULT_ANCHOR_START_MIN : undefined);
  if (startTimeMinutes !== undefined) draft['startTimeMinutes'] = startTimeMinutes;
  if (spec.recurrence) draft['recurrence'] = spec.recurrence;
  return draft;
}

export async function createQuest(ctx: APIRequestContext, spec: RolloverQuestSpec): Promise<string> {
  const outcome = await submitCommand(ctx, 'quest.create', questDraft(spec));
  if (outcome.status !== 'applied') throw new RolloverRigError(`quest.create was not applied: ${JSON.stringify(outcome)}`);
  return String(outcome.result['id']);
}

/** An onboarded persona (UTC) whose account row exists; today is not prepared until its first command or pull. */
export async function rolloverSubject(memoir: MemoirHarness, label: string): Promise<RolloverSubject> {
  const persona = await memoir.persona({ label, onboard: true });
  if (!persona.account) throw new RolloverRigError(`persona ${label} came back without an onboarded account`);
  return { persona, ctx: persona.ctx, accountId: persona.account.id, timeZone: 'UTC' };
}

/** Writes account columns no command sets immediately — `PATCH /account` only stages timezone and intensity for the next rollover. */
export async function setAccountSettings(accountId: string, settings: AccountSettings): Promise<void> {
  const sql = memoirDb();
  if (settings.timezone !== undefined) await sql`UPDATE accounts SET timezone = ${settings.timezone} WHERE id = ${accountId}::bigint`;
  if (settings.intensityMode !== undefined) await sql`UPDATE accounts SET intensity_mode = ${settings.intensityMode} WHERE id = ${accountId}::bigint`;
  if (settings.returnerThresholdDays !== undefined) await sql`UPDATE accounts SET returner_threshold_days = ${settings.returnerThresholdDays} WHERE id = ${accountId}::bigint`;
  if (settings.lastActiveDate !== undefined) await sql`UPDATE accounts SET last_active_date = ${settings.lastActiveDate}::date WHERE id = ${accountId}::bigint`;
}

/**
 * Makes every day after `lastWalked` elapsed and unwalked: `last_hp_date` becomes `lastWalked`, that day is left
 * terminalized (an existing row keeps its values and closing time; a missing one is written closed at the mode's full
 * HP), and each `daily_states` row after it — today's prepared one included — is removed, so the next command or pull
 * closes those days afresh and then prepares today again. Earlier rows stay, which is how a spec seeds a closed day.
 */
export async function rewindRollover(accountId: string, lastWalked: string): Promise<void> {
  const sql = memoirDb();
  await sql`DELETE FROM daily_states WHERE account_id = ${accountId}::bigint AND date > ${lastWalked}::date`;
  await sql`
    INSERT INTO daily_states (account_id, date, intensity_mode, hp_start, hp_end, hp_max, crown_period_start, rollover_at, rollover_engine_version, ruleset_version)
    SELECT a.id, ${lastWalked}::date, a.intensity_mode, m.hp, m.hp, m.hp, ${lastWalked}::date, now(), 'e2e-rig', 1
    FROM accounts a, LATERAL (SELECT CASE a.intensity_mode WHEN 'low_intensity' THEN 8 WHEN 'high_intensity' THEN 3 ELSE 5 END AS hp) m
    WHERE a.id = ${accountId}::bigint
    ON CONFLICT (account_id, date) DO UPDATE SET rollover_at = coalesce(daily_states.rollover_at, EXCLUDED.rollover_at)
  `;
  await sql`UPDATE accounts SET last_hp_date = ${lastWalked}::date WHERE id = ${accountId}::bigint`;
}

/**
 * Moves only `last_hp_date` back, leaving every `daily_states` row in place — the shape of a replayed walk, whose
 * already-terminalized days must be skipped rather than recomputed.
 */
export async function rewindLastHpDate(accountId: string, lastWalked: string): Promise<void> {
  await memoirDb()`UPDATE accounts SET last_hp_date = ${lastWalked}::date WHERE id = ${accountId}::bigint`;
}

/**
 * Turns a freshly prepared account into one that was prepared `days` ago and has not been touched since: its open
 * `daily_states` row and `last_hp_date` move back together. Valid only while nothing else the account owns is dated today.
 */
export async function backdatePreparedDay(accountId: string, today: string, days: number): Promise<string> {
  const preparedOn = addDays(today, -days);
  const sql = memoirDb();
  const moved = await sql`
    UPDATE daily_states SET date = ${preparedOn}::date, crown_period_start = ${preparedOn}::date
    WHERE account_id = ${accountId}::bigint AND date = ${today}::date AND rollover_at IS NULL
  `;
  if (moved.count !== 1) throw new RolloverRigError(`account ${accountId} has no open daily_states row for ${today} to backdate`);
  await sql`UPDATE accounts SET last_hp_date = ${preparedOn}::date WHERE id = ${accountId}::bigint`;
  return preparedOn;
}

/** Inserts `quest_logs` rows with the snapshot columns a real log carries, copied from each quest. */
export async function seedQuestLogs(accountId: string, questId: string, dates: string[], state: QuestLogState = 'completed'): Promise<void> {
  if (dates.length === 0) return;
  await memoirDb()`
    INSERT INTO quest_logs (account_id, quest_id, date, state, stat_affinity, strictness, intensity_mode_at_log, crown_slice_weight, ruleset_version)
    SELECT q.account_id, q.id, d::date, ${state}::quest_log_state, q.stat_affinity, q.strictness, a.intensity_mode,
      CASE q.strictness WHEN 'anchor' THEN 1.5 WHEN 'routine' THEN 1.0 WHEN 'goal' THEN 1.0 ELSE 0 END, 1
    FROM quests q JOIN accounts a ON a.id = q.account_id, unnest(${dates}::text[]) AS d
    WHERE q.id = ${questId}::bigint AND q.account_id = ${accountId}::bigint
  `;
}

export async function seedQuestStreak(accountId: string, questId: string, streak: { currentRunDays: number; shieldsAvailable: number }): Promise<void> {
  await memoirDb()`
    INSERT INTO quest_streaks (account_id, quest_id, current_run_days, best_run_days, shields_available)
    VALUES (${accountId}::bigint, ${questId}::bigint, ${streak.currentRunDays}, ${streak.currentRunDays}, ${streak.shieldsAvailable})
    ON CONFLICT (account_id, quest_id) DO UPDATE SET current_run_days = EXCLUDED.current_run_days, best_run_days = EXCLUDED.best_run_days, shields_available = EXCLUDED.shields_available
  `;
}

/** A pending Recovery as `prepareToday` would have spawned it on `date`, expiring at the start of the next local day. */
export async function seedPendingRecovery(accountId: string, date: string, timeZone: string, sourceQuestId: string | null = null): Promise<string> {
  const expiresAt = startOfLocalDay(addDays(date, 1), timeZone);
  const [row] = await memoirDb()<{ id: string }[]>`
    INSERT INTO recovery_quests (account_id, date, source_quest_id, source_quest_name, expires_at)
    VALUES (${accountId}::bigint, ${date}::date, ${sourceQuestId}::bigint, 'E2E seeded recovery', ${expiresAt})
    RETURNING id::text
  `;
  if (!row) throw new RolloverRigError(`recovery insert for account ${accountId} returned no row`);
  return row.id;
}

/** Walks the rollover through the lazy delta-pull entry point. */
export async function catchUp(ctx: APIRequestContext): Promise<void> {
  await pullDelta(ctx);
}

/**
 * The Recovery/Comeback rig: an anchor quest scheduled since yesterday, yesterday elapsed and unwalked, then one pull —
 * so the walk records yesterday's anchor miss and today's preparation arms Comeback and spawns one pending Recovery.
 * `arrange` runs before the walk, for quests or logs that shape yesterday's outcome or today's momentum.
 */
export async function missedAnchorRig(memoir: MemoirHarness, label: string, arrange?: (rig: MissedAnchorRig) => Promise<void>): Promise<MissedAnchorRig> {
  const subject = await rolloverSubject(memoir, label);
  const today = localToday(subject.timeZone);
  const yesterday = addDays(today, -1);
  const anchorQuestId = await createQuest(subject.ctx, { strictness: 'anchor', startDate: yesterday });
  const rig: MissedAnchorRig = { ...subject, today, yesterday, anchorQuestId };
  await arrange?.(rig);

  await rewindRollover(subject.accountId, addDays(today, -2));
  await catchUp(subject.ctx);
  return rig;
}

export async function patchAccount(ctx: APIRequestContext, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await memoirMutate(ctx, 'patch', '/api/v1/account', { data });
  if (!response.ok()) throw new RolloverRigError(`PATCH /account failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as Record<string, unknown>;
}

/*!
 * Readers
 */

/** The delta's `account` snapshot row — the only wire surface carrying the derived standing (`persona`, `comeback`, `shieldsAvailable`, `crown`). */
export async function accountSnapshot(ctx: APIRequestContext): Promise<Record<string, unknown>> {
  const [account] = (await pullDelta(ctx, '0')).domains['account'] ?? [];
  if (!account) throw new RolloverRigError('the delta carried no account snapshot');
  return account;
}

export async function rolloverAccount(accountId: string): Promise<RolloverAccountRow> {
  const [row] = await memoirDb()<RolloverAccountRow[]>`
    SELECT last_hp_date::text AS "lastHpDate", last_active_date::text AS "lastActiveDate", timezone, pending_timezone AS "pendingTimezone",
      intensity_mode AS "intensityMode", pending_intensity_mode AS "pendingIntensityMode", hp_today AS "hpToday", hp_start_today AS "hpStartToday",
      hp_max AS "hpMax", total_xp::int AS "totalXp", coins, pending_returner_shields AS "pendingReturnerShields"
    FROM accounts WHERE id = ${accountId}::bigint
  `;
  if (!row) throw new RolloverRigError(`account ${accountId} has no row`);
  return row;
}

export async function dailyStates(accountId: string): Promise<DailyStateRow[]> {
  return memoirDb()<DailyStateRow[]>`
    SELECT date::text AS date, intensity_mode AS "intensityMode", hp_start AS "hpStart", hp_end AS "hpEnd", hp_max AS "hpMax",
      crown_xp_granted AS "crownXpGranted", crown_xp_remaining AS "crownXpRemaining", crown_coins_granted AS "crownCoinsGranted",
      crown_coins_remaining AS "crownCoinsRemaining", crown_period_start::text AS "crownPeriodStart", crown_banked_xp AS "crownBankedXp",
      crown_banked_coins AS "crownBankedCoins", comeback_armed AS "comebackArmed", returner_active AS "returnerActive", returner_fired AS "returnerFired",
      missed_count AS "missedCount", rollover_at AS "rolloverAt"
    FROM daily_states WHERE account_id = ${accountId}::bigint ORDER BY date
  `;
}

export async function questLogs(accountId: string): Promise<QuestLogRow[]> {
  return memoirDb()<QuestLogRow[]>`
    SELECT id::text, quest_id::text AS "questId", date::text AS date, state, intensity_mode_at_log AS "intensityModeAtLog"
    FROM quest_logs WHERE account_id = ${accountId}::bigint ORDER BY date, quest_id
  `;
}

export async function recoveryQuests(accountId: string): Promise<RecoveryQuestRow[]> {
  return memoirDb()<RecoveryQuestRow[]>`
    SELECT id::text, date::text AS date, state, source_quest_id::text AS "sourceQuestId", trigger_log_ids::text[] AS "triggerLogIds",
      is_returner_day AS "isReturnerDay", expires_at AS "expiresAt"
    FROM recovery_quests WHERE account_id = ${accountId}::bigint ORDER BY date
  `;
}

export async function comebackEvents(accountId: string): Promise<ComebackEventRow[]> {
  return memoirDb()<ComebackEventRow[]>`
    SELECT date::text AS date, kind, trigger_kind AS "triggerKind" FROM comeback_events WHERE account_id = ${accountId}::bigint ORDER BY date, id
  `;
}

export async function returnerEvents(accountId: string): Promise<ReturnerEventRow[]> {
  return memoirDb()<ReturnerEventRow[]>`
    SELECT date::text AS date, last_active_date::text AS "lastActiveDate", days_absent AS "daysAbsent",
      shield_target_quest_id::text AS "shieldTargetQuestId", shield_pending AS "shieldPending"
    FROM returner_events WHERE account_id = ${accountId}::bigint ORDER BY date
  `;
}

export async function heroEvents(accountId: string, types?: string[]): Promise<HeroEventRow[]> {
  const sql = memoirDb();
  return sql<HeroEventRow[]>`
    SELECT type, date::text AS date, quest_id::text AS "questId", xp_delta AS "xpDelta", coins_delta AS "coinsDelta"
    FROM hero_events WHERE account_id = ${accountId}::bigint ${types ? sql`AND type::text = ANY(${types}::text[])` : sql``} ORDER BY id
  `;
}

/** Hero-event counts by type, for asserting a walk wrote each kind exactly as often as the fixture says. */
export async function heroEventCounts(accountId: string): Promise<Record<string, number>> {
  const rows = await memoirDb()<{ type: string; n: number }[]>`SELECT type, count(*)::int AS n FROM hero_events WHERE account_id = ${accountId}::bigint GROUP BY type`;
  return Object.fromEntries(rows.map(row => [row.type, row.n]));
}

export async function questStreak(accountId: string, questId: string): Promise<QuestStreakRow | undefined> {
  const [row] = await memoirDb()<QuestStreakRow[]>`
    SELECT current_run_days AS "currentRunDays", shields_available AS "shieldsAvailable", pending_shield_grant AS "pendingShieldGrant"
    FROM quest_streaks WHERE account_id = ${accountId}::bigint AND quest_id = ${questId}::bigint
  `;
  return row;
}

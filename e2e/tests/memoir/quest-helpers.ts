/**
 * Importing npm packages
 */
import { type APIRequestContext, expect } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { csrfHeaders, memoirDb } from '../../lib';
import { submitCommandWithHeaders, withAccountLockHeld } from './concurrency-helpers';
import { type CommandOutcome, submitCommand } from './helpers';

/**
 * Defining types
 */

export type StatAffinity = 'discipline' | 'body' | 'wealth' | 'mind';

export interface CommandSpec {
  type: string;
  payload: Record<string, unknown>;
}

export interface QuestLogSnapshot {
  id: string;
  state: string;
  xpAwarded: number;
  coinsAwarded: number;
  strictness: string;
  statAffinity: string;
  intensityModeAtLog: string;
  reasonTag: string | null;
  reasonNote: string | null;
  reflectionText: string | null;
}

export interface RescheduleEventRow {
  id: string;
  questId: string;
  date: string;
  toMin: number;
  reasonTag: string | null;
}

export interface CosmeticUnlockRow {
  cosmeticId: string;
  kind: string;
  source: string;
  equipped: boolean;
}

export interface EarnedRow {
  id: string;
  earnedAt: Date;
}

/**
 * Declaring the constants
 *
 * Shared plumbing for the quest, quick-log and progression specs: occurrence ids, refusal assertions, a two-command race
 * proven through `withAccountLockHeld`, and the database readers for the rows the sync wire does not expose whole.
 */

export class MemoirRowMissingError extends Error {
  override readonly name = 'MemoirRowMissingError';
}

export function occurrenceOf(questId: string, date: string): { occurrenceId: string } {
  return { occurrenceId: `${questId}:${date}` };
}

export function expectFailed(outcome: CommandOutcome, code: string): void {
  expect({ status: outcome.status, code: outcome.error?.code }, JSON.stringify(outcome)).toEqual({ status: 'failed', code });
}

/** Submits both commands for one account, released together only once both are proven queued behind its advisory lock. */
export async function raceCommands(ctx: APIRequestContext, accountId: string, commands: [CommandSpec, CommandSpec]): Promise<[CommandOutcome, CommandOutcome]> {
  const headers = await csrfHeaders(ctx);
  return withAccountLockHeld(accountId, 2, () =>
    Promise.all([submitCommandWithHeaders(ctx, headers, commands[0].type, commands[0].payload), submitCommandWithHeaders(ctx, headers, commands[1].type, commands[1].payload)]),
  );
}

export function submitSpec(ctx: APIRequestContext, command: CommandSpec): Promise<CommandOutcome> {
  return submitCommand(ctx, command.type, command.payload);
}

/** Resends `outcome`'s own command id, the way an outbox retries after a lost response. */
export function replayCommand(ctx: APIRequestContext, outcome: CommandOutcome, command: CommandSpec): Promise<CommandOutcome> {
  return submitCommand(ctx, command.type, command.payload, { commandId: outcome.commandId });
}

export async function questLogOf(accountId: string, questId: string, date: string): Promise<QuestLogSnapshot | undefined> {
  const [row] = await memoirDb()<QuestLogSnapshot[]>`
    SELECT id::text, state, xp_awarded AS "xpAwarded", coins_awarded AS "coinsAwarded", strictness, stat_affinity AS "statAffinity",
      intensity_mode_at_log AS "intensityModeAtLog", reason_tag AS "reasonTag", reason_note AS "reasonNote", reflection_text AS "reflectionText"
    FROM quest_logs WHERE account_id = ${accountId}::bigint AND quest_id = ${questId}::bigint AND date = ${date}::date
  `;
  return row;
}

export async function rescheduleEvents(accountId: string): Promise<RescheduleEventRow[]> {
  return memoirDb()<RescheduleEventRow[]>`
    SELECT id::text, quest_id::text AS "questId", date::text AS date, to_min AS "toMin", reason_tag AS "reasonTag"
    FROM reschedule_events WHERE account_id = ${accountId}::bigint ORDER BY date, id
  `;
}

export async function seedRescheduleEvents(accountId: string, questId: string, dates: string[], reasonTag: string | null): Promise<void> {
  await memoirDb()`
    INSERT INTO reschedule_events (account_id, quest_id, date, to_min, reason_tag)
    SELECT ${accountId}::bigint, ${questId}::bigint, d::date, 600, ${reasonTag}::reason_tag FROM unnest(${dates}::text[]) AS d
  `;
}

export async function achievementsEarned(accountId: string): Promise<EarnedRow[]> {
  return memoirDb()<EarnedRow[]>`SELECT achievement_id AS id, earned_at AS "earnedAt" FROM achievements_earned WHERE account_id = ${accountId}::bigint ORDER BY achievement_id`;
}

export async function titlesEarned(accountId: string): Promise<EarnedRow[]> {
  return memoirDb()<EarnedRow[]>`SELECT title_id AS id, earned_at AS "earnedAt" FROM titles_earned WHERE account_id = ${accountId}::bigint ORDER BY title_id`;
}

export async function achievementUnlockEvents(accountId: string): Promise<string[]> {
  const rows = await memoirDb()<{ id: string }[]>`
    SELECT achievement_id AS id FROM hero_events WHERE account_id = ${accountId}::bigint AND type = 'achievement_unlock' ORDER BY achievement_id
  `;
  return rows.map(row => row.id);
}

export async function cosmeticUnlocks(accountId: string): Promise<CosmeticUnlockRow[]> {
  return memoirDb()<CosmeticUnlockRow[]>`
    SELECT cosmetic_id AS "cosmeticId", kind, source, equipped FROM cosmetic_unlocks WHERE account_id = ${accountId}::bigint ORDER BY cosmetic_id
  `;
}

/** Writes the account's coin mirror directly: no command grants coins in bulk, and a purchase reads only this balance. */
export async function setCoins(accountId: string, coins: number): Promise<void> {
  await memoirDb()`UPDATE accounts SET coins = ${coins} WHERE id = ${accountId}::bigint`;
}

export async function setStats(accountId: string, stats: Record<StatAffinity, number>): Promise<void> {
  await memoirDb()`
    UPDATE accounts SET stat_discipline = ${stats.discipline}, stat_body = ${stats.body}, stat_wealth = ${stats.wealth}, stat_mind = ${stats.mind}
    WHERE id = ${accountId}::bigint
  `;
}

export async function displayedTitle(accountId: string): Promise<string | null> {
  const [row] = await memoirDb()<{ title: string | null }[]>`SELECT displayed_title_id AS title FROM accounts WHERE id = ${accountId}::bigint`;
  return row?.title ?? null;
}

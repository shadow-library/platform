/**
 * Importing npm packages
 */
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { type OwnedTable } from '@modules/auth';
import { schema } from '@server/database';

/**
 * Defining types
 */

/**
 * One entry per user-owned table the export assembler streams (ARCHITECTURE §20). `cursor` is a column
 * that, once scoped to one account, is both unique and totally orderable — `id` for every table that has
 * one, and the other half of a composite natural key (`date`, `questId`, `ref`, or `accountId` itself for
 * a one-row-per-account table) everywhere else — so a single generic keyset paginator (`export-assembler
 * .service.ts -> paginateTable`) works unmodified across every shape in the catalogue.
 */
export interface ExportTableEntry {
  key: string;
  table: OwnedTable;
  cursor: AnyPgColumn;
  /** The row property `cursor`'s value is read back under, for advancing the keyset page to page — same name in every table here since Drizzle mirrors the schema-literal key onto the returned row. */
  cursorKey: string;
}

export const EXPORT_TABLE_REGISTRY: readonly ExportTableEntry[] = [
  { key: 'devices', table: schema.devices, cursor: schema.devices.id, cursorKey: 'id' },
  { key: 'quests', table: schema.quests, cursor: schema.quests.id, cursorKey: 'id' },
  { key: 'quest_consequences', table: schema.questConsequences, cursor: schema.questConsequences.id, cursorKey: 'id' },
  { key: 'quest_logs', table: schema.questLogs, cursor: schema.questLogs.id, cursorKey: 'id' },
  { key: 'hero_events', table: schema.heroEvents, cursor: schema.heroEvents.id, cursorKey: 'id' },
  { key: 'daily_states', table: schema.dailyStates, cursor: schema.dailyStates.date, cursorKey: 'date' },
  { key: 'reschedule_events', table: schema.rescheduleEvents, cursor: schema.rescheduleEvents.id, cursorKey: 'id' },
  { key: 'recovery_quests', table: schema.recoveryQuests, cursor: schema.recoveryQuests.id, cursorKey: 'id' },
  { key: 'comeback_events', table: schema.comebackEvents, cursor: schema.comebackEvents.id, cursorKey: 'id' },
  { key: 'returner_events', table: schema.returnerEvents, cursor: schema.returnerEvents.id, cursorKey: 'id' },
  { key: 'shield_consumptions', table: schema.shieldConsumptions, cursor: schema.shieldConsumptions.id, cursorKey: 'id' },
  { key: 'achievements_earned', table: schema.achievementsEarned, cursor: schema.achievementsEarned.id, cursorKey: 'id' },
  { key: 'titles_earned', table: schema.titlesEarned, cursor: schema.titlesEarned.id, cursorKey: 'id' },
  { key: 'cosmetic_unlocks', table: schema.cosmeticUnlocks, cursor: schema.cosmeticUnlocks.id, cursorKey: 'id' },
  { key: 'quest_streaks', table: schema.questStreaks, cursor: schema.questStreaks.questId, cursorKey: 'questId' },
  { key: 'expense_categories', table: schema.expenseCategories, cursor: schema.expenseCategories.id, cursorKey: 'id' },
  { key: 'subscriptions', table: schema.subscriptions, cursor: schema.subscriptions.id, cursorKey: 'id' },
  { key: 'expenses', table: schema.expenses, cursor: schema.expenses.id, cursorKey: 'id' },
  { key: 'metrics', table: schema.metrics, cursor: schema.metrics.id, cursorKey: 'id' },
  { key: 'metric_entries', table: schema.metricEntries, cursor: schema.metricEntries.id, cursorKey: 'id' },
  { key: 'progress_counters', table: schema.progressCounters, cursor: schema.progressCounters.accountId, cursorKey: 'accountId' },
  { key: 'journal_entries', table: schema.journalEntries, cursor: schema.journalEntries.id, cursorKey: 'id' },
  { key: 'meals', table: schema.meals, cursor: schema.meals.id, cursorKey: 'id' },
  { key: 'meal_presets', table: schema.mealPresets, cursor: schema.mealPresets.id, cursorKey: 'id' },
  { key: 'weights', table: schema.weights, cursor: schema.weights.date, cursorKey: 'date' },
  { key: 'side_quests', table: schema.sideQuests, cursor: schema.sideQuests.id, cursorKey: 'id' },
  { key: 'entitlements', table: schema.entitlements, cursor: schema.entitlements.accountId, cursorKey: 'accountId' },
  { key: 'billing_events', table: schema.billingEvents, cursor: schema.billingEvents.id, cursorKey: 'id' },
  { key: 'receipts', table: schema.receipts, cursor: schema.receipts.ref, cursorKey: 'ref' },
  { key: 'ai_tasks', table: schema.aiTasks, cursor: schema.aiTasks.id, cursorKey: 'id' },
  { key: 'ai_results', table: schema.aiResults, cursor: schema.aiResults.id, cursorKey: 'id' },
  { key: 'ai_scheduled_queries', table: schema.aiScheduledQueries, cursor: schema.aiScheduledQueries.accountId, cursorKey: 'accountId' },
  { key: 'ai_consents', table: schema.aiConsents, cursor: schema.aiConsents.dataClass, cursorKey: 'dataClass' },
  { key: 'applied_suggestions', table: schema.appliedSuggestions, cursor: schema.appliedSuggestions.id, cursorKey: 'id' },
  /** Worker bookkeeping (data-class names + row counts, never content, §24) rather than user-authored content — included anyway per PRD §2.10's "owner gets everything" posture. */
  { key: 'ai_task_audit', table: schema.aiTaskAudit, cursor: schema.aiTaskAudit.id, cursorKey: 'id' },
];

/**
 * Every schema-barrel table the registry above deliberately omits, with why — read by the completeness
 * test (`tests/export/export-completeness.spec.ts`), which otherwise fails on any table neither listed
 * nor excluded here. `accounts` itself is excluded from this map because the assembler reads it directly
 * as the export's `account` snapshot section rather than through the generic table loop (its own `id`
 * column is the account, not an `account_id` foreign key, so it does not fit `OwnedTable`).
 */
export const EXPORT_TABLE_EXCLUSIONS: Readonly<Record<string, string>> = {
  fx_rates: 'global market data — no account_id, not account-owned',
  deleted_records: 'sync-protocol tombstone log, not user content',
  command_log: 'sync-protocol replay/idempotency log, not user content',
  export_jobs: 'the export bookkeeping table itself, not exported data',
};

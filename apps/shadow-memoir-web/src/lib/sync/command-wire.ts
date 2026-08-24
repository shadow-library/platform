import {
  type Command,
  type ExpenseDraft,
  type FinanceCommand,
  type HeroCommand,
  parseAmountToMinor,
  type QuestDraft,
  type QuickLogCommand,
  type Recurrence,
  type ReminderLead,
  SUBSCRIPTION_CATEGORIES,
  type SubscriptionCategoryId,
  type Weekday,
} from '@/lib/data';

import { type SyncCommand } from './sync.types';
import { uuidv7 } from './uuid';

export interface WireCommand {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Every command type the server has a handler for that one of the web's four command unions also knows
 * how to build. A type absent from this set is applied locally and kept out of the outbox entirely:
 * `POST /sync/commands` fails the *whole batch* on an unknown type, so one command the server has not
 * shipped yet would strand every command behind it. Still absent server-side and therefore still local:
 * `quest.setActive`, `plan.setLock`, `category.rename`, `category.setArchived`, `journal.dismissPrompt`,
 * `health.acceptOffer` (the owner's own `quest.complete` is what completes the quest), and
 * `intensity.set`. Reflect and account commands have no server module yet at all.
 */
const SERVER_BACKED_TYPES = new Set<SyncCommand['type']>([
  'quest.complete',
  'quest.partial',
  'quest.skip',
  'quest.postpone',
  'quest.reschedule',
  'quest.create',
  'quest.update',
  'expense.create',
  'expense.update',
  'expense.delete',
  'subscription.create',
  'subscription.setActive',
  'subscription.confirmCycle',
  'journal.save',
  'meal.log',
  'meal.logPreset',
  'meal.savePreset',
  'weight.save',
  'sidequest.log',
  'health.save',
  'title.display',
  'cosmetic.purchase',
  'cosmetic.equip',
]);

export function isServerBacked(command: SyncCommand): boolean {
  if (command.type === 'health.save') return command.metricId !== undefined;
  return SERVER_BACKED_TYPES.has(command.type);
}

const QUEST_TYPES = new Set<Command['type']>([
  'quest.complete',
  'quest.partial',
  'quest.skip',
  'quest.postpone',
  'quest.reschedule',
  'quest.create',
  'quest.update',
  'quest.setActive',
  'plan.setLock',
  'expense.record',
  'metric.record',
  'weight.record',
  'journal.record',
  'sideQuest.record',
]);

const FINANCE_TYPES = new Set<FinanceCommand['type']>([
  'expense.create',
  'expense.update',
  'expense.delete',
  'subscription.create',
  'subscription.setActive',
  'subscription.confirmCycle',
  'category.rename',
  'category.setArchived',
]);

const HERO_TYPES = new Set<HeroCommand['type']>(['title.display', 'cosmetic.purchase', 'cosmetic.equip', 'intensity.set']);

export function isQuestCommand(command: SyncCommand): command is Command {
  return QUEST_TYPES.has(command.type as Command['type']);
}

export function isFinanceCommand(command: SyncCommand): command is FinanceCommand {
  return FINANCE_TYPES.has(command.type as FinanceCommand['type']);
}

export function isHeroCommand(command: SyncCommand): command is HeroCommand {
  return HERO_TYPES.has(command.type as HeroCommand['type']);
}

export function isQuickLogCommand(command: SyncCommand): command is QuickLogCommand {
  return !isQuestCommand(command) && !isFinanceCommand(command) && !isHeroCommand(command);
}

/**
 * Mints the client-side identities the server expects a command to arrive with (ARCHITECTURE §12.4).
 * Called before the optimistic apply, never inside `toWireCommand`, so the row written locally and the
 * row the server writes carry the same id — and a replay of the queued command stays idempotent.
 */
export function mintCommandIds(command: SyncCommand): SyncCommand {
  switch (command.type) {
    case 'expense.create':
      return command.draft.id ? command : { ...command, draft: { ...command.draft, id: uuidv7() } };
    case 'journal.save':
      return command.draft.id ? command : { ...command, draft: { ...command.draft, id: uuidv7() } };
    case 'meal.log':
      return command.draft.id ? command : { ...command, draft: { ...command.draft, id: uuidv7() } };
    case 'sidequest.log':
      return command.draft.id ? command : { ...command, draft: { ...command.draft, id: uuidv7() } };
    case 'meal.logPreset':
      return command.id ? command : { ...command, id: uuidv7() };
    default:
      return command;
  }
}

const WEEKDAY_WIRE: Record<Weekday, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

/** The rules module's `RecurrenceRule` (numeric 1–7 weekdays, a monthly `pattern` discriminant) rather than the web's flatter `Recurrence` draft. */
function toRecurrenceRule(recurrence: Recurrence): Record<string, unknown> {
  const base = { frequency: recurrence.frequency, interval: recurrence.interval, startDate: recurrence.startDate, end: recurrence.end, exceptions: recurrence.exceptions };
  if (recurrence.frequency === 'weekly') return { ...base, daysOfWeek: recurrence.daysOfWeek.map(day => WEEKDAY_WIRE[day]) };
  if (recurrence.frequency === 'monthly') return { ...base, pattern: { kind: 'day_of_month', dayOfMonth: recurrence.dayOfMonth ?? Number(recurrence.startDate.slice(-2)) } };
  return base;
}

function toDraftWire(draft: QuestDraft): Record<string, unknown> {
  return { ...draft, recurrence: toRecurrenceRule(draft.recurrence) };
}

function toPatchWire(patch: Partial<QuestDraft>): Record<string, unknown> {
  if (patch.recurrence === undefined) return patch;
  return { ...patch, recurrence: toRecurrenceRule(patch.recurrence) };
}

const REMINDER_LEAD_WIRE: Record<ReminderLead, string> = { 'on-day': 'on_day', '1-day': '1_day', '2-day': '2_day', '3-day': '3_day', '1-week': '1_week' };

function expenseWire(id: string, draft: ExpenseDraft): Record<string, unknown> {
  return {
    id,
    amountMinor: parseAmountToMinor(draft.amountText, draft.currency) ?? 0,
    amountText: draft.amountText,
    currency: draft.currency,
    categoryId: draft.categoryId,
    occurredOn: draft.occurredOnDate,
    merchant: draft.merchant,
    note: draft.note,
    source: draft.source ?? 'manual',
  };
}

/**
 * `subscriptions.category_id` is copied verbatim onto the expense `subscription.confirmCycle` writes, so
 * the wire carries the *expense* category key rather than the web's finer subscription grouping — the
 * ledger's category has to be a real one. `projection.ts` maps the key back, which is lossy only for the
 * subscription's own label.
 */
function subscriptionCategoryWire(categoryId: SubscriptionCategoryId): string {
  return SUBSCRIPTION_CATEGORIES[categoryId].expenseCategoryId;
}

/**
 * The only place a local command becomes a wire envelope body. A payload mismatch with any of the four
 * server modules is reconciled here and nowhere else — no call site outside this module knows the wire
 * shape of anything.
 */
export function toWireCommand(command: SyncCommand): WireCommand {
  switch (command.type) {
    case 'quest.complete':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId } };
    case 'quest.partial':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, progress: command.progress, reasonTag: command.reasonTag, note: command.note } };
    case 'quest.skip':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, reasonTag: command.reasonTag, note: command.note } };
    case 'quest.postpone':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, reasonTag: command.reasonTag } };
    case 'quest.reschedule':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, toMin: command.toMin, acceptBeyondCap: command.acceptBeyondCap ?? false } };
    case 'quest.create':
      return { type: command.type, payload: { ...toDraftWire(command.draft), entityRef: uuidv7() } };
    case 'quest.update':
      return { type: command.type, payload: { questId: command.questId, patch: toPatchWire(command.patch) } };

    case 'expense.create':
      return { type: command.type, payload: expenseWire(command.draft.id ?? uuidv7(), command.draft) };
    case 'expense.update':
      return { type: command.type, payload: expenseWire(command.id, command.draft) };
    case 'expense.delete':
      return { type: command.type, payload: { id: command.id } };
    case 'subscription.create':
      return {
        type: command.type,
        payload: {
          name: command.draft.name,
          note: command.draft.note,
          amountMinor: parseAmountToMinor(command.draft.amountText, command.draft.currency) ?? 0,
          amountText: command.draft.amountText,
          currency: command.draft.currency,
          frequency: command.draft.frequency,
          customIntervalDays: command.draft.customIntervalDays ?? null,
          billingDay: Number(command.draft.nextDueDate.slice(8, 10)),
          nextDueDate: command.draft.nextDueDate,
          categoryId: subscriptionCategoryWire(command.draft.categoryId),
          reminderEnabled: command.draft.reminderEnabled,
          reminderLead: REMINDER_LEAD_WIRE[command.draft.reminderLead],
        },
      };
    case 'subscription.setActive':
      return { type: 'subscription.update', payload: { id: command.id, active: command.active } };
    case 'subscription.confirmCycle':
      return { type: command.type, payload: { id: command.id, billingDate: command.billingDate } };

    case 'journal.save':
      return {
        type: command.type,
        payload: { id: command.draft.id ?? uuidv7(), draft: { date: command.draft.date, text: command.draft.text, mood: command.draft.mood, tags: command.draft.tags ?? null } },
      };
    case 'meal.log':
      return {
        type: command.type,
        payload: {
          id: command.draft.id ?? uuidv7(),
          draft: { date: command.draft.date, name: command.draft.name, calories: command.draft.calories, mealType: command.draft.mealType, note: command.draft.note },
        },
      };
    case 'meal.logPreset':
      return { type: command.type, payload: { id: command.id ?? uuidv7(), presetId: command.presetId, date: command.date } };
    case 'meal.savePreset':
      return {
        type: command.type,
        payload: { preset: { name: command.preset.name, calories: command.preset.calories, mealType: command.preset.mealType, note: command.preset.note } },
      };
    case 'weight.save':
      return { type: command.type, payload: { date: command.date, kg: command.kg, confirmedReplacement: command.confirmedReplacement } };
    case 'sidequest.log':
      return {
        type: command.type,
        payload: { id: command.draft.id ?? uuidv7(), draft: { date: command.draft.date, name: command.draft.name, statAffinity: command.draft.statAffinity } },
      };
    case 'health.save':
      return { type: 'metric.register', payload: { metricId: command.metricId, date: command.date, value: command.value, source: 'manual' } };

    case 'title.display':
      return { type: command.type, payload: { titleId: command.titleId } };
    case 'cosmetic.purchase':
    case 'cosmetic.equip':
      return { type: command.type, payload: { cosmeticId: command.cosmeticId } };

    default:
      return { type: command.type, payload: { ...command, type: undefined } };
  }
}

/**
 * The `entity_ref` → server id mapping a create command's outcome carries (ARCHITECTURE §12.4), so the
 * local row minted optimistically can adopt the id the server assigned.
 */
export function readEntityRef(result: Record<string, unknown>): { entityRef: string; id: string } | null {
  const entityRef = result['entityRef'];
  const id = result['id'];
  if (typeof entityRef !== 'string' || (typeof id !== 'string' && typeof id !== 'number')) return null;
  return { entityRef, id: String(id) };
}

/**
 * Importing npm packages
 */
import { ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type LocalDate, type MonthlyPattern, parseLocalDate, type ReasonTag, type RecurrenceEnd, type RecurrenceRule, type Weekday } from '@modules/rules';
import { type Quest, type QuestLog } from '@server/database';

/**
 * Defining types
 */

/** The command-layer shape a `quest.create`/`quest.update` payload carries; validated by {@link parseQuestDraft}. */
export interface QuestDraftInput {
  name: string;
  notes: string | null;
  startTimeMinutes: number | null;
  durationMinutes: number;
  statAffinity: Quest.StatAffinity;
  strictness: Quest.Strictness;
  optionalStreakOptIn: boolean;
  recurrence: RecurrenceRule;
  moduleLink: Quest.ModuleLink | null;
  reminderEnabled: boolean;
  reminderLeadMin: number;
  healthThreshold: Record<string, unknown> | null;
  active: boolean;
}

export interface OccurrenceRef {
  readonly questId: bigint;
  readonly date: string;
}

const STAT_AFFINITIES: readonly Quest.StatAffinity[] = ['discipline', 'body', 'wealth', 'mind'];
const STRICTNESSES: readonly Quest.Strictness[] = ['anchor', 'routine', 'goal', 'recovery', 'optional'];
const MODULE_LINKS: readonly Quest.ModuleLink[] = ['journal', 'meal', 'weight'];
const REASON_TAGS: readonly ReasonTag[] = [
  'forgot',
  'too_tired',
  'task_too_big',
  'schedule_conflict',
  'avoided_it',
  'emotional_resistance',
  'health',
  'travel',
  'family_social',
  'work_emergency',
  'not_important_anymore',
  'poorly_planned',
  'other',
];
const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const NTH_ORDINALS = [1, 2, 3, 4, 'last'] as const;

function fail(field: string, msg: string): never {
  throw new ValidationError(field, msg);
}

function record(field: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(field, `'${field}' must be an object`);
  return value as Record<string, unknown>;
}

function str(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) fail(field, `'${field}' is required`);
  return value;
}

function optionalStr(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(field, `'${field}' must be a string`);
  return value;
}

function bool(field: string, value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(field, `'${field}' must be a boolean`);
  return value;
}

function int(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(field, `'${field}' must be an integer`);
  return value;
}

function minuteOfDay(field: string, value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const minute = int(field, value);
  if (minute < 0 || minute > 1439) fail(field, `'${field}' must be between 0 and 1439`);
  return minute;
}

function oneOf<T extends string | number>(field: string, value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) fail(field, `'${field}' must be one of ${allowed.join(', ')}`);
  return value as T;
}

function parseLocalDateStrict(field: string, value: unknown): LocalDate {
  const parsed = parseLocalDate(str(field, value));
  if (!parsed) fail(field, `'${field}' must be a valid calendar date (YYYY-MM-DD)`);
  return parsed;
}

function parseRecurrenceEnd(field: string, value: unknown): RecurrenceEnd {
  const body = record(field, value);
  const kind = oneOf(`${field}.kind`, body['kind'], ['never', 'count', 'until'] as const);
  if (kind === 'never') return { kind: 'never' };
  if (kind === 'count') return { kind: 'count', count: int(`${field}.count`, body['count']) };
  const date = parseLocalDate(str(`${field}.date`, body['date']));
  if (!date) fail(`${field}.date`, `'${field}.date' must be a valid calendar date`);
  return { kind: 'until', date };
}

function parseMonthlyPattern(field: string, value: unknown): MonthlyPattern {
  const body = record(field, value);
  const kind = oneOf(`${field}.kind`, body['kind'], ['day_of_month', 'nth_weekday'] as const);
  if (kind === 'day_of_month') return { kind: 'day_of_month', dayOfMonth: int(`${field}.dayOfMonth`, body['dayOfMonth']) };
  const weekday = oneOf(`${field}.weekday`, body['weekday'], WEEKDAYS);
  const ordinal = oneOf(`${field}.ordinal`, body['ordinal'], NTH_ORDINALS);
  return { kind: 'nth_weekday', weekday, ordinal };
}

/** Accepts the `rules` module's own `RecurrenceRule` shape (ARCHITECTURE §10.3's closed rule object) rather than a flattened one, so it feeds `expandRecurrence`/`occursOn` unchanged. */
export function parseRecurrence(value: unknown): RecurrenceRule {
  const body = record('recurrence', value);
  const frequency = oneOf('recurrence.frequency', body['frequency'], ['daily', 'weekly', 'monthly', 'yearly'] as const);
  const interval = body['interval'] === undefined ? 1 : int('recurrence.interval', body['interval']);
  const startDate = parseLocalDateStrict('recurrence.startDate', body['startDate']);
  const end = parseRecurrenceEnd('recurrence.end', body['end']);
  const exceptionsRaw = body['exceptions'];
  const exceptions =
    exceptionsRaw === undefined
      ? []
      : Array.isArray(exceptionsRaw)
        ? exceptionsRaw.map((entry, index) => {
            const parsed = parseLocalDate(str(`recurrence.exceptions.${index}`, entry));
            if (!parsed) fail(`recurrence.exceptions.${index}`, 'must be a valid calendar date');
            return parsed;
          })
        : fail('recurrence.exceptions', "'recurrence.exceptions' must be an array of dates");

  if (frequency === 'daily') return { frequency, interval, startDate, end, exceptions };
  if (frequency === 'weekly') {
    const daysOfWeekRaw = body['daysOfWeek'];
    if (!Array.isArray(daysOfWeekRaw) || daysOfWeekRaw.length === 0) fail('recurrence.daysOfWeek', 'a weekly recurrence requires at least one weekday');
    const daysOfWeek = daysOfWeekRaw.map((entry, index) => oneOf(`recurrence.daysOfWeek.${index}`, entry, WEEKDAYS)) as [Weekday, ...Weekday[]];
    return { frequency, interval, startDate, end, exceptions, daysOfWeek };
  }
  if (frequency === 'monthly') return { frequency, interval, startDate, end, exceptions, pattern: parseMonthlyPattern('recurrence.pattern', body['pattern']) };
  return { frequency, interval, startDate, end, exceptions };
}

/** Anchor-requires-a-start-time is a domain rule (`AppErrorCode.QST_003`), checked by the command handler once it has the full draft — not a field-shape concern, so it is not raised here. */
export function parseQuestDraft(payload: Record<string, unknown>): QuestDraftInput {
  const strictness = oneOf('strictness', payload['strictness'], STRICTNESSES);
  const startTimeMinutes = minuteOfDay('startTimeMinutes', payload['startTimeMinutes']);

  const notification = payload['notification'] === undefined ? {} : record('notification', payload['notification']);
  const moduleLinkRaw = payload['moduleLink'];

  return {
    name: str('name', payload['name']),
    notes: optionalStr('notes', payload['notes']),
    startTimeMinutes,
    durationMinutes: int('durationMinutes', payload['durationMinutes'] ?? 0),
    statAffinity: oneOf('statAffinity', payload['statAffinity'], STAT_AFFINITIES),
    strictness,
    optionalStreakOptIn: bool('optionalStreakOptIn', payload['optionalStreakOptIn'], false),
    recurrence: parseRecurrence(payload['recurrence']),
    moduleLink: moduleLinkRaw === undefined || moduleLinkRaw === null ? null : oneOf('moduleLink', moduleLinkRaw, MODULE_LINKS),
    reminderEnabled: bool('notification.enabled', notification['enabled'], false),
    reminderLeadMin: notification['leadMinutes'] === undefined ? 0 : int('notification.leadMinutes', notification['leadMinutes']),
    healthThreshold: payload['healthThreshold'] === undefined || payload['healthThreshold'] === null ? null : record('healthThreshold', payload['healthThreshold']),
    active: bool('active', payload['active'], true),
  };
}

/** `quest.update` accepts the same fields as create, all optional, applied as a shallow patch over the existing row (future-only: never rewrites a past `quest_logs` snapshot). */
export function parseQuestPatch(payload: Record<string, unknown>): Partial<QuestDraftInput> {
  const patch: Partial<QuestDraftInput> = {};
  if (payload['name'] !== undefined) patch.name = str('name', payload['name']);
  if (payload['notes'] !== undefined) patch.notes = optionalStr('notes', payload['notes']);
  if (payload['startTimeMinutes'] !== undefined) patch.startTimeMinutes = minuteOfDay('startTimeMinutes', payload['startTimeMinutes']);
  if (payload['durationMinutes'] !== undefined) patch.durationMinutes = int('durationMinutes', payload['durationMinutes']);
  if (payload['statAffinity'] !== undefined) patch.statAffinity = oneOf('statAffinity', payload['statAffinity'], STAT_AFFINITIES);
  if (payload['strictness'] !== undefined) patch.strictness = oneOf('strictness', payload['strictness'], STRICTNESSES);
  if (payload['optionalStreakOptIn'] !== undefined) patch.optionalStreakOptIn = bool('optionalStreakOptIn', payload['optionalStreakOptIn'], false);
  if (payload['recurrence'] !== undefined) patch.recurrence = parseRecurrence(payload['recurrence']);
  if (payload['moduleLink'] !== undefined) patch.moduleLink = payload['moduleLink'] === null ? null : oneOf('moduleLink', payload['moduleLink'], MODULE_LINKS);
  if (payload['healthThreshold'] !== undefined) patch.healthThreshold = payload['healthThreshold'] === null ? null : record('healthThreshold', payload['healthThreshold']);
  if (payload['active'] !== undefined) patch.active = bool('active', payload['active'], true);
  if (payload['notification'] !== undefined) {
    const notification = record('notification', payload['notification']);
    patch.reminderEnabled = bool('notification.enabled', notification['enabled'], false);
    patch.reminderLeadMin = notification['leadMinutes'] === undefined ? 0 : int('notification.leadMinutes', notification['leadMinutes']);
  }
  return patch;
}

/** The FE wire format is `${questId}:${date}` (`apps/shadow-memoir-web/src/lib/data/fixture-provider.ts`); parsed here so every action command shares one occurrence identity. */
export function parseOccurrenceId(payload: Record<string, unknown>): OccurrenceRef {
  const occurrenceId = str('occurrenceId', payload['occurrenceId']);
  const separator = occurrenceId.indexOf(':');
  if (separator < 1) fail('occurrenceId', "'occurrenceId' must be formatted '{questId}:{date}'");
  const questIdPart = occurrenceId.slice(0, separator);
  const datePart = occurrenceId.slice(separator + 1);
  if (!/^\d+$/.test(questIdPart)) fail('occurrenceId', "'occurrenceId' quest segment must be numeric");
  parseLocalDateStrict('occurrenceId', datePart);
  return { questId: BigInt(questIdPart), date: datePart };
}

export function parseReasonTag(field: string, value: unknown): QuestLog.ReasonTag | null {
  if (value === undefined || value === null) return null;
  return oneOf(field, value, REASON_TAGS);
}

export function parseReasonNote(field: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const note = str(field, value);
  if (note.length > 120) fail(field, `'${field}' must be at most 120 characters`);
  return note;
}

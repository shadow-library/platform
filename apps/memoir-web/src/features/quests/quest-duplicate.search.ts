import { type RecurrenceFrequency, STAT_LABELS, type StatAffinity, type Strictness, type Weekday, WEEKDAYS } from '@/lib/data';

/** `/quests/$questId` "Duplicate as a new quest" carries the source quest's fields here so `/quests/new` isn't blank. */
export interface QuestDuplicateSearch {
  duplicateName?: string;
  duplicateStatAffinity?: StatAffinity;
  duplicateStrictness?: Strictness;
  duplicateStartTimeMinutes?: number;
  duplicateDurationMinutes?: number;
  duplicateFrequency?: RecurrenceFrequency;
  duplicateInterval?: number;
  duplicateDays?: Weekday[];
  duplicateThreshold?: boolean;
}

const NAME_MAX_LENGTH = 120;
const START_TIME_MINUTES_MIN = 0;
const START_TIME_MINUTES_MAX = 1439;
const DURATION_MINUTES_MIN = 0;
const DURATION_MINUTES_MAX = 240;
const INTERVAL_MIN = 1;
const INTERVAL_MAX = 30;
/** The builder only ever writes one of these (`quest-builder-screen.tsx`'s `SegmentedControl`/`STRICTNESS_ORDER`) — a wider domain value would just confuse its form. */
const BUILDER_FREQUENCIES: readonly RecurrenceFrequency[] = ['daily', 'weekly'];
const BUILDER_STRICTNESSES: readonly Strictness[] = ['anchor', 'routine', 'goal', 'optional'];

function stringWithin(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function memberOf<T extends string>(value: unknown, members: readonly T[]): T | undefined {
  return typeof value === 'string' && (members as readonly string[]).includes(value) ? (value as T) : undefined;
}

function integerWithin(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function weekdays(value: unknown): Weekday[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const days = value.filter((item): item is Weekday => typeof item === 'string' && WEEKDAYS.includes(item as Weekday));
  return days.length > 0 ? days : undefined;
}

export function validateQuestDuplicateSearch(search: Record<string, unknown>): QuestDuplicateSearch {
  return {
    duplicateName: stringWithin(search.duplicateName, NAME_MAX_LENGTH),
    duplicateStatAffinity: memberOf<StatAffinity>(search.duplicateStatAffinity, Object.keys(STAT_LABELS) as StatAffinity[]),
    duplicateStrictness: memberOf<Strictness>(search.duplicateStrictness, BUILDER_STRICTNESSES),
    duplicateStartTimeMinutes: integerWithin(search.duplicateStartTimeMinutes, START_TIME_MINUTES_MIN, START_TIME_MINUTES_MAX),
    duplicateDurationMinutes: integerWithin(search.duplicateDurationMinutes, DURATION_MINUTES_MIN, DURATION_MINUTES_MAX),
    duplicateFrequency: memberOf<RecurrenceFrequency>(search.duplicateFrequency, BUILDER_FREQUENCIES),
    duplicateInterval: integerWithin(search.duplicateInterval, INTERVAL_MIN, INTERVAL_MAX),
    duplicateDays: weekdays(search.duplicateDays),
    duplicateThreshold: search.duplicateThreshold === true ? true : undefined,
  };
}

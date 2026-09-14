import { addDays, DEFAULT_LOCALE, parseISODate, toISODate } from '@shadow-library/ui';

import { formatLocalDate, formatLocalTime } from '@/lib/format';

import { type DeletionProgress, type ExportStage } from './account.types';
import { type Command } from './command.types';
import { type FinanceCommand } from './finance.types';
import { type HeroCommand } from './hero.types';
import { type OccurrenceState, type ReasonTag, type StatAffinity, type Strictness, type Weekday } from './quest.types';
import { type QuickLogCommand } from './quick-logs.types';
import { type DayMode } from './view.types';

export const COMING_BACK_NOTICES: Record<Extract<DayMode, 'recovery' | 'returner'>, { title: string; body: string }> = {
  recovery: {
    title: 'A recovery quest is on today',
    body: 'A quest was missed yesterday, so today also offers a lighter recovery quest you can keep before the day closes. Nothing you have earned was taken away.',
  },
  returner: {
    title: 'Welcome back',
    body: 'You have been away for a while. Your experience, levels and titles are untouched, and streaks that closed while you were gone keep their records in History.',
  },
};

export const DELETION_PROGRESS_COPY: Record<DeletionProgress, { title: string; body: string }> = {
  pending: { title: 'The erasure has started', body: 'Stored receipt images and export archives are removed first, then your records.' },
  blobs_deleted: { title: 'The erasure is under way', body: 'Receipt images and export archives are gone. Your records are being erased now.' },
  data_deleted: { title: 'The erasure is under way', body: 'Your records are erased. The last step asks Shadow to close your account, and it can take a while.' },
  identity_closed: { title: 'The erasure is nearly done', body: 'Your records are erased and Shadow has closed your account. Only the final clean-up is left.' },
  done: { title: 'Your data has been erased', body: 'Everything Shadow Memoir held about you is gone.' },
  unknown: { title: 'The erasure is under way', body: 'This account is being erased. It runs to the end on its own, and nothing more is needed from you.' },
};

export const DELETION_STEPS: { reachedAt: Exclude<DeletionProgress, 'pending' | 'unknown'>; label: string }[] = [
  { reachedAt: 'blobs_deleted', label: 'Receipt images and export archives removed' },
  { reachedAt: 'data_deleted', label: 'Records erased' },
  { reachedAt: 'identity_closed', label: 'Shadow closes your account' },
  { reachedAt: 'done', label: 'Final clean-up finished' },
];

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export const WEEKDAY_LONG_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const STAT_LABELS: Record<StatAffinity, string> = { discipline: 'Discipline', body: 'Body', wealth: 'Wealth', mind: 'Mind' };

export const STRICTNESS_LABELS: Record<Strictness, string> = { anchor: 'Anchor', routine: 'Routine', goal: 'Goal', recovery: 'Recovery', optional: 'Optional' };

export const STRICTNESS_RULES: Record<Strictness, string> = {
  anchor: 'A fixed time, with thirty minutes of grace. A break spends 1 HP.',
  routine: 'A window the length of the quest. A break spends 1 HP.',
  goal: 'Judged on the day, not the hour. A break costs no HP.',
  recovery: 'Offered the day after a miss. It can never trigger another.',
  optional: 'Reward only. It can never cost HP or end a streak.',
};

export const STATE_LABELS: Record<OccurrenceState, string> = {
  completed: 'Kept',
  partial: 'Partial',
  skipped: 'Skipped',
  missed: 'Missed',
  late: 'Late',
  postponed: 'Postponed',
  rescheduled: 'Moved',
  recovery: 'Recovery',
  upcoming: 'Open',
};

export const REASON_TAGS: ReasonTag[] = [
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

export const REASON_LABELS: Record<ReasonTag, string> = {
  forgot: 'forgot',
  too_tired: 'too tired',
  task_too_big: 'task too big',
  schedule_conflict: 'schedule conflict',
  avoided_it: 'avoided it',
  emotional_resistance: 'emotional resistance',
  health: 'health',
  travel: 'travel',
  family_social: 'family or social',
  work_emergency: 'work emergency',
  not_important_anymore: 'not important anymore',
  poorly_planned: 'poorly planned',
  other: 'other',
};

type OutboxCommandType = Command['type'] | FinanceCommand['type'] | QuickLogCommand['type'] | HeroCommand['type'];

export const COMMAND_LABELS: Partial<Record<OutboxCommandType, string>> = {
  'quest.complete': 'Quest completed',
  'quest.partial': 'Quest partly done',
  'quest.skip': 'Quest skipped',
  'quest.postpone': 'Quest postponed',
  'quest.reschedule': 'Quest moved',
  'quest.deleteLog': 'Quest outcome undone',
  'quest.create': 'New quest',
  'quest.update': 'Quest edited',
  'expense.create': 'Expense',
  'expense.update': 'Expense edited',
  'expense.delete': 'Expense deleted',
  'subscription.create': 'New subscription',
  'subscription.setActive': 'Subscription paused or resumed',
  'subscription.confirmCycle': 'Subscription charge confirmed',
  'journal.save': 'Journal entry',
  'meal.log': 'Meal',
  'meal.logPreset': 'Meal',
  'meal.savePreset': 'Meal preset',
  'weight.save': 'Weight',
  'sidequest.log': 'Side quest',
  'health.save': 'Health entry',
  'title.display': 'Displayed title',
  'cosmetic.purchase': 'Cosmetic bought',
  'cosmetic.equip': 'Cosmetic equipped',
};

export function commandLabel(type: string): string {
  return COMMAND_LABELS[type as OutboxCommandType] ?? 'Change';
}

export function toDate(value: string): Date {
  return parseISODate(value) ?? new Date(value);
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(toDate(date).getDay() + 6) % 7] as Weekday;
}

export function shiftDate(date: string, days: number): string {
  return toISODate(addDays(toDate(date), days));
}

export function startOfWeek(date: string): string {
  const parsed = toDate(date);
  return toISODate(addDays(parsed, -((parsed.getDay() + 6) % 7)));
}

export function formatTime(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatDayName(date: string, locale: string = DEFAULT_LOCALE): string {
  return toDate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatShortDate(date: string, locale: string = DEFAULT_LOCALE): string {
  return toDate(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function formatMonth(date: string, locale: string = DEFAULT_LOCALE): string {
  return toDate(date).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function formatRange(from: string, to: string, locale: string = DEFAULT_LOCALE): string {
  const start = toDate(from);
  const end = toDate(to);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = sameMonth ? String(start.getDate()) : start.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return `${startLabel} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

export const EXPORT_EXPIRED_NOTICE = 'That export expired — prepare a new one.';

interface ExportJobTimestamps {
  requestedAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
}

/** One line per stage, never restating the badge's own label ("Ready" / "Did not finish"). */
export function exportStageWhen(stage: Exclude<ExportStage, 'idle'>, job: ExportJobTimestamps): string {
  if (stage === 'preparing') return `Started ${formatLocalTime(job.requestedAt)}`;
  const finishedAt = formatLocalDate(job.completedAt ?? job.requestedAt);
  if (stage === 'failed') return `Tried ${finishedAt}`;
  return job.expiresAt ? `Prepared ${finishedAt} · the link expires ${formatLocalDate(job.expiresAt)}` : `Prepared ${finishedAt}`;
}

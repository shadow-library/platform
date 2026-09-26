import { type Knowledge, type Plan, type Story } from '@server/database';

export type PromiseKind = 'thread' | 'mystery';
export type PromiseStatus = Story.ThreadStatus | Story.MysteryStatus;
export type DueStanding = 'not_due' | 'due' | 'overdue';

export interface PromisePayoff {
  payoffWindow: number | null;
  payoffMilestoneKey: string | null;
  payoffVolumeKey: string | null;
}

export interface PromiseItem extends PromisePayoff {
  kind: PromiseKind;
  key: string;
  label: string;
  status: PromiseStatus;
  intentionallyOpen: boolean;
  openedChapter: number | null;
  lastAdvancedChapter: number | null;
  closedChapter: number | null;
  resolvedChapter: number | null;
  due: DueStanding;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * P4-41b: overdue once an authored chapter window has passed or the payoff volume already met its goal;
 * merely due once the payoff milestone is reached or the payoff volume is the one now active. Shared by the
 * chapter-plan obligation selector and the promises list so the two never drift.
 */
export function resolvePromiseDueStanding(
  payoff: PromisePayoff,
  chapter: number,
  milestoneStates?: ReadonlyMap<string, Knowledge.MilestoneState>,
  volumeStates?: ReadonlyMap<string, Plan.VolumeState>,
): DueStanding {
  const dueByChapter = payoff.payoffWindow !== null && payoff.payoffWindow <= chapter;
  const dueByMilestone = payoff.payoffMilestoneKey !== null && milestoneStates?.get(payoff.payoffMilestoneKey) === 'reached';
  const volumeState = payoff.payoffVolumeKey !== null ? volumeStates?.get(payoff.payoffVolumeKey) : undefined;
  if (dueByChapter || volumeState === 'goal_met') return 'overdue';
  if (dueByMilestone || volumeState === 'active') return 'due';
  return 'not_due';
}

type ThreadRow = Pick<
  Story.PlotThread,
  | 'threadKey'
  | 'summary'
  | 'status'
  | 'intentionallyOpen'
  | 'openedChapter'
  | 'closedChapter'
  | 'lastAdvancedChapter'
  | 'payoffWindow'
  | 'payoffMilestoneKey'
  | 'payoffVolumeKey'
  | 'createdAt'
  | 'updatedAt'
>;

type MysteryRow = Pick<
  Story.Mystery,
  | 'mysteryKey'
  | 'question'
  | 'status'
  | 'intentionallyOpen'
  | 'openedChapter'
  | 'resolvedChapter'
  | 'lastAdvancedChapter'
  | 'payoffWindow'
  | 'payoffMilestoneKey'
  | 'payoffVolumeKey'
  | 'createdAt'
  | 'updatedAt'
>;

export function threadPromiseItem(
  thread: ThreadRow,
  chapter: number,
  milestoneStates?: ReadonlyMap<string, Knowledge.MilestoneState>,
  volumeStates?: ReadonlyMap<string, Plan.VolumeState>,
): PromiseItem {
  return {
    kind: 'thread',
    key: thread.threadKey,
    label: thread.summary?.trim() || thread.threadKey,
    status: thread.status,
    intentionallyOpen: thread.intentionallyOpen,
    openedChapter: thread.openedChapter,
    lastAdvancedChapter: thread.lastAdvancedChapter,
    closedChapter: thread.closedChapter,
    resolvedChapter: null,
    payoffWindow: thread.payoffWindow,
    payoffMilestoneKey: thread.payoffMilestoneKey,
    payoffVolumeKey: thread.payoffVolumeKey,
    due: resolvePromiseDueStanding(thread, chapter, milestoneStates, volumeStates),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

/** Never carries the mystery's truth fact — only its key ever leaves the server, and this item does not even take that (P4-38). */
export function mysteryPromiseItem(
  mystery: MysteryRow,
  chapter: number,
  milestoneStates?: ReadonlyMap<string, Knowledge.MilestoneState>,
  volumeStates?: ReadonlyMap<string, Plan.VolumeState>,
): PromiseItem {
  return {
    kind: 'mystery',
    key: mystery.mysteryKey,
    label: mystery.question.trim() || mystery.mysteryKey,
    status: mystery.status,
    intentionallyOpen: mystery.intentionallyOpen,
    openedChapter: mystery.openedChapter,
    lastAdvancedChapter: mystery.lastAdvancedChapter,
    closedChapter: null,
    resolvedChapter: mystery.resolvedChapter,
    payoffWindow: mystery.payoffWindow,
    payoffMilestoneKey: mystery.payoffMilestoneKey,
    payoffVolumeKey: mystery.payoffVolumeKey,
    due: resolvePromiseDueStanding(mystery, chapter, milestoneStates, volumeStates),
    createdAt: mystery.createdAt,
    updatedAt: mystery.updatedAt,
  };
}

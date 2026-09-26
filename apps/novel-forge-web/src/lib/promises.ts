import { type ChipIntent } from '@/components/nf/StatusChip';

import { type PromiseItemResponse } from './apis/api-types.gen';
import { type MilestoneLike, type VolumeLike } from './secret-states';

/** The server's maximum page; it orders by creation, so grouping by due holds across the whole list only while it fits one page. */
export const PROMISE_PAGE_SIZE = 100;

/** Mirrors the server's dormant-thread report (`DORMANT_THREAD_THRESHOLD_CHAPTERS`), so the page and the planner call the same promise quiet. */
export const QUIET_AFTER_CHAPTERS = 6;

export type PromiseItem = Pick<
  PromiseItemResponse,
  | 'kind'
  | 'key'
  | 'label'
  | 'status'
  | 'intentionallyOpen'
  | 'openedChapter'
  | 'lastAdvancedChapter'
  | 'closedChapter'
  | 'resolvedChapter'
  | 'payoffMilestoneKey'
  | 'payoffVolumeKey'
  | 'payoffWindow'
  | 'due'
>;

export type PromiseGroupKey = 'overdue' | 'due' | 'open' | 'dormant' | 'paid' | 'dropped';

export interface PromiseGroup<T extends PromiseItem> {
  key: PromiseGroupKey;
  label: string;
  items: T[];
}

const GROUP_LABEL: Record<PromiseGroupKey, string> = {
  overdue: 'Overdue',
  due: 'Due now',
  open: 'Open',
  dormant: 'Dormant on purpose',
  paid: 'Paid off',
  dropped: 'Dropped',
};

const GROUP_ORDER: readonly PromiseGroupKey[] = ['overdue', 'due', 'open', 'dormant', 'paid', 'dropped'];

export function promiseGroupKey(item: PromiseItem): PromiseGroupKey {
  if (item.status === 'dropped') return 'dropped';
  if (item.status === 'closed' || item.status === 'resolved') return 'paid';
  if (item.due === 'overdue') return 'overdue';
  if (item.due === 'due') return 'due';
  return item.intentionallyOpen ? 'dormant' : 'open';
}

/** Overdue first, then due, then the rest; within a group the server's order stands. */
export function promiseGroups<T extends PromiseItem>(items: readonly T[]): PromiseGroup<T>[] {
  return GROUP_ORDER.map(key => ({ key, label: GROUP_LABEL[key], items: items.filter(item => promiseGroupKey(item) === key) })).filter(group => group.items.length > 0);
}

export function kindLabel(item: Pick<PromiseItem, 'kind'>): string {
  return item.kind === 'mystery' ? 'Mystery' : 'Thread';
}

export function chapterLabel(chapter: number | null | undefined): string {
  return chapter != null ? `ch ${chapter}` : '—';
}

/** The chapter a promise last moved in: its last advance, else the chapter that opened it. */
export function lastMoved(item: Pick<PromiseItem, 'lastAdvancedChapter' | 'openedChapter'>): number | undefined {
  return item.lastAdvancedChapter ?? item.openedChapter ?? undefined;
}

export interface PayoffLookup {
  milestones: ReadonlyMap<string, MilestoneLike>;
  volumes: ReadonlyMap<string, VolumeLike>;
}

/** Every target the promise names, in the order the server weighs them; none at all reads as "Someday". */
export function payoffLabels(item: Pick<PromiseItem, 'payoffMilestoneKey' | 'payoffVolumeKey' | 'payoffWindow'>, lookup: PayoffLookup): string[] {
  const labels: string[] = [];
  if (item.payoffMilestoneKey) labels.push(`Milestone: ${lookup.milestones.get(item.payoffMilestoneKey)?.label ?? item.payoffMilestoneKey}`);
  if (item.payoffVolumeKey) {
    const volume = lookup.volumes.get(item.payoffVolumeKey);
    labels.push(volume ? `Volume ${volume.ordinal}${volume.title?.trim() ? ` · ${volume.title.trim()}` : ''}` : `Volume ${item.payoffVolumeKey}`);
  }
  if (item.payoffWindow != null) labels.push(`By ch ${item.payoffWindow}`);
  return labels.length > 0 ? labels : ['Someday'];
}

export interface PromiseChip {
  text: string;
  intent: ChipIntent;
}

export function statusChips(item: PromiseItem): PromiseChip[] {
  if (item.status === 'dropped') return [{ text: 'Dropped', intent: 'neutral' }];
  if (item.status === 'closed' || item.status === 'resolved') {
    const chapter = item.closedChapter ?? item.resolvedChapter;
    return [{ text: chapter != null ? `Paid off ch ${chapter}` : 'Paid off', intent: 'success' }];
  }
  const chips: PromiseChip[] = [item.intentionallyOpen ? { text: 'Dormant on purpose', intent: 'neutral' } : { text: 'Open', intent: 'accent' }];
  if (item.due === 'overdue') chips.push({ text: 'Overdue', intent: 'danger' });
  if (item.due === 'due') chips.push({ text: 'Due', intent: 'warning' });
  return chips;
}

export interface QuietPromise<T extends PromiseItem> {
  item: T;
  since: number;
  chapters: number;
}

/** The open promise that has gone longest without moving, counted from the last written chapter as the server's report counts it; dormant-on-purpose ones are silenced. */
export function quietestPromise<T extends PromiseItem>(items: readonly T[], nextChapter: number | undefined): QuietPromise<T> | undefined {
  if (nextChapter === undefined) return undefined;
  let quietest: QuietPromise<T> | undefined;
  for (const item of items) {
    const since = lastMoved(item);
    if (item.status !== 'open' || item.intentionallyOpen || since === undefined) continue;
    const chapters = nextChapter - 1 - since;
    if (chapters > QUIET_AFTER_CHAPTERS && (!quietest || chapters > quietest.chapters)) quietest = { item, since, chapters };
  }
  return quietest;
}

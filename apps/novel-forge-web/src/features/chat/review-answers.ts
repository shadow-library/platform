import { type ChangeOp } from '@/lib/proposals';

import { answeredInPanel, type CommitBarView, proposalPresentation, type RejectionScope, type SuggestionDecision } from './chat-view';
import { type CardPanelChange, type CardState, changeAnswered, plural } from './progress-panel-view';
import { nextOpenItem, type ReviewFilter, type ReviewItem, type ReviewVersion } from './review-dialog-view';

export type VersionKey = ReviewVersion['key'];

export function reviewableCard(proposal: { kind: string; status: string; changeSet: readonly ChangeOp[] }): boolean {
  return answeredInPanel(proposal) && proposal.status === 'pending' && proposalPresentation(proposal) === 'suggestions';
}

export function itemAnswered(item: Pick<ReviewItem, 'opIndexes'>, decisions: ReadonlyMap<number, SuggestionDecision>): boolean {
  return changeAnswered(item.opIndexes, decisions);
}

export function itemDecisions(item: Pick<ReviewItem, 'opIndexes' | 'versions'>, decision: SuggestionDecision, version: VersionKey = 'notes'): [number, SuggestionDecision][] {
  if (!item.versions || decision === 'decline') return item.opIndexes.map(index => [index, decision]);
  return item.versions.map(entry => [entry.opIndex, entry.key === version ? 'add' : 'decline']);
}

export function clearedDecisions(item: Pick<ReviewItem, 'opIndexes'>): [number, undefined][] {
  return item.opIndexes.map(index => [index, undefined]);
}

export function withDecisions(
  decisions: ReadonlyMap<number, SuggestionDecision>,
  answers: readonly (readonly [number, SuggestionDecision | undefined])[],
): Map<number, SuggestionDecision> {
  const next = new Map(decisions);
  for (const [index, decision] of answers) {
    if (decision) next.set(index, decision);
    else next.delete(index);
  }
  return next;
}

export interface ItemAnswer {
  status: CardState;
  kept?: VersionKey;
  scopeIndex?: number;
  askScope: readonly RejectionScope[];
  scope?: RejectionScope;
}

const STATUS_ORDER: readonly CardState[] = ['add', 'added', 'undone', 'open', 'decline', 'declined', 'replaced'];
const KEPT: ReadonlySet<CardState> = new Set(['add', 'added', 'undone']);

type AnswerRow = Pick<CardPanelChange, 'state' | 'askScope' | 'scope'>;

export function itemAnswer(item: Pick<ReviewItem, 'opIndexes' | 'versions'>, rows: ReadonlyMap<number, AnswerRow>): ItemAnswer {
  const own = item.opIndexes.flatMap(index => {
    const row = rows.get(index);
    return row ? [{ index, ...row }] : [];
  });
  const status = STATUS_ORDER.find(state => own.some(row => row.state === state)) ?? 'open';
  const kept = item.versions?.find(version => KEPT.has(rows.get(version.opIndex)?.state ?? 'open'))?.key;
  const asking = status === 'open' ? undefined : own.find(row => row.askScope.length > 0);
  const scoped = own.find(row => row.scope !== undefined);
  const scopeIndex = asking?.index ?? scoped?.index;
  return { status, ...(kept && { kept }), ...(scopeIndex !== undefined && { scopeIndex }), askScope: asking?.askScope ?? [], ...(scoped?.scope && { scope: scoped.scope }) };
}

export type ReviewFocus = { kind: 'item'; key: string } | { kind: 'done' };

type Shown = (item: ReviewItem) => boolean;
const EVERY: Shown = () => true;

export function filterShows(filter: ReviewFilter, item: Pick<ReviewItem, 'idea'>, open: boolean): boolean {
  if (filter === 'waiting') return open;
  return filter === 'ideas' ? item.idea : true;
}

/** The next unanswered change the filter shows; once those are done, any other still waiting. */
export function focusAfterAnswer(items: readonly ReviewItem[], fromKey: string, decisions: ReadonlyMap<number, SuggestionDecision>, shown: Shown = EVERY): ReviewFocus {
  const open = (item: ReviewItem): boolean => !itemAnswered(item, decisions);
  const next = nextOpenItem(items, fromKey, item => !(shown(item) && open(item))) ?? nextOpenItem(items, fromKey, item => !open(item));
  return next === undefined ? { kind: 'done' } : { kind: 'item', key: next };
}

export function openingFocus(items: readonly ReviewItem[], decisions: ReadonlyMap<number, SuggestionDecision>, pending: boolean): ReviewFocus {
  const first = items.find(item => !itemAnswered(item, decisions));
  return pending && first ? { kind: 'item', key: first.key } : { kind: 'done' };
}

export function movedFocus(items: readonly ReviewItem[], focus: ReviewFocus, step: 1 | -1, shown: Shown = EVERY): ReviewFocus {
  const at = focus.kind === 'item' ? items.findIndex(item => item.key === focus.key) : items.length;
  const ahead = step === 1 ? items.slice(at + 1) : items.slice(0, Math.max(at, 0)).reverse();
  const item = ahead.find(shown);
  return item ? { kind: 'item', key: item.key } : focus;
}

export type ReviewKeyAction = { kind: 'add' } | { kind: 'decline' } | { kind: 'move'; step: 1 | -1 } | { kind: 'scope'; position: number };

export interface ReviewKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

const KEY_ACTIONS: Record<string, ReviewKeyAction> = {
  a: { kind: 'add' },
  d: { kind: 'decline' },
  j: { kind: 'move', step: 1 },
  ArrowDown: { kind: 'move', step: 1 },
  k: { kind: 'move', step: -1 },
  ArrowUp: { kind: 'move', step: -1 },
  '1': { kind: 'scope', position: 0 },
  '2': { kind: 'scope', position: 1 },
  '3': { kind: 'scope', position: 2 },
};

export function reviewKeyAction(event: ReviewKey, typing: boolean): ReviewKeyAction | undefined {
  if (typing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  const action = KEY_ACTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  return event.repeat && action?.kind !== 'move' ? undefined : action;
}

const SOURCE: Record<string, string> = {
  organise: 'From organising your notes',
  chat: 'From this chat turn',
  hub: 'From this chat turn',
  bible_audit: 'From the Story Bible audit',
  chapter_extract: 'From a chapter',
  premise_enhance: 'From the premise review',
  plugin: 'From a plugin',
};

export function reviewSource(kind: string, total: number): string {
  return `${SOURCE[kind] ?? 'Suggested changes'} · ${plural(total, 'change', 'changes')}`;
}

export interface DoneView {
  title: string;
  detail: string;
  commit?: { label: string; force: boolean };
}

export interface DoneInput {
  status: string;
  total: number;
  added: number;
  bar: CommitBarView;
}

export function doneView({ status, total, added, bar }: DoneInput): DoneView {
  if (total === 0) return { title: 'Nothing to review', detail: 'This card has no Story Bible changes.' };
  if (status === 'applied' || status === 'reverted') {
    return { title: 'Your Story Bible is updated', detail: `${plural(added, 'change', 'changes')} added, ${total - added} left out. Pick any change to look back at it.` };
  }
  if (status === 'discarded') return { title: 'Nothing was added', detail: total === 1 ? 'You left out the change.' : `You left out all ${total} changes.` };
  if (status !== 'pending') return { title: 'These changes were replaced', detail: 'A newer card replaced this one before anything was added.' };
  if (bar.kind === 'committing') return { title: 'Adding to your Story Bible…', detail: 'Your answers are being saved.' };
  if (bar.kind === 'ready') return { title: bar.failed ? 'Couldn’t finish' : 'Every change has an answer', detail: bar.text, commit: { label: bar.action, force: false } };
  if (bar.kind === 'partial') return { title: 'Every change has an answer', detail: bar.text, commit: { label: bar.action, force: true } };
  return { title: 'Every change has an answer', detail: 'Nothing is saved until you add it.' };
}

export function progressLabel(status: string, answered: number, total: number, added: number): string {
  if (status === 'pending') return `${answered} of ${total} answered`;
  if (status === 'applied' || status === 'reverted') return `Saved · ${added} added`;
  return status === 'discarded' ? 'Saved · nothing added' : 'Replaced by a newer card';
}

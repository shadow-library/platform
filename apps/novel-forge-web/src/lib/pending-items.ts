import { type ChipIntent } from '@/components/nf/StatusChip';
import { type ContinuityProposalResponse, type DraftSummaryItem, type FinalizeReviewResponse, type ProposalResponse, type RefinementKind } from '@/lib/apis';

import { chapterTitle } from './chapter-editor';
import { decisionsPhase } from './finalize-review';

export type PendingKind = 'draft' | 'decisions' | 'continuity' | 'proposal';

export interface PendingItem {
  /** Also the `data-pending` mark on the card that shows it in the thread. */
  key: string;
  kind: PendingKind;
  chip: { label: string; intent: ChipIntent };
  title: string;
  /** The few words the collapsed tray names it by. */
  short: string;
  source: string;
  /** The thread already shows its card, so the tray scrolls to it; otherwise the tray brings the card into this chat. */
  inThread: boolean;
  /** The card to bring into this chat, for one the thread does not show. */
  proposalId?: string;
}

export type PendingProposal = Pick<ProposalResponse, 'id' | 'sessionId' | 'kind' | 'status' | 'summary' | 'scopeRef' | 'changeSet' | 'createdAt'>;

export interface PendingItemsInput {
  sessionId: string | undefined;
  drafts: readonly Pick<DraftSummaryItem, 'chapter' | 'title' | 'reviewStatus'>[];
  decisions: readonly Pick<FinalizeReviewResponse, 'id' | 'chapter' | 'status' | 'open'>[];
  /** Reviews whose reading job still runs, which may finalize on their own. */
  settling: readonly string[];
  continuity: readonly Pick<ContinuityProposalResponse, 'id' | 'chapter' | 'status'>[];
  /** Pending refinement proposals across the whole project. */
  proposals: readonly PendingProposal[];
  /** Cards this chat's replies and jobs carry, whichever chat they were staged for. */
  shownProposals: ReadonlySet<string>;
  pluginTitles?: ReadonlyMap<string, string>;
}

export interface PendingTray {
  count: number;
  /** Items the thread does not show yet: the tray opens on its own while there are any. */
  elsewhere: number;
  /** What the collapsed tray names, in order. */
  names: string;
}

interface KindView {
  label: string;
  intent: ChipIntent;
  source: string;
  short: string;
}

const CHAT_KIND: KindView = { label: 'changes', intent: 'neutral', source: 'a chat', short: 'chat changes' };

const PROPOSAL_KINDS: Record<RefinementKind, KindView> = {
  bible_audit: { label: 'bible', intent: 'info', source: 'Story Bible · audit', short: 'Story Bible audit' },
  chapter_extract: { label: 'bible', intent: 'info', source: 'Chapters · canon from a chapter', short: 'canon from a chapter' },
  plugin: { label: 'plugin', intent: 'accent', source: 'plugin', short: 'plugin changes' },
  premise_enhance: { label: 'premise', intent: 'info', source: 'premise review', short: 'premise changes' },
  organise: { label: 'notes', intent: 'info', source: 'organised notes', short: 'organised notes' },
  chapter_plan: { label: 'plan', intent: 'info', source: 'chapter planning', short: 'chapter plan' },
  chat: CHAT_KIND,
  hub: CHAT_KIND,
};

export const NEEDS_READ: ReadonlySet<string> = new Set(['needs_review', 'contradiction']);

export function pendingKey(kind: PendingKind, id: string | number): string {
  return `${kind}:${id}`;
}

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? '' : 's'}`;
}

function planChapter(proposal: PendingProposal): number | undefined {
  const op = proposal.changeSet.find(entry => entry.op === 'brief.update' && typeof entry.chapter === 'number');
  return op && typeof op.chapter === 'number' ? op.chapter : undefined;
}

/** A card that stages one action reads as that action, not as the chat's generic "changes". */
const ACTION_NAMES: Partial<Record<string, { title: string; short: string }>> = {
  'action.plan_chapter': { title: 'Plan for the next chapter', short: 'chapter plan' },
  'action.generate_chapter': { title: 'Write the next chapter', short: 'chapter to write' },
  'action.revise_draft': { title: 'Revise a chapter', short: 'revision' },
  'action.approve_draft': { title: 'Approve a chapter', short: 'approval' },
  'action.finalize': { title: 'Finalize chapters', short: 'finalize' },
};

function actionName(proposal: PendingProposal): { title: string; short: string } | undefined {
  const [only] = proposal.changeSet;
  return proposal.changeSet.length === 1 && only ? ACTION_NAMES[String(only.op)] : undefined;
}

function proposalTitle(proposal: PendingProposal): string {
  const summary = proposal.summary?.trim().split('\n')[0]?.trim();
  if (summary) return summary;
  const action = actionName(proposal);
  if (action) return action.title;
  const chapter = proposal.kind === 'chapter_plan' ? planChapter(proposal) : undefined;
  if (chapter !== undefined) return `Chapter ${chapter} plan`;
  return plural(proposal.changeSet.length, 'change');
}

function proposalSource(proposal: PendingProposal, sessionId: string | undefined, pluginTitles: ReadonlyMap<string, string> | undefined): string {
  if (proposal.sessionId) return proposal.sessionId === sessionId ? 'this chat' : 'another chat';
  if (proposal.kind === 'plugin' && proposal.scopeRef) return pluginTitles?.get(proposal.scopeRef) ?? proposal.scopeRef;
  return PROPOSAL_KINDS[proposal.kind].source;
}

export function decisionsWaiting<T extends Pick<FinalizeReviewResponse, 'id' | 'status' | 'open'>>(decisions: readonly T[], settling: readonly string[]): T[] {
  return decisions.filter(review => !['reading', 'settling'].includes(decisionsPhase(review, settling.includes(review.id))));
}

function byChapter<T extends { chapter: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.chapter - right.chapter);
}

function oldestFirst(left: PendingProposal, right: PendingProposal): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

/**
 * Everything waiting on the author across the novel, in the order they are best answered: drafts to read, then Story Bible decisions,
 * then continuity additions, then cards by age. A finalize review still reading, or finalizing on its own, waits on nobody yet.
 */
export function pendingItems(input: PendingItemsInput): PendingItem[] {
  const { sessionId, shownProposals, pluginTitles } = input;
  const drafts = byChapter(input.drafts.filter(draft => NEEDS_READ.has(draft.reviewStatus))).map((draft): PendingItem => ({
    key: pendingKey('draft', draft.chapter),
    kind: 'draft',
    chip: { label: 'draft', intent: draft.reviewStatus === 'contradiction' ? 'danger' : 'warning' },
    title: `Chapter ${draft.chapter}: ${chapterTitle(draft)}`,
    short: `chapter ${draft.chapter} draft`,
    source: draft.reviewStatus === 'contradiction' ? 'conflicts with canon' : 'ready to read',
    inThread: true,
  }));
  const decisions = byChapter(decisionsWaiting(input.decisions, input.settling)).map((review): PendingItem => {
    const open = review.open.consequential + review.open.routine;
    return {
      key: pendingKey('decisions', review.id),
      kind: 'decisions',
      chip: { label: 'decisions', intent: review.status === 'failed' ? 'danger' : 'warning' },
      title:
        review.status === 'failed'
          ? `Chapter ${review.chapter}: reading its Story Bible updates failed`
          : `Chapter ${review.chapter}: ${open > 0 ? plural(open, 'decision') : 'ready to finalize'}`,
      short: `chapter ${review.chapter} decisions`,
      source: 'finalize review',
      inThread: true,
    };
  });
  const continuity = byChapter(input.continuity.filter(proposal => proposal.status === 'pending')).map((proposal): PendingItem => ({
    key: pendingKey('continuity', proposal.id),
    kind: 'continuity',
    chip: { label: 'continuity', intent: 'info' },
    title: `Chapter ${proposal.chapter}: Story Bible additions`,
    short: `chapter ${proposal.chapter} continuity`,
    source: 'finalize',
    inThread: true,
  }));
  const proposals = [...input.proposals]
    .filter(proposal => proposal.status === 'pending')
    .sort(oldestFirst)
    .map((proposal): PendingItem => {
      const kind = PROPOSAL_KINDS[proposal.kind];
      const inThread = shownProposals.has(proposal.id) || (sessionId !== undefined && proposal.sessionId === sessionId);
      return {
        key: pendingKey('proposal', proposal.id),
        kind: 'proposal',
        chip: { label: kind.label, intent: kind.intent },
        title: proposalTitle(proposal),
        short: actionName(proposal)?.short ?? kind.short,
        source: inThread && !proposal.sessionId ? 'this chat' : proposalSource(proposal, sessionId, pluginTitles),
        inThread,
        ...(inThread ? {} : { proposalId: proposal.id }),
      };
    });
  const seen = new Set<string>();
  return [...drafts, ...decisions, ...continuity, ...proposals].filter(item => !seen.has(item.key) && Boolean(seen.add(item.key)));
}

export function pendingTray(items: readonly PendingItem[]): PendingTray {
  return {
    count: items.length,
    elsewhere: items.filter(item => !item.inThread).length,
    names: items.map(item => item.short).join(' · '),
  };
}

import { textDigest } from '@shadow-library/sdk';

import { type ChatJobState, type OrganiseReceipt } from '@/lib/apis/chat.api';
import { type GenerationActivity } from '@/lib/generation-activity';
import { isRecord } from '@/lib/is-record';
import {
  type ChatMessageResponse,
  type ChatQuestionResponse,
  type ChatTurnResponse,
  type JobKind,
  type LedgerRejectionScope,
  type ProgressItemKey,
  type ProgressItemResponse,
  type UndoImpactResponse,
} from '@/lib/apis/api-types.gen';
import { type ChangeOp } from '@/lib/proposals';

const PROSE_FIELDS = [
  'body',
  'rule',
  'objective',
  'premise',
  'motivation',
  'notes',
  'brief',
  'note',
  'constraintNote',
  'writerNote',
  'opposition',
  'theme',
  'readerPromise',
  'endingQuestion',
  'ending',
] as const;
export const PREMISE_FIELDS = ['premise', 'brief', 'themes', 'instructions'] as const;
export const STORY_FIELD_LABELS = {
  theme: 'Theme',
  readerPromise: 'Reader promise',
  protagonistKey: 'Protagonist',
  opposition: 'Opposition',
  endingQuestion: 'Ending question',
  ending: 'Ending',
} as const;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Names the story basics a premise.update sets, with "Premise" standing for the premise, brief, themes and instructions together. */
function storySubject(op: ChangeOp): string {
  const named = Object.entries(STORY_FIELD_LABELS).flatMap(([field, name]) => (op[field] === undefined ? [] : [name]));
  const premise = PREMISE_FIELDS.some(field => op[field] !== undefined) || named.length === 0;
  return [...(premise ? ['Premise'] : []), ...named].join(', ');
}

export function isPassageRewrite(op: ChangeOp): boolean {
  return String(op.op) === 'draft.rewrite_passage';
}

/** The paragraph a passage rewrite starts in, as the server anchored it when the card was staged. */
function rewriteParagraph(op: ChangeOp): number | undefined {
  const paragraph = isRecord(op.anchor) ? op.anchor.paragraph : undefined;
  return typeof paragraph === 'number' ? paragraph : undefined;
}

function rewriteSubject(op: ChangeOp): string {
  const paragraph = rewriteParagraph(op);
  const label = text(op.label);
  const chapter = String(op.chapter);
  if (paragraph === undefined) return label ? `Chapter ${chapter} · ${label}` : `A passage of chapter ${chapter}`;
  return label ? `¶${paragraph} · ${label}` : `¶${paragraph} of chapter ${chapter}`;
}

export function opSubject(op: ChangeOp): string {
  const type = String(op.op);
  if (type === 'premise.update') return storySubject(op);
  if (isPassageRewrite(op)) return rewriteSubject(op);
  if (type === 'organise.rule') return 'Rule';
  if (type === 'volume.upsert') return text(op.title) ?? `Volume ${String(op.volumeKey)}`;
  if (type === 'milestone.upsert') return text(op.label) ?? String(op.milestoneKey);
  if (type.startsWith('promise.')) return text(op.label) ?? String(op.key ?? op.op);
  if (type === 'brief.update') return text(op.title) ?? `Chapter ${String(op.chapter)}`;
  if (type === 'bible_document.upsert') return text(isRecord(op.frontmatter) ? op.frontmatter.title : undefined) ?? String(op.slug).replace(/[-_]/g, ' ');
  if (type.startsWith('action.')) return actionSubject(op);
  return text(op.name) ?? String(op.entityKey ?? op.factKey ?? op.op);
}

function actionSubject(op: ChangeOp): string {
  const chapter = `chapter ${String(op.chapter)}`;
  switch (String(op.op)) {
    case 'action.generate_chapter':
      return `Write ${chapter}`;
    case 'action.plan_chapter':
      return 'Plan the next chapter';
    case 'action.revise_draft':
      return `Revise ${chapter}`;
    case 'action.judge_draft':
      return `Check ${chapter} against the Story Bible`;
    case 'action.approve_draft':
      return `Approve ${chapter}`;
    case 'action.finalize':
      return typeof op.upTo === 'number' ? `Finalize chapters up to ${op.upTo}` : 'Finalize the approved chapters';
    case 'action.apply_continuity':
      return `Add ${chapter} to the Story Bible`;
    case 'action.validate':
      return typeof op.chapter === 'number' ? `Check ${chapter} for continuity` : 'Check the novel for continuity';
    case 'action.organise_notes':
      return 'Organise your notes';
    case 'action.audit_bible':
      return 'Audit the Story Bible';
    case 'action.enhance_premise':
      return 'Strengthen the premise';
    case 'action.advance_volume':
      return 'Mark this volume’s goal met and start the next';
    default:
      return 'Run an action';
  }
}

/** The field the op actually writes, shown beside its quote: a quote proves the author said the words, not that the value is faithful to them. */
export function opWrittenField(op: ChangeOp): (typeof PROSE_FIELDS)[number] | 'label' | 'title' | 'name' | undefined {
  const prose = PROSE_FIELDS.find(field => text(op[field]));
  if (prose) return prose;
  if (text(op.label)) return 'label';
  if (text(op.title)) return 'title';
  return text(op.name) ? 'name' : undefined;
}

export function opWrittenText(op: ChangeOp): string {
  const field = opWrittenField(op);
  return (field ? text(op[field]) : undefined) ?? opSubject(op);
}

export interface UndoImpactView {
  empty: boolean;
  counts: string[];
  finalNote?: string;
}

const DEPENDENT_NOUN: Record<string, [string, string]> = {
  plan: ['chapter plan', 'chapter plans'],
  draft: ['draft', 'drafts'],
  knowledge: ['thing a character knows', 'things characters know'],
  suggestion: ['waiting suggestion', 'waiting suggestions'],
};

function counted(count: number, [one, many]: [string, string]): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A card whose every change rewrites passages of one chapter names that chapter, as "2 changes to chapter 3". */
export function turnCardTitle(changeSet: readonly ChangeOp[]): string {
  const count = counted(changeSet.length, ['change', 'changes']);
  const chapters = new Set(changeSet.map(op => (isPassageRewrite(op) ? String(op.chapter) : undefined)));
  const [chapter] = chapters;
  return chapters.size === 1 && chapter !== undefined ? `${count} to chapter ${chapter}` : count;
}

export interface PassageDiffView {
  removed: string;
  added: string;
}

/** The words a passage rewrite takes out and puts in, each without the surrounding whitespace the server keeps in place. */
export function passageDiffView(op: ChangeOp): PassageDiffView {
  return { removed: String(op.passage ?? '').trim(), added: String(op.replacement ?? '').trim() };
}

export function mergeUndoImpacts(impacts: readonly UndoImpactResponse[]): UndoImpactResponse | undefined {
  const [first] = impacts;
  if (!first) return undefined;
  const refs = new Set<string>();
  const dependents = impacts.flatMap(impact => impact.dependents).filter(dependent => !refs.has(dependent.ref) && Boolean(refs.add(dependent.ref)));
  return { proposalId: first.proposalId, dependents, finalUnaffected: impacts.reduce((sum, impact) => sum + impact.finalUnaffected, 0) };
}

export function undoImpactView(impact: UndoImpactResponse): UndoImpactView {
  const byKind = new Map<string, number>();
  for (const dependent of impact.dependents) byKind.set(dependent.kind, (byKind.get(dependent.kind) ?? 0) + 1);
  const counts = [...byKind.entries()].map(([kind, count]) => counted(count, DEPENDENT_NOUN[kind] ?? [kind, kind]));
  const finalNote =
    impact.finalUnaffected > 0 ? `${counted(impact.finalUnaffected, ['final chapter or plan', 'final chapters and plans'])} also rely on it and stay as they are.` : undefined;
  return { empty: impact.dependents.length === 0 && !finalNote, counts, finalNote };
}

export function dependentLabel(ref: string, chapter?: number | null): string {
  const [kind, rest = ''] = ref.split(':');
  if (kind === 'chapter') return `Chapter ${rest} plan`;
  if (kind === 'draft') return `Chapter ${rest} draft`;
  if (kind === 'knowledge') return `${rest.replace('/', ' knows ')}${chapter ? ` (since chapter ${chapter})` : ''}`;
  if (kind === 'proposal') return 'A suggestion waiting for you';
  return ref;
}

export type SuggestionDecision = 'add' | 'decline';

export type SuggestionCommit = { kind: 'wait' } | { kind: 'apply'; opIndexes: number[] } | { kind: 'discard' };

/** Applying names every op it keeps and declines the rest in one call, so the card commits once every suggestion has an answer. */
export function suggestionCommit(total: number, decisions: ReadonlyMap<number, SuggestionDecision>, force = false): SuggestionCommit {
  if (!force && decisions.size < total) return { kind: 'wait' };
  const opIndexes = [...decisions.entries()].filter(([, decision]) => decision === 'add').map(([index]) => index);
  if (opIndexes.length === 0) return force && decisions.size < total ? { kind: 'wait' } : { kind: 'discard' };
  return { kind: 'apply', opIndexes: opIndexes.sort((a, b) => a - b) };
}

/** A finding the author skipped in the audit stays declined wherever the card is answered: the server refuses its op (AUD_006). */
export function withAuditSkips(decisions: ReadonlyMap<number, SuggestionDecision>, skipped: ReadonlySet<number>): ReadonlyMap<number, SuggestionDecision> {
  if (skipped.size === 0) return decisions;
  const next = new Map(decisions);
  for (const index of skipped) next.set(index, 'decline');
  return next;
}

export type ProposalPresentation = 'plan' | 'suggestions' | 'applied' | 'reverted' | 'passed' | 'legacy';

const ONE_WAY_DOORS = new Set(['action.finalize', 'action.approve_draft', 'action.apply_continuity', 'action.generate_chapter', 'action.advance_volume']);

/** How the transcript draws a proposal: one-way doors keep the explicit per-op card, where nothing is selected for the author. */
export function proposalPresentation(proposal: { kind: string; status: string; changeSet: readonly ChangeOp[] }): ProposalPresentation {
  if (proposal.kind === 'chapter_plan') return 'plan';
  if (proposal.status === 'applied') return 'applied';
  if (proposal.status === 'reverted') return 'reverted';
  if (proposal.status === 'discarded') return 'passed';
  if (proposal.status !== 'pending' || proposal.changeSet.some(op => ONE_WAY_DOORS.has(String(op.op)))) return 'legacy';
  return 'suggestions';
}

const OWN_CARD_OPS = new Set(['draft.update', 'draft.remove', 'draft.rewrite_passage', 'brief.update']);

export function organisePage(proposal: { kind: string; changeSet: readonly ChangeOp[] }, index: number): string | undefined {
  const op = proposal.changeSet[index];
  if (proposal.kind !== 'organise' || op?.op !== 'bible_document.upsert') return undefined;
  return `${String(op.section)}/${String(op.slug)}`;
}

/** An organise card offers a mixed page twice, its notes-backed half before the whole page, whatever the entries are labelled; maps the earlier index to the later one. */
export function mixedPagePairs(proposal: { kind: string; changeSet: readonly ChangeOp[] }): Map<number, number> {
  const byPage = new Map<string, number[]>();
  proposal.changeSet.forEach((_, index) => {
    const page = organisePage(proposal, index);
    if (page !== undefined) byPage.set(page, [...(byPage.get(page) ?? []), index]);
  });
  const pairs = new Map<number, number>();
  for (const indexes of byPage.values()) {
    const [notes, whole] = indexes;
    if (indexes.length === 2 && notes !== undefined && whole !== undefined) pairs.set(notes, whole);
  }
  return pairs;
}

/** An action starts work or walks through a one-way door, and prose or a plan edit is read in full, so each keeps its own card in the thread. */
export function answeredInPanel(proposal: { kind: string; changeSet: readonly ChangeOp[] }): boolean {
  return proposal.kind !== 'chapter_plan' && !proposal.changeSet.some(op => isActionOp(op) || OWN_CARD_OPS.has(String(op.op)));
}

/** A turn's card proposal that needs its own card in the thread; unknown until it loads, and shown on a load error so the error can be retried. */
export function turnCardsInline(proposal: { kind: string; changeSet: readonly ChangeOp[] } | undefined, loading: boolean): boolean {
  if (loading) return false;
  return !proposal || (proposal.kind !== 'chapter_plan' && !answeredInPanel(proposal));
}

/** The apply note worth a toast: a hold on cards answered in the panel is explained in the turn's receipt, unless the applied side also lost its link to the reply. */
export function applyNoteToast(turn: Pick<ChatTurnResponse, 'applyNote' | 'held' | 'proposal' | 'appliedProposal' | 'assistantMessage'>): string | undefined {
  if (!turn.applyNote) return undefined;
  const explained = turn.held !== undefined && turn.proposal !== undefined && answeredInPanel(turn.proposal);
  const unlinked = turn.appliedProposal !== undefined && !turn.assistantMessage.appliedProposalId;
  return explained && !unlinked ? undefined : turn.applyNote;
}

const FINALIZE_BLOCKED_CODES: ReadonlySet<string> = new Set(['FRV_002', 'FRV_003', 'FRV_004', 'FRV_005', 'FRV_006']);

/** A finalize action refused because its review isn't ready or answered yet — every other failure keeps the bare error. */
export function finalizeReviewBlocked(op: ChangeOp, code: string): boolean {
  return String(op.op) === 'action.finalize' && FINALIZE_BLOCKED_CODES.has(code);
}

/** The chapter to open the finalize review for, when the action named one; otherwise the review's own chapter is unknown to the client. */
export function finalizeReviewChapter(op: ChangeOp): number | undefined {
  return typeof op.upTo === 'number' ? op.upTo : undefined;
}

/** An action step, not an idea for the Story Bible — the reject route refuses every scope on one outright (LDG_007). */
export function isActionOp(op: ChangeOp): boolean {
  return String(op.op).startsWith('action.');
}

export type RejectionScope = LedgerRejectionScope;

export const REJECTION_SCOPE_LABEL: Record<RejectionScope, string> = {
  never: 'Never',
  not_now: 'Not now — maybe later',
  not_this_version: 'Not for this version',
};

/** Whether a decline's `not_this_version` scope has anything to anchor to — false for an action (see `isActionOp`) and for `organise.rule`, which the server refuses that scope for touching no record (LDG_008). */
export function opTouchesRecord(op: ChangeOp): boolean {
  return !isActionOp(op) && String(op.op) !== 'organise.rule';
}

/** The scopes a decline may offer: none for an action, which is run or not rather than remembered. */
export function rejectionScopesFor(op: ChangeOp): readonly RejectionScope[] {
  if (isActionOp(op)) return [];
  return opTouchesRecord(op) ? ['never', 'not_now', 'not_this_version'] : ['never', 'not_now'];
}

export function rejectionScopeNote(scope: RejectionScope): string {
  if (scope === 'never') return 'for this story';
  if (scope === 'not_now') return 'for now';
  return 'for this version';
}

/** The reason kept on the Notebook entry the reject route writes; the server derives the statement and topic from the op itself. */
export function rejectionWhy(scope: RejectionScope): string {
  if (scope === 'never') return 'Declined in the chat: not for this story.';
  if (scope === 'not_now') return 'Declined in the chat for now; it may fit later.';
  return 'Declined in the chat for this version; a later edit to what it touches makes it eligible again.';
}

export type CommitBarView =
  { kind: 'none' } | { kind: 'committing'; text: string } | { kind: 'partial'; action: string; text: string } | { kind: 'ready'; action: string; text: string; failed: boolean };

export interface CommitBarInput {
  total: number;
  decisions: ReadonlyMap<number, SuggestionDecision>;
  committing: boolean;
  /** Why the last commit failed; the answers are kept for the retry. */
  error?: string;
}

/**
 * The card's own commit control. The last answer commits at once, but a commit that failed — or never ran, because the answers were
 * restored after a reload — must stay one click away rather than read as "adding now" forever.
 */
export function commitBarView({ total, decisions, committing, error }: CommitBarInput): CommitBarView {
  if (committing) return { kind: 'committing', text: 'Adding to your Story Bible…' };
  const plan = suggestionCommit(total, decisions);
  const picked = [...decisions.values()].filter(decision => decision === 'add').length;
  const remaining = total - decisions.size;
  if (plan.kind === 'wait') {
    if (picked === 0) return { kind: 'none' };
    return { kind: 'partial', action: `Add the ${picked} picked now`, text: `The ${remaining} unanswered are left out.` };
  }
  const action = plan.kind === 'discard' ? 'Pass on these now' : `Add ${plan.opIndexes.length} now`;
  const text = error ? `Couldn’t finish: ${error} Your answers are kept.` : 'Every suggestion has an answer.';
  return { kind: 'ready', action, text, failed: Boolean(error) };
}

export interface ChecklistItemView {
  key: ProgressItemKey;
  label: string;
  why: string;
  state: 'open' | 'answered' | 'undecided';
  stateLabel: string;
}

export interface ChecklistView {
  title: string;
  items: ChecklistItemView[];
  answered: number;
  percent: number;
  dismissed: number;
  complete: boolean;
}

const ITEM_STATE_LABEL: Record<ChecklistItemView['state'], string> = { open: 'Open', answered: 'Settled', undecided: 'Undecided for now' };

export function checklistView(items: readonly ProgressItemResponse[]): ChecklistView {
  const visible = items
    .filter(item => item.status !== 'dismissed')
    .map(item => ({ key: item.key as ProgressItemKey, label: item.label, why: item.why, state: item.status as ChecklistItemView['state'] }))
    .map(item => ({ ...item, stateLabel: ITEM_STATE_LABEL[item.state] }));
  const answered = visible.filter(item => item.state !== 'open').length;
  return {
    title: 'Story so far',
    items: visible,
    answered,
    percent: visible.length === 0 ? 100 : Math.round((answered / visible.length) * 100),
    dismissed: items.length - visible.length,
    complete: answered === visible.length,
  };
}

export function questionEyebrow(progressKey: string | null | undefined, checklist: ChecklistView | undefined): string {
  if (!progressKey || !checklist) return 'Question';
  return checklist.items.find(entry => entry.key === progressKey)?.label ?? 'Question';
}

export interface QuestionOption {
  title: string;
  why?: string;
  tradeOff?: string;
  recommended?: boolean;
}

export interface QuestionBlock {
  question: string;
  why?: string;
  options: QuestionOption[];
  /** A checklist item the question settles; "Undecided for now" records it there. */
  progressKey?: ProgressItemKey;
}

const PROGRESS_KEYS: Record<ProgressItemKey, true> = {
  premise: true,
  protagonist: true,
  opposition: true,
  theme: true,
  reader_promise: true,
  ending: true,
  first_volume_goal: true,
  next_chapter_planned: true,
};

export function isProgressItemKey(value: unknown): value is ProgressItemKey {
  return typeof value === 'string' && Object.hasOwn(PROGRESS_KEYS, value);
}

/** The server's question as the card draws it; a progress key the checklist does not know is dropped before it can reach a URL. */
export function questionOf(question: ChatQuestionResponse | null | undefined): QuestionBlock | undefined {
  if (!question || question.answers.length === 0) return undefined;
  return {
    question: question.question,
    why: question.why ?? undefined,
    options: question.answers.map(answer => ({
      title: answer.title,
      why: answer.why ?? undefined,
      tradeOff: answer.tradeOff ?? undefined,
      recommended: answer.recommended === true,
    })),
    progressKey: isProgressItemKey(question.progressKey) ? question.progressKey : undefined,
  };
}

export interface JobView {
  title: string;
  detail?: string;
  tone: 'running' | 'done' | 'failed' | 'cancelled';
  cancellable: boolean;
  proposalId?: string;
}

const JOB_TITLE: Record<string, { running: string; done: string }> = {
  organise: { running: 'Organising your notes', done: 'Read your notes and organised them' },
  plan: { running: 'Planning chapter', done: 'Planned chapter' },
  generate: { running: 'Writing chapter', done: 'Wrote chapter' },
  review: { running: 'Checking chapter', done: 'Checked chapter' },
  audit: { running: 'Auditing the Story Bible', done: 'Audited the Story Bible' },
  canon_refresh: { running: 'Checking the Story Bible against', done: 'Checked the Story Bible against' },
};

const PHASE_LABEL: Record<string, string> = {
  organising: 'Reading your notes',
  staging: 'Preparing what to add',
  planning: 'Drafting the plan',
  generating: 'Drafting',
  awaiting_review: 'Checking the draft',
  refreshing: 'Reading what the chapter changed',
};

function chapterSuffix(job: ChatJobState): string {
  return job.progress.current && /^\d+$/.test(job.progress.current) ? ` ${job.progress.current}` : '';
}

function refreshedChapter(job: ChatJobState): string {
  const chapter = chapterSuffix(job);
  return chapter ? ` chapter${chapter}` : ' the new chapter';
}

export function jobView(job: ChatJobState): JobView {
  const titles = JOB_TITLE[job.kind] ?? { running: 'Working', done: 'Finished' };
  const suffix = job.kind === 'canon_refresh' ? refreshedChapter(job) : job.kind === 'organise' || job.kind === 'audit' ? '' : chapterSuffix(job);
  if (job.status === 'done' && job.kind === 'canon_refresh' && job.progress.phase === 'unchanged')
    return { title: `${titles.done}${suffix}`, detail: 'Nothing on your pages needs updating.', tone: 'done', cancellable: false };
  if (job.status === 'done') return { title: `${titles.done}${suffix}`, tone: 'done', cancellable: false, proposalId: job.progress.proposalId };
  if (job.status === 'failed')
    return { title: `${titles.running}${suffix} stopped with an error`, detail: job.error ?? 'Try again from the chat.', tone: 'failed', cancellable: false };
  if (job.status === 'cancelled') return { title: `${titles.running}${suffix} — cancelled`, tone: 'cancelled', cancellable: false };
  const phase = job.progress.phase ? PHASE_LABEL[job.progress.phase] : undefined;
  const detail = job.retrying ? 'It timed out; trying once more.' : job.status === 'pending' ? 'Queued — starts in a moment.' : phase;
  return { title: `${titles.running}${suffix}…`, detail, tone: 'running', cancellable: true };
}

/** Writing started outside this chat's own jobs, e.g. from a plan card's Write: the chat follows it from the project's job list. */
export function writingView({ chapters, current }: GenerationActivity): JobView {
  const position = chapters.length > 1 ? ` (${chapters.indexOf(current) + 1} of ${chapters.length})` : '';
  return { title: `Writing chapter ${current}${position}…`, detail: 'The draft opens in Chapters once it is written.', tone: 'running', cancellable: true };
}

/** After a turn, focus goes back to the composer unless the author has already moved it somewhere else on purpose. */
export function shouldRefocusComposer(active: Element | null, composer: Element | null, body: Element | null): boolean {
  return !active || active === body || Boolean(composer && composer.contains(active));
}

export interface TurnOutcome {
  applied: number;
  suggested: number;
  failed: boolean;
}

export function turnAnnouncement({ applied, suggested, failed }: TurnOutcome): string {
  if (failed) return 'Forge couldn’t finish that reply.';
  const parts = ['Forge replied.'];
  if (applied > 0) parts.push(`${applied} ${applied === 1 ? 'change' : 'changes'} added from your words.`);
  if (suggested > 0) parts.push(`${suggested} ${suggested === 1 ? 'suggestion waits' : 'suggestions wait'} for you.`);
  return parts.join(' ');
}

export function offersNotes(message: Pick<ChatMessageResponse, 'role' | 'offersNotes'>): boolean {
  return message.role === 'user' && message.offersNotes === true;
}

export function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export interface PromptChip {
  label: string;
  prompt: string;
}

export function promptChips(nextChapter: number): PromptChip[] {
  return [
    { label: `Ideas for chapter ${nextChapter}`, prompt: `Give me a few ideas for chapter ${nextChapter}, from where the story stands.` },
    { label: `Plan chapter ${nextChapter}`, prompt: `Let’s plan chapter ${nextChapter}.` },
  ];
}

const ACTION_JOB_KIND: Record<string, JobKind> = {
  'action.plan_chapter': 'plan',
  'action.organise_notes': 'organise',
  'action.generate_chapter': 'generate',
  'action.judge_draft': 'review',
  'action.audit_bible': 'audit',
};

export function jobKindForOp(op: ChangeOp | undefined): JobKind {
  return (op && ACTION_JOB_KIND[String(op.op)]) ?? 'generate';
}

export const OPENER_PROMPT = 'Organise my notes';

/** A new novel's chat that nothing was queued for still gets its opening move one click away. */
export function openerChip(kind: string | undefined, messageCount: number, notes: string | undefined): PromptChip | undefined {
  if (kind !== 'new_novel' || messageCount > 0 || !notes?.trim()) return undefined;
  return { label: OPENER_PROMPT, prompt: OPENER_PROMPT };
}

/** A question is settled once the author has written anything after the reply that asked it. */
export function lastUserOrdinal(messages: readonly Pick<ChatMessageResponse, 'role' | 'ordinal'>[]): number {
  return messages.reduce((ordinal, message) => (message.role === 'user' ? Math.max(ordinal, message.ordinal) : ordinal), 0);
}

export interface UnusedParagraph {
  number: number;
  /** Absent when the notes changed since organising, so the number may point at a different paragraph now. */
  text?: string;
}

export interface NotUsedView {
  unused: UnusedParagraph[];
  /** The notes changed after this round: its paragraph numbers no longer match what the author sees. */
  renumbered: boolean;
}

/** Split exactly as the server's `notesParagraphs`, so ¶N here is the paragraph the round cited. */
export function notesParagraphs(notes: string): string[] {
  return notes
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function notUsedView(receipt: OrganiseReceipt, notes: string | undefined): NotUsedView {
  const renumbered = notes === undefined || textDigest(notes) !== receipt.notesDigest;
  const paragraphs = renumbered ? [] : notesParagraphs(notes);
  return { unused: receipt.unusedParagraphs.map(number => ({ number, text: paragraphs[number - 1] })), renumbered };
}

export type SessionMode = 'manual' | 'auto';

export type ComposerMode = 'edit-freely' | 'ask-first' | 'just-discuss';

export interface ComposerModeOption {
  value: ComposerMode;
  label: string;
  description: string;
}

export const COMPOSER_MODES: readonly ComposerModeOption[] = [
  { value: 'edit-freely', label: 'Edit freely', description: 'Applies most Story Bible changes right away. Removals, plans, prose and secrets still ask. Undo any time.' },
  { value: 'ask-first', label: 'Ask first', description: 'Suggests every change. You approve each one.' },
  { value: 'just-discuss', label: 'Just discuss', description: 'Nothing changes until you approve it.' },
];

export function composerModeOf(mode: SessionMode, discussing: boolean): ComposerMode {
  if (discussing) return 'just-discuss';
  return mode === 'manual' ? 'ask-first' : 'edit-freely';
}

export interface ComposerModeChange {
  justDiscussing: boolean;
  /** Absent when the chat already has the mode the pick implies. */
  sessionMode?: SessionMode;
}

export function composerModeChange(value: ComposerMode, current: SessionMode): ComposerModeChange {
  if (value === 'just-discuss') return { justDiscussing: true };
  const sessionMode: SessionMode = value === 'ask-first' ? 'manual' : 'auto';
  return { justDiscussing: false, sessionMode: sessionMode === current ? undefined : sessionMode };
}

export function awaitingAnswer(messages: readonly Pick<ChatMessageResponse, 'role' | 'ordinal' | 'question'>[]): boolean {
  let latest: (typeof messages)[number] | undefined;
  for (const message of messages) if (message.role === 'assistant' && (!latest || message.ordinal > latest.ordinal)) latest = message;
  return Boolean(latest && questionOf(latest.question) && lastUserOrdinal(messages) < latest.ordinal);
}

export function composerChips(chips: PromptChip[], state: { running: boolean; awaitingAnswer: boolean }): PromptChip[] {
  return state.running || state.awaitingAnswer ? [] : chips;
}

export function heroText(name: string, mode: SessionMode): string {
  if (mode === 'manual') return `Forge reads every part of “${name}”. This chat is manual: every change waits for your yes.`;
  return `Forge reads every part of “${name}”. Clear instructions in your own words apply at once and can be undone; its own ideas wait for your yes.`;
}

export function unansweredWarning(count: number): string {
  return `${count} ${count === 1 ? 'suggestion still needs' : 'suggestions still need'} an answer — nothing on that card is added until you answer the rest or add the picked ones now.`;
}

export function unusedParagraphPrompt({ number, text }: UnusedParagraph): string {
  return text ? `Add this from my notes (¶${number}) to the Story Bible: ${text}` : `Add ¶${number} of my notes to the Story Bible.`;
}

// Every opener that handed the notes over, current and past: the start dialog's and the chip's.
const NOTES_OPENER_LEADS = ['Here are my notes for the story.', 'Organise my notes'];

/**
 * The message that handed the author's notes to the chat, so it can carry them: the chat's opening message, and only when it is one of the
 * notes openers. Any other chat reaches the notes through its lookups, never with a message.
 */
export function notesOpenerId(messages: readonly Pick<ChatMessageResponse, 'id' | 'role' | 'content'>[]): string | undefined {
  const opening = messages.find(message => message.role === 'user');
  return opening && NOTES_OPENER_LEADS.some(lead => opening.content.trimStart().startsWith(lead)) ? opening.id : undefined;
}

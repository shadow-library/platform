import { textDigest } from '@shadow-library/sdk';

import { type ChatJobState, type OrganiseCardEntry, type OrganiseEntryLabel, type OrganiseReceipt } from '@/lib/apis/chat.api';
import { isRecord } from '@/lib/is-record';
import {
  type BibleSection,
  type ChatMessageResponse,
  type ChatQuestionResponse,
  type ChatTurnResponse,
  type EntityType,
  type JobKind,
  type LedgerRejectionScope,
  type ProgressItemKey,
  type ProgressItemResponse,
  type UndoImpactResponse,
} from '@/lib/apis/api-types.gen';
import { documentTopic, TOPIC_LABEL, topicForEntityType } from '@/lib/bible-topics';
import { type ChangeOp } from '@/lib/proposals';

const STORY_LABEL = 'The story';
const PROSE_FIELDS = ['body', 'rule', 'objective', 'premise', 'motivation', 'notes', 'brief', 'note', 'constraintNote', 'writerNote'] as const;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isSecret(op: ChangeOp): boolean {
  return (op.unlock !== undefined && op.unlock !== null) || typeof op.revealChapter === 'number';
}

export function opTopicLabel(op: ChangeOp): string {
  const type = String(op.op);
  if (type === 'premise.update' || type === 'volume.upsert') return STORY_LABEL;
  if (type === 'entity.upsert') return TOPIC_LABEL[topicForEntityType(op.type as EntityType) ?? 'lore'];
  if (type === 'fact.upsert') return isSecret(op) ? 'Secrets' : 'Facts';
  if (type === 'milestone.upsert') return 'Milestones';
  if (type === 'organise.rule') return 'Notebook';
  if (type === 'brief.update') return 'Chapter plan';
  if (type === 'bible_document.upsert') return TOPIC_LABEL[documentTopic({ section: op.section as BibleSection, slug: String(op.slug), title: String(op.slug) })];
  if (type.startsWith('action.')) return 'Action';
  return 'Change';
}

export function opSubject(op: ChangeOp): string {
  const type = String(op.op);
  if (type === 'premise.update') return 'Premise';
  if (type === 'organise.rule') return 'Rule';
  if (type === 'volume.upsert') return text(op.title) ?? `Volume ${String(op.volumeKey)}`;
  if (type === 'milestone.upsert') return text(op.label) ?? String(op.milestoneKey);
  if (type.startsWith('promise.')) return text(op.label) ?? String(op.key ?? op.op);
  if (type === 'brief.update') return text(op.title) ?? `Chapter ${String(op.chapter)}`;
  if (type === 'bible_document.upsert') return text(isRecord(op.frontmatter) ? op.frontmatter.title : undefined) ?? String(op.slug).replace(/[-_]/g, ' ');
  if (type === 'action.plan_chapter') return 'Plan the next chapter';
  if (type === 'action.organise_notes') return 'Organise your notes';
  return text(op.name) ?? String(op.entityKey ?? op.factKey ?? op.op);
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

export function opCardTitle(op: ChangeOp): string {
  const topic = opTopicLabel(op);
  const subject = opSubject(op);
  return topic.toLowerCase() === subject.toLowerCase() ? subject : `${topic}: ${subject}`;
}

export function opWrittenValue(op: ChangeOp): string {
  const field = opWrittenField(op);
  const value = field ? text(op[field]) : undefined;
  const subject = opSubject(op);
  if (!value || value === subject) return subject;
  return `${subject}: ${value}`;
}

export interface AppliedRow {
  index: number;
  topic: string;
  value: string;
  quote?: string;
  paragraphs?: number[];
}

export type QuoteSource = 'message' | 'notes';

/** What the change wrote into the Story Bible; an action it started is not an entry, and its job reports itself. */
export function appliedRows(changeSet: readonly ChangeOp[], paragraphs?: ReadonlyMap<number, number[]>): AppliedRow[] {
  return changeSet
    .map((op, index) => ({ op, index }))
    .filter(({ op }) => !String(op.op).startsWith('action.'))
    .map(({ op, index }) => ({ index, topic: opTopicLabel(op), value: opWrittenValue(op), quote: text(op.quote), paragraphs: paragraphs?.get(index) }));
}

/** Where a row's words came from, so the author can check the written value against them. */
export function rowSource(row: Pick<AppliedRow, 'quote' | 'paragraphs'>, source: QuoteSource): string | undefined {
  const cited = row.paragraphs?.length ? row.paragraphs.map(number => `¶${number}`).join(', ') : '';
  const origin = source === 'notes' ? `from your notes${cited ? `, ${cited}` : ''}` : 'from your message';
  if (row.quote) return `${origin}: “${row.quote}”`;
  return source === 'notes' && cited ? origin : undefined;
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

export type ProposalPresentation = 'plan' | 'suggestions' | 'applied' | 'reverted' | 'passed' | 'legacy';

const ONE_WAY_DOORS = new Set(['action.finalize', 'action.approve_draft', 'action.generate_chapter', 'action.advance_volume']);

/** How the transcript draws a proposal: one-way doors keep the explicit per-op card, where nothing is selected for the author. */
export function proposalPresentation(proposal: { kind: string; status: string; changeSet: readonly ChangeOp[] }): ProposalPresentation {
  if (proposal.kind === 'chapter_plan') return 'plan';
  if (proposal.status === 'applied') return 'applied';
  if (proposal.status === 'reverted') return 'reverted';
  if (proposal.status === 'discarded') return 'passed';
  if (proposal.status !== 'pending' || proposal.changeSet.some(op => ONE_WAY_DOORS.has(String(op.op)))) return 'legacy';
  return 'suggestions';
}

const OWN_CARD_OPS = new Set(['draft.update', 'draft.remove', 'brief.update']);

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

export interface DecisionPick {
  subject: string;
  decision: SuggestionDecision;
}

export function picksOf(changeSet: readonly ChangeOp[], decisions: ReadonlyMap<number, SuggestionDecision>): DecisionPick[] {
  return [...decisions.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([index, decision]) => {
      const op = changeSet[index];
      return op ? [{ subject: opSubject(op), decision }] : [];
    });
}

export function picksSentence(picks: readonly DecisionPick[]): string {
  if (picks.length === 0) return 'You had not answered any of it yet.';
  return `You had picked: ${picks.map(pick => `${pick.decision === 'add' ? 'add' : 'not'} “${pick.subject}”`).join(', ')}.`;
}

export function pendingDecisionLabel(subject: string, topic: string, remaining: number, committing: boolean): string {
  if (remaining > 0) return `Will add “${subject}” to ${topic} — ${remaining} left to answer.`;
  return `Will add “${subject}” to ${topic}${committing ? ' — adding now' : ''}.`;
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

const ITEM_STATE_LABEL: Record<ChecklistItemView['state'], string> = { open: 'Open', answered: 'Answered', undecided: 'Undecided for now' };

export function checklistView(items: readonly ProgressItemResponse[], draftsTotal: number): ChecklistView {
  const visible = items
    .filter(item => item.status !== 'dismissed')
    .map(item => ({ key: item.key as ProgressItemKey, label: item.label, why: item.why, state: item.status as ChecklistItemView['state'] }))
    .map(item => ({ ...item, stateLabel: ITEM_STATE_LABEL[item.state] }));
  const answered = visible.filter(item => item.state !== 'open').length;
  return {
    title: `Ready for chapter ${draftsTotal + 1}`,
    items: visible,
    answered,
    percent: visible.length === 0 ? 100 : Math.round((answered / visible.length) * 100),
    dismissed: items.length - visible.length,
    complete: answered === visible.length,
  };
}

export function questionEyebrow(progressKey: string | null | undefined, checklist: ChecklistView | undefined, settled: boolean): string {
  if (!progressKey || !checklist) return 'Question';
  const item = checklist.items.find(entry => entry.key === progressKey);
  if (!item) return 'Question';
  if (settled || item.state !== 'open') return `Question · ${item.label}`;
  return `Question ${checklist.answered + 1} of ${checklist.items.length} · ${item.label}`;
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
};

const PHASE_LABEL: Record<string, string> = {
  organising: 'Reading your notes',
  staging: 'Preparing what to add',
  planning: 'Drafting the plan',
  generating: 'Drafting',
  awaiting_review: 'Checking the draft',
};

function chapterSuffix(job: ChatJobState): string {
  return job.progress.current && /^\d+$/.test(job.progress.current) ? ` ${job.progress.current}` : '';
}

export function jobView(job: ChatJobState): JobView {
  const titles = JOB_TITLE[job.kind] ?? { running: 'Working', done: 'Finished' };
  const suffix = job.kind === 'organise' || job.kind === 'audit' ? '' : chapterSuffix(job);
  if (job.status === 'done') return { title: `${titles.done}${suffix}`, tone: 'done', cancellable: false, proposalId: job.progress.proposalId };
  if (job.status === 'failed')
    return { title: `${titles.running}${suffix} stopped with an error`, detail: job.error ?? 'Try again from the chat.', tone: 'failed', cancellable: false };
  if (job.status === 'cancelled') return { title: `${titles.running}${suffix} — cancelled`, tone: 'cancelled', cancellable: false };
  const phase = job.progress.phase ? PHASE_LABEL[job.progress.phase] : undefined;
  const detail = job.retrying ? 'It timed out; trying once more.' : job.status === 'pending' ? 'Queued — starts in a moment.' : phase;
  return { title: `${titles.running}${suffix}…`, detail, tone: 'running', cancellable: true };
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

export function promptChips(openItems: readonly Pick<ChecklistItemView, 'label' | 'state'>[], nextChapter: number): PromptChip[] {
  const open = openItems
    .filter(item => item.state === 'open')
    .slice(0, 2)
    .map(item => ({ label: item.label, prompt: `Let’s settle this: ${item.label}.` }));
  return [
    { label: `Plan chapter ${nextChapter}`, prompt: `Let’s plan chapter ${nextChapter}.` },
    ...open,
    { label: 'What’s missing?', prompt: 'What’s still missing before the next chapter?' },
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

export const OPENER_PROMPT = 'Organise my notes and ask me about the rest';

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

export interface OrganiseReceiptView {
  summary: string;
  unused: UnusedParagraph[];
  /** The notes changed after this round: its paragraph numbers no longer match what the author sees. */
  renumbered: boolean;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Split exactly as the server's `notesParagraphs`, so ¶N here is the paragraph the round cited. */
export function notesParagraphs(notes: string): string[] {
  return notes
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function organiseReceiptView(receipt: OrganiseReceipt, notes: string | undefined): OrganiseReceiptView {
  const renumbered = notes === undefined || textDigest(notes) !== receipt.notesDigest;
  const paragraphs = renumbered ? [] : notesParagraphs(notes);
  const parts = [plural(receipt.fromNotes, 'entry from your notes', 'entries from your notes')];
  if (receipt.suggested > 0) parts.push(plural(receipt.suggested, 'suggestion', 'suggestions'));
  if (receipt.rules > 0) parts.push(plural(receipt.rules, 'rule', 'rules'));
  return {
    summary: `${parts.join(' · ')} — read from ${plural(receipt.paragraphs, 'paragraph', 'paragraphs')}`,
    unused: receipt.unusedParagraphs.map(number => ({ number, text: paragraphs[number - 1] })),
    renumbered,
  };
}

const ENTRY_EYEBROW: Record<OrganiseEntryLabel, string> = {
  from_notes: 'From your notes — waiting for your yes',
  suggested: 'Suggested — not in your notes',
  planner_only: 'From your notes — planner-only',
  retired: 'Takes out an earlier organise entry',
  rule: 'A rule from your notes',
};

export const SUGGESTED_EYEBROW = ENTRY_EYEBROW.suggested;

export interface CardEntryNote {
  eyebrow: string;
  /** Declining it takes an earlier organise answer out of the Notebook. */
  retires: boolean;
}

export function entryNotes(entries: readonly OrganiseCardEntry[]): Map<number, CardEntryNote> {
  return new Map(entries.map(entry => [entry.opIndex, { eyebrow: ENTRY_EYEBROW[entry.label] ?? SUGGESTED_EYEBROW, retires: Boolean(entry.retires?.length) }]));
}

const NOTES_CITATION = /¶\d+(?:\s*[–-]\s*¶?\d+)?/g;

export function opEyebrow(op: ChangeOp): string {
  const cited = rationaleOf(op).match(NOTES_CITATION);
  if (!cited) return SUGGESTED_EYEBROW;
  return `From your notes · ${cited.join(', ')}`;
}

export const RETIRES_NOTE = 'Already in your Notebook — declining it takes it out.';

/** The server appends the retire note to the rationale; the card says it once, from the receipt. */
export function rationaleOf(op: ChangeOp): string {
  const rationale = typeof op.rationale === 'string' ? op.rationale.trim() : '';
  return rationale.replace(RETIRES_NOTE, '').trim();
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

export function firstUserMessageId(messages: readonly Pick<ChatMessageResponse, 'id' | 'role'>[]): string | undefined {
  return messages.find(message => message.role === 'user')?.id;
}

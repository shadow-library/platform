import { paragraphAt } from '@shadow-library/sdk';

import { type ChatPassageContextBody, type ChatPassageContextResponse, type DraftResponse } from '@/lib/apis';

import { chapterPanelEdit, isBeingWritten } from './chapter-panel';
import { type ReaderRefusal, type TextSpan } from './chapter-reader';
import { isRecord } from './is-record';
import { type PassageSelection } from './passage-selection';

/** The server's limits on one message: ten passages, each quote and comment at most 2,000 characters. */
export const MAX_PASSAGE_COMMENTS = 10;
export const MAX_COMMENT_QUOTE_CHARS = 2000;
export const MAX_COMMENT_CHARS = 2000;
export const REWRITE_COMMENT = 'Rewrite this';
export const QUICK_COMMENTS: readonly string[] = ['Tighten', 'Show, don’t tell', 'Cut', 'Match the voice'];

const STORAGE_PREFIX = 'nf.passage-comments.';

/** A passage the author commented on, waiting in the composer to ride their next message. */
export interface PassageChip {
  id: string;
  context: ChatPassageContextBody;
  firstParagraph: number;
  lastParagraph: number;
  /** The server could no longer find it in its chapter: the author selects it again. */
  stale?: boolean;
}

export type ChipAdd = { kind: 'added'; chips: PassageChip[] } | { kind: 'full' };

type CommentDraft = Pick<DraftResponse, 'id' | 'chapter' | 'revision' | 'saveSeq' | 'body'>;

/** Why the reader's toolbar withholds an action; absent ones are offered. */
export interface CommentGate {
  comment?: string;
  rewrite?: string;
  edit?: string;
}

const REFUSALS: Record<ReaderRefusal, string | undefined> = {
  empty: undefined,
  'too-long': `Select at most ${MAX_COMMENT_QUOTE_CHARS.toLocaleString()} characters to comment on.`,
  unmapped: 'The reader can’t place that selection in the chapter’s text — select a little less.',
  'cuts-markup': 'That selection cuts through a link, code, a list or other formatting — select all of it, or only words inside it.',
  'line-endings': 'This chapter’s line endings differ from what the editor shows — save it from Edit first, then select again.',
  unsaved: 'Your edits aren’t saved yet — save them, then select again.',
  'in-preview': 'Select outside the proposed change — apply or decline it on its card first.',
};

export function commentRefusal(kind: ReaderRefusal): string | undefined {
  return REFUSALS[kind];
}

export function passageRef(chapter: number, firstParagraph: number, lastParagraph: number): string {
  const paragraphs = firstParagraph === lastParagraph ? `¶${firstParagraph}` : `¶${firstParagraph}–${lastParagraph}`;
  return `Ch ${chapter} · ${paragraphs}`;
}

export function selectionRef(draft: Pick<DraftResponse, 'chapter' | 'body'>, selection: PassageSelection): string {
  const body = draft.body ?? '';
  return passageRef(draft.chapter, paragraphAt(body, selection.start), paragraphAt(body, selection.end - 1));
}

export function chipLimitReason(count: number): string | undefined {
  return count >= MAX_PASSAGE_COMMENTS ? `A message carries at most ${MAX_PASSAGE_COMMENTS} comments — send these first.` : undefined;
}

/** An isolated chapter's prose never reaches the chat, and one being written has no settled words to point at; a final one can still be asked about. */
export function commentGate(draft: Pick<DraftResponse, 'status' | 'reviewStatus' | 'body' | 'staleReason' | 'isolated'>, writing: boolean): CommentGate {
  const edit = chapterPanelEdit(draft, writing);
  const editReason = edit.allowed ? undefined : edit.reason;
  if (draft.isolated) {
    const reason = 'This chapter is isolated — its text never goes to the chat, so it can’t be commented on there.';
    return { comment: reason, rewrite: reason, edit: editReason };
  }
  if (isBeingWritten(draft, writing)) {
    const reason = 'The chapter is being written — comment once it’s done.';
    return { comment: reason, rewrite: reason, edit: editReason };
  }
  if (draft.status === 'final') return { rewrite: 'Final chapters are locked — comment to ask about it, or change it with Amend.', edit: editReason };
  return { edit: editReason };
}

/** Built from the draft the author selected in, so the server can find the passage again even if the chapter moved on since. */
export function passageChip(draft: CommentDraft, selection: PassageSelection, comment: string, hash: string): PassageChip {
  const body = draft.body ?? '';
  return {
    id: `${draft.id}:${selection.start}:${selection.end}`,
    context: {
      kind: 'passage',
      chapter: draft.chapter,
      draftId: draft.id,
      revision: draft.revision,
      saveSeq: draft.saveSeq,
      start: selection.start,
      end: selection.end,
      passageHash: hash,
      quote: selection.text,
      comment: comment.trim(),
    },
    firstParagraph: paragraphAt(body, selection.start),
    lastParagraph: paragraphAt(body, selection.end - 1),
  };
}

/** "Rewrite with AI" on a passage already commented on keeps the author's own comment, which says how. */
export function rewriteChip(chip: PassageChip, existing: PassageChip | undefined): PassageChip {
  const comment = existing?.context.comment.trim() ? existing.context.comment : REWRITE_COMMENT;
  return { ...chip, context: { ...chip.context, comment } };
}

/** The same words commented on again replace the earlier comment rather than counting twice. */
export function addChip(chips: readonly PassageChip[], chip: PassageChip): ChipAdd {
  if (chips.some(existing => existing.id === chip.id)) return { kind: 'added', chips: chips.map(existing => (existing.id === chip.id ? chip : existing)) };
  if (chips.length >= MAX_PASSAGE_COMMENTS) return { kind: 'full' };
  return { kind: 'added', chips: [...chips, chip] };
}

export function removeChip(chips: readonly PassageChip[], id: string): PassageChip[] {
  return chips.filter(chip => chip.id !== id);
}

export function markStale(chips: readonly PassageChip[], ids: ReadonlySet<string>): PassageChip[] {
  return chips.map(chip => (ids.has(chip.id) ? { ...chip, stale: true } : chip));
}

export function chipContexts(chips: readonly PassageChip[]): ChatPassageContextBody[] {
  return chips.map(chip => chip.context);
}

/** The chips as the sent message shows them until the server's own copy arrives. */
export function shownContexts(chips: readonly PassageChip[]): ChatPassageContextResponse[] {
  return chips.map(({ context, firstParagraph, lastParagraph }) => ({ ...context, saveSeq: context.saveSeq ?? 0, firstParagraph, lastParagraph }));
}

/** A sent message's comments as chips again, for a retry of a turn that failed: the server finds each passage afresh. */
export function chipsOfSent(contexts: readonly ChatPassageContextResponse[] | null | undefined): PassageChip[] {
  return (contexts ?? []).map(({ firstParagraph, lastParagraph, ...context }) => ({
    id: `${context.draftId}:${context.start}:${context.end}`,
    context,
    firstParagraph,
    lastParagraph,
  }));
}

/** The passage in this draft's body: where it was selected, or its words' one occurrence. */
export function locateChip(body: string, draftId: string, context: Pick<ChatPassageContextBody, 'draftId' | 'start' | 'end' | 'quote'>): TextSpan | undefined {
  if (context.draftId !== draftId) return undefined;
  if (body.slice(context.start, context.end) === context.quote) return { start: context.start, end: context.end };
  const found = body.indexOf(context.quote);
  if (found === -1 || body.indexOf(context.quote, found + 1) !== -1) return undefined;
  return { start: found, end: found + context.quote.length };
}

/** After a `CHT_009`, the chips their chapters no longer hold as they were selected; when none can be told, every one sent. */
export function staleChipIds(chips: readonly PassageChip[], drafts: ReadonlyMap<number, Pick<DraftResponse, 'id' | 'body'> | undefined>): Set<string> {
  const stale = chips.filter(chip => {
    const draft = drafts.get(chip.context.chapter);
    return !draft || !locateChip(draft.body ?? '', draft.id, chip.context);
  });
  return new Set((stale.length > 0 ? stale : chips).map(chip => chip.id));
}

export function withQuickComment(current: string, quick: string): string {
  const text = current.trim();
  if (!text) return quick;
  return /[.!?;:,]$/.test(text) ? `${text} ${quick}` : `${text}. ${quick}`;
}

/** A chip the author clicked, to scroll to and flash; each click is a new `nonce`, so a reveal already answered never hides a later one. */
export interface ChipReveal {
  chipId: string;
  nonce: number;
}

/** Numbered from a count that survives the reveal being cleared once answered: a nonce reused after a reset would read as answered already. */
export function nextReveal(chipId: string, revealsSoFar: number): ChipReveal {
  return { chipId, nonce: revealsSoFar + 1 };
}

export function isUnanswered(reveal: ChipReveal | undefined, answered: number | undefined): reveal is ChipReveal {
  return reveal !== undefined && reveal.nonce !== answered;
}

/** Which chat's composer the chips wait in: the chat, or this novel's chat not started yet — never another novel's. */
export function chipSessionKey(novelId: string, sessionId: string | undefined): string {
  return sessionId ?? `new:${novelId}`;
}

export function chipStorageKey(sessionKey: string): string {
  return `${STORAGE_PREFIX}${sessionKey}`;
}

function isContext(value: unknown): value is ChatPassageContextBody {
  if (!isRecord(value) || value.kind !== 'passage') return false;
  const numbers = [value.chapter, value.revision, value.start, value.end].every(field => typeof field === 'number');
  const strings = [value.draftId, value.passageHash, value.quote, value.comment].every(field => typeof field === 'string');
  return numbers && strings && (value.saveSeq === undefined || typeof value.saveSeq === 'number');
}

function isChip(value: unknown): value is PassageChip {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.firstParagraph === 'number' && typeof value.lastParagraph === 'number' && isContext(value.context);
}

/** Chips read back from session storage; anything malformed is dropped rather than sent. */
export function parseStoredChips(raw: string | null | undefined): PassageChip[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isChip).slice(0, MAX_PASSAGE_COMMENTS) : [];
  } catch {
    return [];
  }
}

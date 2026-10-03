import { and, eq, inArray } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { normalizeLineEndings } from '@server/common';
import { type Generation, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { anchorContext, fitReplacement, locatePassage, MAX_PASSAGE_CHARS, passageHash, replacePassage } from '../generation/passage-anchor';
import { type ChangeOp, changeSetRefs, type DraftRewritePassageOp, type PassageRewriteAnchor } from './change-set';
import { paragraphAt } from './passage-context';

export type RewriteDropReason = 'no_draft' | 'locked' | 'isolated' | 'generating' | 'whole_chapter' | 'too_long' | 'not_found' | 'ambiguous' | 'unchanged';

export interface DroppedRewrite {
  chapter: number;
  label?: string;
  reason: RewriteDropReason;
}

export interface AnchoredRewrites {
  ops: ChangeOp[];
  dropped: DroppedRewrite[];
}

type AnchoredRewrite = DraftRewritePassageOp & { anchor: PassageRewriteAnchor };

interface Span {
  start: number;
  end: number;
}

interface ChapterState {
  draft?: Generation.Draft;
  /** At or behind the story cursor: canon, whatever the draft row says. */
  locked: boolean;
}

type DraftReader = Pick<PrimaryDatabase, 'query'>;

// The passage comments block indents every line of a quote after its first, so a model copying a quote that spans lines copies that indentation too.
const COMMENT_INDENT = /\n {3}/g;

const DROP_REASONS: Readonly<Record<RewriteDropReason, string>> = {
  no_draft: 'the chapter has no draft',
  locked: 'the chapter is final, so its prose changes only through Amend',
  isolated: 'the chapter is isolated, so the chat cannot change its prose — edit it in the chapter editor',
  generating: 'the chapter is being written',
  whole_chapter: 'this reply already rewrites the whole chapter',
  too_long: `the passage runs past ${MAX_PASSAGE_CHARS} characters`,
  not_found: 'its words are not in the chapter as it stands — select the passage and ask again',
  ambiguous: 'its words occur more than once in the chapter — select the passage and ask again',
  unchanged: 'it changed nothing',
};

export function isPassageRewrite(op: ChangeOp): op is DraftRewritePassageOp {
  return op.op === 'draft.rewrite_passage';
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function occurrences(body: string, passage: string): Span[] {
  const spans: Span[] = [];
  for (let at = body.indexOf(passage); at !== -1; at = body.indexOf(passage, at + 1)) spans.push({ start: at, end: at + passage.length });
  return spans;
}

/**
 * Where a staged rewrite's passage stands in the draft now: at its offsets, or moved by an edit elsewhere when the passage and the text either side
 * of it still occur exactly once. `null` when it is gone, was edited in or around, can no longer be told apart, or the draft was replaced.
 */
export function locateRewrite(draft: Generation.Draft, op: DraftRewritePassageOp): Span | null {
  const { anchor } = op;
  if (!anchor || anchor.draftId !== String(draft.id)) return null;
  const location = locatePassage(draft.body, { ...anchor, passage: op.passage });
  return location.freshness === 'stale' ? null : { start: location.start, end: location.end };
}

function staleRewriteError(draft: Generation.Draft, op: DraftRewritePassageOp): Error {
  const passage = op.label?.trim() ? `“${op.label.trim()}”` : op.anchor ? `¶${op.anchor.paragraph}` : 'a passage';
  return AppErrorCode.RFN_021.create({ passage, chapter: String(draft.chapter) });
}

/** The passage comments a rewrite may be told apart by — the one it answers, else every one on its chapter — while they still describe the draft. */
function commentSpans(op: DraftRewritePassageOp, draft: Generation.Draft, contexts: readonly Refinement.ChatPassageContext[]): Span[] {
  const current = contexts.filter(
    context => context.chapter === op.chapter && context.draftId === String(draft.id) && context.revision === draft.revision && context.saveSeq === draft.saveSeq,
  );
  const answered = op.contextIndex === undefined ? undefined : contexts[op.contextIndex - 1];
  return answered && current.includes(answered) ? [answered] : current;
}

function locate(body: string, passage: string, hints: readonly Span[]): { passage: string; span: Span } | RewriteDropReason {
  for (const candidate of new Set([passage, passage.replace(COMMENT_INDENT, '\n')])) {
    const spans = occurrences(body, candidate);
    if (spans.length === 0) continue;
    const told = spans.length === 1 ? spans : spans.filter(span => hints.some(hint => overlaps(span, hint)));
    return told.length === 1 ? { passage: candidate, span: told[0] as Span } : 'ambiguous';
  }
  return 'not_found';
}

function resolveRewrite(op: DraftRewritePassageOp, state: ChapterState, hints: (draft: Generation.Draft) => Span[]): AnchoredRewrite | RewriteDropReason {
  const { draft } = state;
  if (!draft) return 'no_draft';
  if (state.locked || draft.status === 'final') return 'locked';
  if (draft.isolated) return 'isolated';
  if (draft.reviewStatus === 'generating') return 'generating';
  const passage = normalizeLineEndings(op.passage);
  if (passage.length > MAX_PASSAGE_CHARS) return 'too_long';
  const located = locate(draft.body, passage, hints(draft));
  if (typeof located === 'string') return located;

  const replacement = fitReplacement(located.passage, normalizeLineEndings(op.replacement));
  if (replacement === located.passage) return 'unchanged';
  const leading = located.passage.length - located.passage.trimStart().length;
  const anchor: PassageRewriteAnchor = {
    draftId: String(draft.id),
    revision: draft.revision,
    saveSeq: draft.saveSeq,
    ...located.span,
    passageHash: passageHash(located.passage),
    paragraph: paragraphAt(draft.body, located.span.start + leading),
    ...anchorContext(draft.body, located.span.start, located.span.end),
  };
  return { ...op, passage: located.passage, replacement, anchor };
}

async function loadChapters(db: DraftReader, projectId: bigint, ops: readonly DraftRewritePassageOp[]): Promise<Map<number, ChapterState>> {
  const chapters = [...new Set(ops.map(op => op.chapter))];
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { storyCurrentChapter: true } });
  const drafts = await db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, chapters)) });
  const cursor = project?.storyCurrentChapter ?? 0;
  return new Map(chapters.map(chapter => [chapter, { draft: drafts.find(draft => draft.chapter === chapter), locked: chapter <= cursor }]));
}

function wholeChapterEdits(ops: readonly ChangeOp[]): Set<number> {
  return new Set(ops.flatMap(op => (op.op === 'draft.update' || op.op === 'draft.remove' ? [op.chapter] : [])));
}

/**
 * A chat turn's rewrites anchored to the drafts as they stand: each passage must occur once in its chapter, or once within the passage comment it
 * answers, and its anchor is the server's, whatever the model sent. A rewrite that cannot be placed is dropped with its reason rather than guessed
 * at, as is an exact repeat; a `contextIndex` naming no comment on the chapter is dropped from the op.
 */
export async function anchorPassageRewrites(
  db: DraftReader,
  projectId: bigint,
  ops: readonly ChangeOp[],
  contexts: readonly Refinement.ChatPassageContext[] = [],
): Promise<AnchoredRewrites> {
  const rewrites = ops.filter(isPassageRewrite);
  if (rewrites.length === 0) return { ops: [...ops], dropped: [] };
  const states = await loadChapters(db, projectId, rewrites);
  const wholeChapter = wholeChapterEdits(ops);
  const dropped: DroppedRewrite[] = [];
  const staged = new Set<string>();
  const kept = ops.flatMap((op): ChangeOp[] => {
    if (!isPassageRewrite(op)) return [op];
    const { anchor: _sent, contextIndex, ...proposed } = op;
    const answers = contextIndex !== undefined && contexts[contextIndex - 1]?.chapter === op.chapter;
    const rewrite = { ...proposed, ...(answers ? { contextIndex } : {}) };
    const resolved = wholeChapter.has(op.chapter)
      ? 'whole_chapter'
      : resolveRewrite(rewrite, states.get(op.chapter) as ChapterState, draft => commentSpans(rewrite, draft, contexts));
    if (typeof resolved === 'string') {
      dropped.push({ chapter: op.chapter, ...(op.label ? { label: op.label } : {}), reason: resolved });
      return [];
    }
    const key = JSON.stringify([op.chapter, resolved.anchor.start, resolved.anchor.end, resolved.replacement]);
    if (staged.has(key)) return [];
    staged.add(key);
    return [resolved];
  });
  return { ops: kept, dropped };
}

/**
 * Staging's own check, for every route that stages a change-set: a rewrite keeps the occurrence its anchor still finds, moved or not, is anchored
 * afresh when its passage occurs once, and is otherwise refused — never placed by a guess. A chapter rewritten whole in the same change-set refuses
 * its rewrites, so no change-set mixes the two.
 */
export async function stampPassageAnchors(db: DraftReader, projectId: bigint, ops: ChangeOp[]): Promise<ChangeOp[]> {
  const rewrites = ops.filter(isPassageRewrite);
  if (rewrites.length === 0) return ops;
  const states = await loadChapters(db, projectId, rewrites);
  const wholeChapter = wholeChapterEdits(ops);
  return ops.map(op => {
    if (!isPassageRewrite(op)) return op;
    const kept = (draft: Generation.Draft): Span[] => {
      const span = locateRewrite(draft, op);
      return span ? [span] : [];
    };
    const resolved = wholeChapter.has(op.chapter) ? 'whole_chapter' : resolveRewrite(op, states.get(op.chapter) as ChapterState, kept);
    if (typeof resolved === 'string') throw AppErrorCode.RFN_004.create();
    return resolved;
  });
}

/**
 * The chapter's body with every selected rewrite in place, each where its passage stands now — an edit elsewhere in the chapter only moves it —
 * written from the end of the text back so each span still holds. Refused whole, naming the rewrite, when a passage can no longer be found
 * (`RFN_021`, so the author can uncheck it and apply the rest), and when two rewrites change the same words (`RFN_020`).
 */
export function rewrittenBody(draft: Generation.Draft, rewrites: readonly DraftRewritePassageOp[]): string {
  const located = rewrites
    .map(op => {
      const span = locateRewrite(draft, op);
      if (!span) throw staleRewriteError(draft, op);
      return { replacement: op.replacement, span };
    })
    .sort((a, b) => b.span.start - a.span.start);
  located.forEach((rewrite, index) => {
    const before = located[index + 1];
    if (before && overlaps(before.span, rewrite.span)) throw AppErrorCode.RFN_020.create({ chapter: String(draft.chapter) });
  });
  return located.reduce((body, rewrite) => replacePassage(body, rewrite.span, rewrite.replacement), draft.body);
}

function rewritesOn(ops: readonly ChangeOp[], ref: string): DraftRewritePassageOp[] | null {
  const touching = ops.filter(op => changeSetRefs([op]).includes(ref));
  return touching.length > 0 && touching.every(isPassageRewrite) ? (touching as DraftRewritePassageOp[]) : null;
}

/** The drafts a change-set's rewrites name, as they stand: what tells two cards' passages apart. */
export async function rewriteDrafts(db: DraftReader, projectId: bigint, ops: readonly ChangeOp[]): Promise<Map<number, Generation.Draft>> {
  const chapters = [...new Set(ops.filter(isPassageRewrite).map(op => op.chapter))];
  if (chapters.length === 0) return new Map();
  const drafts = await db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, chapters)) });
  return new Map(drafts.map(draft => [draft.chapter, draft]));
}

/**
 * Whether a newer card leaves an older one standing although they share refs: every shared ref is a draft both rewrite only passage by passage,
 * and each of the older card's passages still stands in it, apart from every newer one. A whole-chapter edit on either side, or a passage of
 * either that can no longer be found, does not.
 */
export function rewritesApart(older: readonly ChangeOp[], newer: readonly ChangeOp[], shared: readonly string[], drafts: ReadonlyMap<number, Generation.Draft>): boolean {
  return shared.every(ref => {
    const olderRewrites = rewritesOn(older, ref);
    const newerRewrites = rewritesOn(newer, ref);
    const draft = olderRewrites?.[0] && drafts.get(olderRewrites[0].chapter);
    if (!olderRewrites || !newerRewrites || !draft) return false;
    const spans = (ops: DraftRewritePassageOp[]) => ops.map(op => locateRewrite(draft, op));
    const olderSpans = spans(olderRewrites);
    const newerSpans = spans(newerRewrites);
    if ([...olderSpans, ...newerSpans].some(span => span === null)) return false;
    return (olderSpans as Span[]).every(span => (newerSpans as Span[]).every(other => !overlaps(span, other)));
  });
}

export function droppedRewritesNote(dropped: readonly DroppedRewrite[]): string | undefined {
  if (dropped.length === 0) return undefined;
  const lines = dropped.map(entry => {
    const subject = entry.label ? `“${entry.label}” in chapter ${entry.chapter}` : `A passage in chapter ${entry.chapter}`;
    return `- ${subject}: ${DROP_REASONS[entry.reason]}.`;
  });
  const count = dropped.length === 1 ? 'a passage rewrite' : `${dropped.length} passage rewrites`;
  return [`Forge left out ${count}:`, ...lines].join('\n');
}

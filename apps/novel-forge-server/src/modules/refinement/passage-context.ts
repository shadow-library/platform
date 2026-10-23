import { and, eq, inArray } from 'drizzle-orm';
import { paragraphAt } from '@shadow-library/sdk';

import { AppErrorCode } from '@server/classes';
import { type Generation, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ScreenedText } from '../ai/hard-line';
import { anchorContext, locatePassage, passageHash } from '../generation/passage-anchor';

export const MAX_PASSAGE_CONTEXTS = 10;
export const MAX_PASSAGE_QUOTE_CHARS = 2000;
export const MAX_PASSAGE_COMMENT_CHARS = 2000;
export const PASSAGE_COMMENTS_HEADING = 'Passage comments:';

/** Offsets are UTF-16 code units into the draft body as the author read it, at `revision` (and `saveSeq`, when sent). */
export interface PassageContextInput {
  kind: 'passage';
  chapter: number;
  draftId: string;
  revision: number;
  saveSeq?: number;
  start: number;
  end: number;
  passageHash: string;
  quote: string;
  comment: string;
}

interface PassageSpan {
  start: number;
  end: number;
}

type DraftReader = Pick<PrimaryDatabase, 'query'>;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function uniqueSpan(body: string, quote: string): PassageSpan | null {
  const found = body.indexOf(quote);
  if (found === -1 || body.indexOf(quote, found + 1) !== -1) return null;
  return { start: found, end: found + quote.length };
}

/** Where a quote no longer at its offsets now sits: with the read revision, only a copy between the words that surrounded it; without it, the quote's one occurrence. */
export function relocateQuote(body: string, input: PassageContextInput, earlierBody: string | undefined): PassageSpan | null {
  if (earlierBody === undefined || earlierBody.slice(input.start, input.end) !== input.quote) return uniqueSpan(body, input.quote);
  const anchor = { start: input.start, end: input.end, passageHash: input.passageHash, passage: input.quote, ...anchorContext(earlierBody, input.start, input.end) };
  const located = locatePassage(body, anchor);
  return located.freshness === 'stale' ? null : { start: located.start, end: located.end };
}

// A selection that splits a surrogate pair cannot be stored: Postgres refuses a lone surrogate in jsonb, and only after the turn has started.
function assertWellFormed(input: PassageContextInput): void {
  const { quote, comment } = input;
  const matches = quote.trim().length > 0 && input.end - input.start === quote.length && passageHash(quote) === input.passageHash;
  if (!matches || LONE_SURROGATE.test(quote) || LONE_SURROGATE.test(comment)) throw AppErrorCode.CHT_010.create({ chapter: String(input.chapter) });
}

// A revision folds later autosaves into its snapshot, so only an older revision's snapshot can still show what surrounded the quote.
async function earlierBody(db: DraftReader, draft: Generation.Draft, input: PassageContextInput): Promise<string | undefined> {
  if (input.revision >= draft.revision) return undefined;
  const snapshot = await db.query.draftRevisions.findFirst({
    where: and(eq(schema.draftRevisions.draftId, draft.id), eq(schema.draftRevisions.revision, input.revision)),
    columns: { body: true },
  });
  return snapshot?.body;
}

async function anchorInDraft(db: DraftReader, draft: Generation.Draft, input: PassageContextInput): Promise<Refinement.ChatPassageContext> {
  const inPlace = draft.body.slice(input.start, input.end) === input.quote;
  const span = inPlace ? { start: input.start, end: input.end } : relocateQuote(draft.body, input, await earlierBody(db, draft, input));
  if (!span) throw AppErrorCode.CHT_009.create({ chapter: String(input.chapter) });
  const leading = input.quote.length - input.quote.trimStart().length;
  const trailing = input.quote.length - input.quote.trimEnd().length;
  return {
    kind: 'passage',
    chapter: draft.chapter,
    draftId: String(draft.id),
    revision: draft.revision,
    saveSeq: draft.saveSeq,
    start: span.start,
    end: span.end,
    passageHash: input.passageHash,
    quote: input.quote,
    comment: input.comment.trim(),
    firstParagraph: paragraphAt(draft.body, span.start + leading),
    lastParagraph: paragraphAt(draft.body, span.end - trailing - 1),
  };
}

/** Anchors each passage to the draft as it stands now; a gone or replaced draft, an unfindable quote or an isolated chapter (never sent to a chat model) refuses the turn. */
export async function resolvePassageContexts(db: DraftReader, projectId: bigint, inputs: readonly PassageContextInput[]): Promise<Refinement.ChatPassageContext[]> {
  if (inputs.length === 0) return [];
  inputs.forEach(assertWellFormed);
  const chapters = [...new Set(inputs.map(input => input.chapter))];
  const drafts = await db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, chapters)) });
  const resolved: Refinement.ChatPassageContext[] = [];
  for (const input of inputs) {
    const draft = drafts.find(candidate => candidate.chapter === input.chapter);
    if (!draft || String(draft.id) !== input.draftId) throw AppErrorCode.CHT_009.create({ chapter: String(input.chapter) });
    if (draft.isolated) throw AppErrorCode.CHT_011.create({ chapter: String(input.chapter) });
    resolved.push(await anchorInDraft(db, draft, input));
  }
  return resolved;
}

function indented(text: string): string {
  return text.replace(/\n/g, '\n   ');
}

// Every part keeps its own lines, never escaped: the hard-line screens read this text, and a quote's line break must still end the word before it.
function renderPassageContext(context: Refinement.ChatPassageContext, index: number): string {
  const paragraphs = context.firstParagraph === context.lastParagraph ? `¶${context.firstParagraph}` : `¶${context.firstParagraph}–${context.lastParagraph}`;
  return [
    `${index + 1}. Chapter ${context.chapter}, revision ${context.revision}, ${paragraphs} (chars ${context.start}–${context.end})`,
    `   Quote: "${indented(context.quote)}"`,
    `   Comment: ${context.comment ? indented(context.comment) : '(none)'}`,
  ].join('\n');
}

/** The author's turn as every prompt shows it — this turn's and each later turn's history alike — so a stored message always renders the same. */
export function renderTurnContent(content: string, contexts: readonly Refinement.ChatPassageContext[] | null | undefined): string {
  if (!contexts?.length) return content;
  const block = [PASSAGE_COMMENTS_HEADING, ...contexts.map(renderPassageContext)].join('\n');
  return content.trim() ? `${content}\n\n${block}` : block;
}

/** What the author wrote this turn — the message and their comments, never the quoted chapter text — for the checks that read the author's own words. */
export function authorWords(content: string, contexts: readonly Refinement.ChatPassageContext[] | null | undefined): string {
  return [content, ...(contexts ?? []).map(context => context.comment)].filter(text => text.trim()).join('\n\n');
}

/** Each part of the author's turn on its own, so no part's words run into another's before the hard line reads them. */
export function turnScreens(content: string, contexts: readonly Refinement.ChatPassageContext[] | null | undefined): ScreenedText[] {
  return [
    { text: content, scope: 'supplied', source: 'Your message' },
    ...(contexts ?? []).flatMap((context): ScreenedText[] => [
      { text: context.quote, scope: 'supplied', source: `The passage you quoted from chapter ${context.chapter}` },
      { text: context.comment, scope: 'supplied', source: `Your comment on chapter ${context.chapter}` },
    ]),
  ];
}

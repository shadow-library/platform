import { marked, type Token } from 'marked';
import { paragraphNumberAt, type ProseParagraph, proseParagraphs } from '@shadow-library/sdk';

import { type ProposalResponse } from '@/lib/apis';

import { isRecord } from './is-record';
import { selectionOf, type SelectionRefusal, type SelectionResult } from './passage-selection';
import { alignRendered, proseSourceMap, sourceRangeOf } from './prose-source-map';

const MARKED_OPTIONS = { gfm: true, breaks: true } as const;
const LINE_MARKERS = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|(?:[-+*]|\d{1,9}[.)])[ \t]+)*/;
const CODE_LINE = /^(?: {4}|\t)|^ {0,3}(?:`{3,}|~{3,})/m;

/** A pending rewrite shown in the reader: the body's words it takes out and the words it puts in. */
export interface ProposedPassage {
  start: number;
  end: number;
  replacement: string;
}

interface Insertion {
  /** Where in the body the text goes in. */
  at: number;
  /** Where it starts in the rendered source. */
  from: number;
  text: string;
}

/** The Markdown the reader renders: the body itself, or the body with pending rewrites marked into it as `<del>` and `<ins>`. */
export interface ReaderSource {
  body: string;
  source: string;
  insertions: readonly Insertion[];
}

export type ReaderRefusal = SelectionRefusal | 'in-preview';

export type ReaderSelection = SelectionResult | { kind: 'in-preview' };

export interface TextSpan {
  start: number;
  end: number;
}

function inlineReplacement(text: string): string {
  return text
    .trim()
    .replace(/[ \t]*\n[ \t]*\n\s*/g, '<br><br>')
    .replace(/[ \t]*\n[ \t]*/g, '<br>');
}

function touchesCode(body: string, paragraphs: readonly ProseParagraph[], passage: ProposedPassage): boolean {
  return paragraphs.some(paragraph => {
    if (paragraph.end <= passage.start || paragraph.start >= passage.end) return false;
    const lineStart = body.lastIndexOf('\n', paragraph.start - 1) + 1;
    return CODE_LINE.test(body.slice(lineStart, paragraph.end));
  });
}

/** Each line of the passage is struck through on its own, after its block markers, so a rewrite across paragraphs keeps every block the reader shows. */
function markPassage(body: string, passage: ProposedPassage): { at: number; text: string }[] {
  const marks: { at: number; text: string }[] = [];
  let lastEnd: number | undefined;
  for (let lineStart = passage.start; lineStart < passage.end;) {
    const breakAt = body.indexOf('\n', lineStart);
    const lineEnd = breakAt === -1 || breakAt > passage.end ? passage.end : breakAt;
    const line = body.slice(lineStart, lineEnd);
    const atLineStart = lineStart === 0 || body.charAt(lineStart - 1) === '\n';
    const skip = atLineStart ? (LINE_MARKERS.exec(line)?.[0].length ?? 0) : 0;
    const content = line.slice(skip).trimEnd();
    if (content.trim()) {
      const start = lineStart + skip + (content.length - content.trimStart().length);
      const end = lineStart + skip + content.length;
      marks.push({ at: start, text: '<del data-proposed>' }, { at: end, text: '</del>' });
      lastEnd = end;
    }
    lineStart = lineEnd + 1;
  }
  const replacement = inlineReplacement(passage.replacement);
  if (lastEnd !== undefined && replacement) marks.push({ at: lastEnd, text: `<ins data-proposed>${replacement}</ins>` });
  return marks;
}

/**
 * The body with each pending rewrite marked in place. A rewrite that overlaps one before it or touches code is left out, and a CRLF body is shown as
 * it is: its offsets would not survive the lexer's line-ending rewrite.
 */
export function readerSource(body: string, proposed: readonly ProposedPassage[]): ReaderSource {
  if (proposed.length === 0 || body.includes('\r')) return { body, source: body, insertions: [] };
  const paragraphs = proseParagraphs(body);
  const marks: { at: number; text: string }[] = [];
  let reached = 0;
  for (const passage of [...proposed].sort((a, b) => a.start - b.start)) {
    if (passage.start < reached || passage.end > body.length || touchesCode(body, paragraphs, passage)) continue;
    marks.push(...markPassage(body, passage));
    reached = passage.end;
  }
  const sorted = marks.map((mark, order) => ({ ...mark, order })).sort((a, b) => a.at - b.at || a.order - b.order);
  const insertions: Insertion[] = [];
  let shift = 0;
  let source = '';
  let cursor = 0;
  for (const mark of sorted) {
    source += body.slice(cursor, mark.at) + mark.text;
    cursor = mark.at;
    insertions.push({ at: mark.at, from: mark.at + shift, text: mark.text });
    shift += mark.text.length;
  }
  return { body, source: source + body.slice(cursor), insertions };
}

/** The body offset a source offset stands for; undefined inside text the preview added. */
export function bodyOffset(view: ReaderSource, offset: number): number | undefined {
  let shift = 0;
  for (const insertion of view.insertions) {
    if (offset <= insertion.from) return offset - shift;
    if (offset < insertion.from + insertion.text.length) return undefined;
    shift += insertion.text.length;
  }
  return offset - shift;
}

/** Where a body offset sits in the source: a span's start goes after any marks at that point, its end before them. */
export function sourceOffset(view: ReaderSource, offset: number, side: 'start' | 'end'): number {
  const before = view.insertions.filter(insertion => insertion.at < offset || (side === 'start' && insertion.at === offset));
  return offset + before.reduce((sum, insertion) => sum + insertion.text.length, 0);
}

function touchesInsertion(view: ReaderSource, from: number, to: number): boolean {
  return view.insertions.some(insertion => insertion.from < to && insertion.from + insertion.text.length > from);
}

function normalizedToSource(source: string): (offset: number) => number {
  if (!source.includes('\r')) return offset => offset;
  const offsets: number[] = [];
  for (let index = 0; index < source.length; index++) if (!(source.charAt(index) === '\r' && source.charAt(index + 1) === '\n')) offsets.push(index);
  offsets.push(source.length);
  return offset => offsets[offset] ?? source.length;
}

function withParagraph(html: string, paragraph: number): string {
  return html.replace(/^(\s*<[a-z][a-z0-9]*)/i, `$1 data-paragraph="${paragraph}"`);
}

/**
 * The reader's HTML, each top-level block tagged with the number of the paragraph it starts in, as the shared splitter counts paragraphs. A number
 * is given once: a block the lexer splits in two, or one rendered in two pieces, shows it on its first part only.
 */
export function numberedHtml(view: ReaderSource, paragraphs: readonly ProseParagraph[], shown: Set<number>): string {
  const toSource = normalizedToSource(view.source);
  const normalized = view.source.replace(/\r\n?/g, '\n');
  const tokens = marked.lexer(normalized, MARKED_OPTIONS);
  let cursor = 0;
  return tokens
    .map((token: Token) => {
      const at = normalized.indexOf(token.raw, cursor);
      if (at !== -1) cursor = at + token.raw.length;
      const html = marked.parser([token], MARKED_OPTIONS);
      if (at === -1 || token.type === 'hr' || token.type === 'space') return html;
      const offset = bodyOffset(view, toSource(at + token.raw.length - token.raw.trimStart().length));
      if (offset === undefined) return html;
      const paragraph = paragraphNumberAt(paragraphs, offset);
      if (shown.has(paragraph)) return html;
      const tagged = withParagraph(html, paragraph);
      if (tagged !== html) shown.add(paragraph);
      return tagged;
    })
    .join('');
}

/** A selection made in the reader, mapped through the source it rendered and back to the body; one that touches a proposed change is refused. */
export function readerSelection(view: ReaderSource, domText: string, domStart: number, domEnd: number, maxChars: number): ReaderSelection {
  if (view.body.includes('\r')) return { kind: 'line-endings' };
  const map = proseSourceMap(view.source);
  if (!map) return { kind: 'unmapped' };
  const range = sourceRangeOf(view.source, map, domText, domStart, domEnd);
  if (range.kind !== 'ok') return range;
  if (touchesInsertion(view, range.start, range.end)) return { kind: 'in-preview' };
  const start = bodyOffset(view, range.start) ?? range.start;
  const end = bodyOffset(view, range.end) ?? range.end;
  const result = selectionOf(view.body, start, end);
  if (result.kind === 'ok' && result.selection.end - result.selection.start > maxChars) return { kind: 'too-long' };
  return result;
}

/** The DOM text units that render each body span: undefined for a span none of whose text shows, and for all of them when the DOM does not match the source. */
export function renderedSpans(view: ReaderSource, domText: string, spans: readonly TextSpan[]): (TextSpan | undefined)[] {
  const map = proseSourceMap(view.source);
  const paired = map && alignRendered(map, domText);
  if (!map || !paired) return spans.map(() => undefined);
  return spans.map(span => {
    const from = sourceOffset(view, span.start, 'start');
    const to = sourceOffset(view, span.end, 'end');
    let first = -1;
    let last = -1;
    paired.forEach((unit, index) => {
      if (unit === -1 || (map.starts[unit] ?? Number.NaN) < from || (map.ends[unit] ?? Number.NaN) > to) return;
      if (first === -1) first = index;
      last = index;
    });
    return first === -1 ? undefined : { start: first, end: last + 1 };
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Where a staged rewrite's passage stands in the body: at its anchor, or moved with the words either side of it, each found exactly once. */
export function locateRewrite(body: string, draftId: string, op: Record<string, unknown>): TextSpan | undefined {
  const passage = stringField(op.passage);
  const anchor = isRecord(op.anchor) ? op.anchor : undefined;
  if (!passage || !anchor || stringField(anchor.draftId) !== draftId) return undefined;
  const { start, end } = anchor;
  if (typeof start === 'number' && typeof end === 'number' && body.slice(start, end) === passage) return { start, end };
  const framed = `${stringField(anchor.contextBefore) ?? ''}${passage}${stringField(anchor.contextAfter) ?? ''}`;
  const found = body.indexOf(framed);
  if (found === -1 || body.indexOf(framed, found + 1) !== -1) return undefined;
  const at = found + (stringField(anchor.contextBefore) ?? '').length;
  return { start: at, end: at + passage.length };
}

/** Every passage the chat proposes to rewrite in this draft and the author has not answered yet, where it can still be found. */
export function proposedPassages(
  proposals: readonly Pick<ProposalResponse, 'status' | 'changeSet' | 'opResults'>[],
  draft: { id: string; chapter: number; body?: string | null },
): ProposedPassage[] {
  const body = draft.body ?? '';
  return proposals.flatMap(proposal => {
    if (proposal.status !== 'pending') return [];
    return proposal.changeSet.flatMap((op, index): ProposedPassage[] => {
      const record = op as Record<string, unknown>;
      if (record.op !== 'draft.rewrite_passage' || record.chapter !== draft.chapter) return [];
      const result = proposal.opResults?.find(entry => entry.index === index);
      if (result && result.status !== 'pending') return [];
      const span = locateRewrite(body, draft.id, record);
      return span ? [{ ...span, replacement: stringField(record.replacement) ?? '' }] : [];
    });
  });
}

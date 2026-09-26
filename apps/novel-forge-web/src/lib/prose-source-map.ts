import { marked } from 'marked';

/** Stands in for a named entity the browser decodes to one character this map cannot know. */
const ANY_CHAR = '￿';

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const ENTITY = /^&(#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

/**
 * How a selection may meet a piece of Markdown syntax. `emphasis` is widened to take the whole token in; `atomic` (links, code spans, autolinks,
 * inline HTML) must be taken whole or selected strictly inside its text; `block` (list items, quotes, headings) must be selected inside
 * its text, so its markers never land in a span.
 */
export type SyntaxKind = 'emphasis' | 'atomic' | 'block';

export interface SyntaxSpan {
  kind: SyntaxKind;
  start: number;
  end: number;
  /** The token's own text, between its syntax. */
  innerStart: number;
  innerEnd: number;
}

const SYNTAX_KINDS: Record<string, SyntaxKind> = {
  em: 'emphasis',
  strong: 'emphasis',
  del: 'emphasis',
  link: 'atomic',
  codespan: 'atomic',
  image: 'atomic',
  list_item: 'block',
  blockquote: 'block',
  heading: 'block',
};

const OPEN_TAG = /^<([a-z][a-z0-9-]*)\b[^>]*>$/i;

/**
 * The text a Markdown source renders to, with where each rendered UTF-16 unit came from in the source. A unit whose source could not be placed
 * has NaN bounds, so a selection touching it is refused rather than anchored to a guess.
 */
export interface ProseSourceMap {
  text: string;
  starts: number[];
  ends: number[];
  syntax: readonly SyntaxSpan[];
}

interface LexToken {
  type: string;
  raw?: string;
  text?: string;
  tokens?: LexToken[];
  items?: LexToken[];
  header?: LexToken[];
  rows?: LexToken[][];
}

const SILENT = new Set(['space', 'hr', 'html', 'image', 'def', 'checkbox']);

class MapBuilder {
  readonly text: string[] = [];
  readonly starts: number[] = [];
  readonly ends: number[] = [];
  readonly syntax: SyntaxSpan[] = [];

  mark(kind: SyntaxKind, start: number, end: number, innerStart: number, innerEnd: number): void {
    if ([start, end, innerStart, innerEnd].some(Number.isNaN)) return;
    this.syntax.push({ kind, start, end, innerStart, innerEnd });
  }

  emit(unit: string, start: number, end: number): void {
    this.text.push(unit);
    this.starts.push(start);
    this.ends.push(end);
  }

  /** A run of plain text read from its raw source: entities render as the character they name, spanning the whole entity. */
  plain(raw: string, base: number): void {
    let at = 0;
    while (at < raw.length) {
      const entity = raw.charAt(at) === '&' ? ENTITY.exec(raw.slice(at)) : null;
      if (entity) {
        const name = entity[1] ?? '';
        const decoded = name.startsWith('#') ? decodeNumeric(name) : (NAMED_ENTITIES[name.toLowerCase()] ?? ANY_CHAR);
        for (const unit of decoded.split('')) this.emit(unit, base + at, base + at + entity[0].length);
        at += entity[0].length;
        continue;
      }
      this.emit(raw.charAt(at), base + at, base + at + 1);
      at++;
    }
  }

  walk(token: LexToken, base: number): void {
    const raw = token.raw ?? token.text ?? '';
    const children = childrenOf(token);
    const kind = SYNTAX_KINDS[token.type];
    if (children) {
      let cursor = 0;
      let innerStart = Number.NaN;
      let innerEnd = Number.NaN;
      const placed: { token: LexToken; start: number; end: number }[] = [];
      for (const child of children) {
        const childRaw = child.raw ?? child.text ?? '';
        const at = raw.indexOf(childRaw, cursor);
        if (at === -1 || Number.isNaN(base)) {
          this.walk(child, Number.NaN);
          continue;
        }
        this.walk(child, base + at);
        placed.push({ token: child, start: base + at, end: base + at + childRaw.length });
        if (Number.isNaN(innerStart)) innerStart = base + at;
        innerEnd = base + at + childRaw.length;
        cursor = at + childRaw.length;
      }
      this.pairInlineHtml(placed);
      if (kind) this.mark(kind, base, base + raw.length, innerStart, innerEnd);
      return;
    }
    if (token.type === 'html' || token.type === 'image') this.mark('atomic', base, base + raw.length, base, base);
    if (SILENT.has(token.type)) return;
    if (token.type === 'br') {
      this.emit('\n', base, base + raw.length);
      return;
    }
    if (token.type === 'escape') {
      this.emit(token.text ?? '', base, base + raw.length);
      return;
    }
    if (token.type === 'codespan' || token.type === 'code') {
      const text = token.text ?? '';
      const at = raw.indexOf(text);
      const from = at === -1 ? Number.NaN : base + at;
      text.split('').forEach((unit, index) => this.emit(unit, from + index, from + index + 1));
      if (token.type === 'codespan') this.mark('atomic', base, base + raw.length, from, from + text.length);
      return;
    }
    this.plain(raw, base);
  }

  /** `<b>` and `</b>` lex as two tokens; together they are one element, taken whole or selected inside. */
  private pairInlineHtml(placed: readonly { token: LexToken; start: number; end: number }[]): void {
    placed.forEach((open, index) => {
      const name = open.token.type === 'html' ? OPEN_TAG.exec((open.token.raw ?? '').trim())?.[1] : undefined;
      if (!name) return;
      const close = placed.slice(index + 1).find(candidate => candidate.token.type === 'html' && (candidate.token.raw ?? '').trim().toLowerCase() === `</${name.toLowerCase()}>`);
      if (close) this.mark('atomic', open.start, close.end, open.end, close.start);
    });
  }
}

function decodeNumeric(name: string): string {
  const code = name.startsWith('#x') || name.startsWith('#X') ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
  try {
    return String.fromCodePoint(code);
  } catch {
    return ANY_CHAR;
  }
}

function childrenOf(token: LexToken): LexToken[] | undefined {
  if (token.type === 'table') return [...(token.header ?? []), ...(token.rows ?? []).flat()];
  if (token.type === 'list') return token.items;
  return token.tokens && token.tokens.length > 0 ? token.tokens : undefined;
}

/** Built from `marked`'s own lexer with the reader's options, so the tokens are the ones the reader rendered. Undefined for CRLF text, which the lexer rewrites. */
export function proseSourceMap(markdown: string, base = 0): ProseSourceMap | undefined {
  if (markdown.includes('\r')) return undefined;
  const builder = new MapBuilder();
  let cursor = 0;
  for (const token of marked.lexer(markdown, { gfm: true, breaks: true }) as unknown as LexToken[]) {
    const raw = token.raw ?? '';
    const at = markdown.indexOf(raw, cursor);
    builder.walk(token, at === -1 ? Number.NaN : base + at);
    if (at !== -1) cursor = at + raw.length;
  }
  return { text: builder.text.join(''), starts: builder.starts, ends: builder.ends, syntax: builder.syntax };
}

function isSpace(unit: string | undefined): boolean {
  return unit !== undefined && /\s/.test(unit);
}

/**
 * Pairs each unit of the DOM's text with the map unit it renders; whitespace the DOM adds between blocks, or a line break it draws as `<br>`,
 * pairs with nothing. Any other disagreement means the DOM is not what the map expects, so nothing is paired.
 */
export function alignRendered(map: Pick<ProseSourceMap, 'text'>, domText: string): number[] | undefined {
  const paired = new Array<number>(domText.length).fill(-1);
  let i = 0;
  let j = 0;
  while (j < domText.length) {
    const unit = map.text[i];
    if (unit !== undefined && (unit === ANY_CHAR || unit === domText[j])) {
      paired[j++] = i++;
      continue;
    }
    if (isSpace(domText[j])) j++;
    else if (isSpace(unit)) i++;
    else return undefined;
  }
  while (i < map.text.length) if (!isSpace(map.text[i++])) return undefined;
  return paired;
}

export type SourceRange = { kind: 'ok'; start: number; end: number } | { kind: 'empty' } | { kind: 'unmapped' } | { kind: 'cuts-markup' };

/** Widens `[start, end)` over every emphasis it cuts, until it cuts none; undefined when it cuts a link, a code span, inline HTML or a block. */
export function wholeTokenRange(syntax: readonly SyntaxSpan[], start: number, end: number): { start: number; end: number } | undefined {
  let range = { start, end };
  for (let changed = true; changed;) {
    changed = false;
    for (const span of syntax) {
      const disjoint = range.end <= span.start || range.start >= span.end;
      const whole = range.start <= span.start && range.end >= span.end;
      const inside = range.start >= span.innerStart && range.end <= span.innerEnd;
      if (disjoint || inside || (whole && span.kind !== 'block')) continue;
      if (span.kind !== 'emphasis') return undefined;
      range = { start: Math.min(range.start, span.start), end: Math.max(range.end, span.end) };
      changed = true;
    }
  }
  return range;
}

/**
 * The source span of DOM units `[domStart, domEnd)`. A span that cuts an emphasis is widened to take it whole; one that cuts any other syntax is
 * refused, so a rewrite never splits Markdown open.
 */
export function sourceRangeOf(source: string, map: ProseSourceMap, domText: string, domStart: number, domEnd: number): SourceRange {
  const paired = alignRendered(map, domText);
  if (!paired) return { kind: 'unmapped' };
  let first = domStart;
  let last = domEnd - 1;
  while (first <= last && (paired[first] ?? -1) === -1) first++;
  while (last >= first && (paired[last] ?? -1) === -1) last--;
  if (first > last) return { kind: 'empty' };
  const from = paired[first] ?? -1;
  const to = paired[last] ?? -1;
  for (let unit = from; unit <= to; unit++) if (Number.isNaN(map.starts[unit])) return { kind: 'unmapped' };
  const start = map.starts[from] ?? Number.NaN;
  const end = map.ends[to] ?? Number.NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end > source.length) return { kind: 'unmapped' };
  const range = wholeTokenRange(map.syntax, start, end);
  return range ? { kind: 'ok', ...range } : { kind: 'cuts-markup' };
}

/**
 * A numbered block of chapter prose: a paragraph, a heading, a whole list, a quote or a code block, as a Markdown reader sets them apart.
 * `start` is its first non-blank character and `end` is just past its last, in UTF-16 code units of the text it was read from.
 */
export interface ProseParagraph {
  start: number;
  end: number;
}

interface Line {
  start: number;
  text: string;
}

const BLANK = /^[ \t]*$/;
const SCENE_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const QUOTE = /^ {0,3}>/;
const LIST_ITEM = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;
const LIST_AFTER_TEXT = /^ {0,3}(?:[-+*]|1[.)])[ \t]+\S/;
const DELIMITER_CELL = /^[ \t]*:?-+:?[ \t]*$/;

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  const lineBreak = /\r\n|\r|\n/g;
  let start = 0;
  for (let found = lineBreak.exec(text); found; found = lineBreak.exec(text)) {
    lines.push({ start, text: text.slice(start, found.index) });
    start = found.index + found[0].length;
  }
  lines.push({ start, text: text.slice(start) });
  return lines;
}

function indentOf(text: string): number {
  let width = 0;
  for (const char of text) {
    if (char === ' ') width++;
    else if (char === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

function isBlank(line: Line | undefined): boolean {
  return line === undefined || BLANK.test(line.text);
}

function startsBlock(text: string): boolean {
  return SCENE_BREAK.test(text) || HEADING.test(text) || FENCE.test(text) || QUOTE.test(text);
}

function tableCells(row: string): string[] {
  let text = row.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  return text.split(/(?<!\\)\|/);
}

function startsTable(lines: readonly Line[], index: number): boolean {
  const header = lines[index]?.text ?? '';
  const delimiter = lines[index + 1]?.text ?? '';
  if (!header.includes('|') || !delimiter.includes('|') || indentOf(header) >= 4 || indentOf(delimiter) >= 4) return false;
  const delimiterCells = tableCells(delimiter);
  return delimiterCells.every(cell => DELIMITER_CELL.test(cell)) && delimiterCells.length === tableCells(header).length;
}

function tableEnd(lines: readonly Line[], from: number): number {
  let last = from + 1;
  while (!isBlank(lines[last + 1])) {
    const text = (lines[last + 1] as Line).text;
    if (startsBlock(text) || LIST_AFTER_TEXT.test(text) || indentOf(text) >= 4) break;
    last++;
  }
  return last;
}

function fenceEnd(lines: readonly Line[], from: number, marker: string): number {
  const closing = new RegExp(`^ {0,3}${marker.charAt(0) === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);
  for (let index = from + 1; index < lines.length; index++) if (closing.test(lines[index]?.text ?? '')) return index;
  return lines.length - 1;
}

function indentedCodeEnd(lines: readonly Line[], from: number): number {
  let last = from;
  for (let index = from + 1; index < lines.length; index++) {
    const line = lines[index] as Line;
    if (isBlank(line)) continue;
    if (indentOf(line.text) < 4) break;
    last = index;
  }
  return last;
}

function quoteEnd(lines: readonly Line[], from: number): number {
  let last = from;
  while (!isBlank(lines[last + 1])) {
    const text = (lines[last + 1] as Line).text;
    if (!QUOTE.test(text) && (startsBlock(text) || LIST_ITEM.test(text))) break;
    last++;
  }
  return last;
}

/** A list runs on through blank lines while the next line is another item or indented under one; a line right under an item continues it lazily. */
function listEnd(lines: readonly Line[], from: number): number {
  let last = from;
  for (let index = from + 1; index < lines.length; index++) {
    const line = lines[index] as Line;
    if (isBlank(line)) continue;
    const afterBlank = index > last + 1;
    if (SCENE_BREAK.test(line.text)) break;
    const continues = (LIST_ITEM.test(line.text) && indentOf(line.text) < 4) || indentOf(line.text) >= 2 || (!afterBlank && !startsBlock(line.text));
    if (!continues) break;
    last = index;
  }
  return last;
}

function paragraphEnd(lines: readonly Line[], from: number): number {
  let last = from;
  while (!isBlank(lines[last + 1])) {
    const text = (lines[last + 1] as Line).text;
    if (SETEXT_UNDERLINE.test(text)) return last + 1;
    if (startsBlock(text) || LIST_AFTER_TEXT.test(text) || startsTable(lines, last + 1)) break;
    last++;
  }
  return last;
}

function blockEnd(lines: readonly Line[], from: number): number {
  const text = (lines[from] as Line).text;
  const fence = FENCE.exec(text)?.[1];
  if (fence) return fenceEnd(lines, from, fence);
  if (HEADING.test(text)) return from;
  if (indentOf(text) >= 4) return indentedCodeEnd(lines, from);
  if (QUOTE.test(text)) return quoteEnd(lines, from);
  if (LIST_ITEM.test(text)) return listEnd(lines, from);
  if (startsTable(lines, from)) return tableEnd(lines, from);
  return paragraphEnd(lines, from);
}

/**
 * The text's blocks in reading order, numbered from 1 by their place in the list. The chapter panel's paragraph numbers, the chips that cite a
 * passage and the server's "¶k" all come from here, so a number means the same block wherever it is shown. A scene break separates blocks and is
 * not one.
 */
export function proseParagraphs(text: string): ProseParagraph[] {
  const lines = linesOf(text);
  const paragraphs: ProseParagraph[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as Line;
    if (isBlank(line) || SCENE_BREAK.test(line.text)) continue;
    const last = blockEnd(lines, index);
    const final = lines[last] as Line;
    paragraphs.push({ start: line.start + line.text.length - line.text.trimStart().length, end: final.start + final.text.trimEnd().length });
    index = last;
  }
  return paragraphs;
}

/** The number of the block an offset falls in, from 1. An offset between two blocks belongs to the next one, and one past the last to the last. */
export function paragraphNumberAt(paragraphs: readonly ProseParagraph[], offset: number): number {
  const found = paragraphs.findIndex(paragraph => paragraph.end > offset);
  return found === -1 ? Math.max(paragraphs.length, 1) : found + 1;
}

export function paragraphAt(text: string, offset: number): number {
  return paragraphNumberAt(proseParagraphs(text), offset);
}

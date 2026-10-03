export interface TextRange {
  start: number;
  end: number;
}

/** The text after a formatting command, and the selection to put back so the author keeps their place. */
export interface ProseEdit {
  text: string;
  selection: TextRange;
}

export const TABLE_TEMPLATE = '\n| Column A | Column B |\n| --- | --- |\n| Cell 1 | Cell 2 |\n| Cell 3 | Cell 4 |\n';
export const SCENE_BREAK = '\n\n* * *\n\n';

export function surroundSelection(text: string, range: TextRange, before: string, after: string): ProseEdit {
  return {
    text: text.slice(0, range.start) + before + text.slice(range.start, range.end) + after + text.slice(range.end),
    selection: { start: range.start + before.length, end: range.end + before.length },
  };
}

/** Prefixes every line the selection touches, the whole of each line, and selects the lines it changed. */
export function prefixSelectedLines(text: string, range: TextRange, prefix: (index: number) => string): ProseEdit {
  const from = text.lastIndexOf('\n', range.start - 1) + 1;
  const newline = text.indexOf('\n', range.end);
  const to = newline === -1 ? text.length : newline;
  const lines = text
    .slice(from, to)
    .split('\n')
    .map((line, index) => prefix(index) + line)
    .join('\n');
  return { text: text.slice(0, from) + lines + text.slice(to), selection: { start: from, end: from + lines.length } };
}

export function insertAtCursor(text: string, at: number, snippet: string): ProseEdit {
  const cursor = at + snippet.length;
  return { text: text.slice(0, at) + snippet + text.slice(at), selection: { start: cursor, end: cursor } };
}

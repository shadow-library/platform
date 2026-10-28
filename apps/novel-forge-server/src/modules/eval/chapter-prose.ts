const FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})(.*)$/;
const SYSTEM_PANEL_INFO = /^system(?:\s|$)/i;
const BLOCK_START = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|`{3,}|~{3,})/;
const TABLE_END = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$|^ {0,3}(?:[-+*]|1[.)])[ \t]+\S|^(?: {4,}|\t)/;
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;

export interface ChapterProse {
  prose: string;
  /** A fence that never closes: a Markdown reader renders the rest of the chapter inside it. */
  unclosedFence: string | null;
}

function closingFence(lines: readonly string[], from: number, marker: string): number {
  const closing = new RegExp(`^ {0,3}${marker.charAt(0) === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);
  for (let index = from + 1; index < lines.length; index++) if (closing.test(lines[index] ?? '')) return index;
  return -1;
}

function tableCells(row: string): string[] {
  let text = row.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  return text.split(/(?<!\\)\|/);
}

function startsTable(lines: readonly string[], index: number): boolean {
  const header = lines[index] ?? '';
  const delimiter = lines[index + 1] ?? '';
  if (!header.includes('|') || !delimiter.includes('|')) return false;
  const delimiterCells = tableCells(delimiter);
  return delimiterCells.every(cell => DELIMITER_CELL.test(cell)) && delimiterCells.length === tableCells(header).length;
}

function tableEnd(lines: readonly string[], from: number): number {
  let last = from + 1;
  while (last + 1 < lines.length && lines[last + 1]?.trim() && !BLOCK_START.test(lines[last + 1] ?? '') && !TABLE_END.test(lines[last + 1] ?? '')) last++;
  return last;
}

export function splitChapterProse(markdown: string): ChapterProse {
  const lines = markdown.split(/\r\n|\r|\n/);
  const kept: string[] = [];
  let unclosedFence: string | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const fence = FENCE.exec(line);
    if (fence) {
      const close = closingFence(lines, index, fence[1] ?? '');
      if (close === -1) unclosedFence ??= line.trim();
      const last = close === -1 ? lines.length - 1 : close;
      if (SYSTEM_PANEL_INFO.test((fence[2] ?? '').trim())) kept.push('');
      else kept.push('', ...lines.slice(index + 1, close === -1 ? lines.length : close), '');
      index = last;
      continue;
    }
    if (startsTable(lines, index)) {
      kept.push('');
      index = tableEnd(lines, index);
      continue;
    }
    kept.push(line);
  }
  return { prose: kept.join('\n'), unclosedFence };
}

export function proseOnly(markdown: string): string {
  return splitChapterProse(markdown).prose;
}

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffHunk {
  op: DiffOp;
  text: string;
}

export interface ProseDiff {
  hunks: DiffHunk[];
  wordsAdded: number;
  wordsRemoved: number;
}

/** Bounds the LCS table (two bytes a cell); a change too large for it is shown as one removal and one insertion rather than risking the heap. */
const MAX_LCS_CELLS = 4_000_000;

const paragraphsOf = (text: string): string[] => text.match(/[^\n]*\n+|[^\n]+$/g) ?? [];
const tokensOf = (text: string): string[] => text.match(/\S+[^\S\n]*|\s+/g) ?? [];
const wordCount = (text: string): number => text.match(/\S+/g)?.length ?? 0;

function lcsHunks(before: readonly string[], after: readonly string[]): DiffHunk[] | null {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;

  const a = before.slice(prefix, before.length - suffix);
  const b = after.slice(prefix, after.length - suffix);
  const hunks: DiffHunk[] = before.slice(0, prefix).map(text => ({ op: 'equal', text }));
  if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) return null;

  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? (table[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      hunks.push({ op: 'equal', text: a[i++] as string });
      j++;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      hunks.push({ op: 'delete', text: a[i++] as string });
    } else {
      hunks.push({ op: 'insert', text: b[j++] as string });
    }
  }
  while (i < a.length) hunks.push({ op: 'delete', text: a[i++] as string });
  while (j < b.length) hunks.push({ op: 'insert', text: b[j++] as string });
  hunks.push(...before.slice(before.length - suffix).map(text => ({ op: 'equal' as const, text })));
  return hunks;
}

function replaced(before: string, after: string): DiffHunk[] {
  return [
    { op: 'delete', text: before },
    { op: 'insert', text: after },
  ];
}

function wordHunks(before: string, after: string): DiffHunk[] {
  return lcsHunks(tokensOf(before), tokensOf(after)) ?? replaced(before, after);
}

function merged(hunks: readonly DiffHunk[]): DiffHunk[] {
  const out: DiffHunk[] = [];
  for (const hunk of hunks) {
    if (hunk.text === '') continue;
    const last = out.at(-1);
    if (last?.op === hunk.op) last.text += hunk.text;
    else out.push({ ...hunk });
  }
  return out;
}

/** Paragraphs first, then words within each run of changed paragraphs, so an edited sentence reads as an edit rather than a rewritten chapter. */
export function diffProse(before: string, after: string): ProseDiff {
  const paragraphs = lcsHunks(paragraphsOf(before), paragraphsOf(after)) ?? replaced(before, after);
  const hunks: DiffHunk[] = [];
  let removed = '';
  let added = '';
  const flush = (): void => {
    hunks.push(...wordHunks(removed, added));
    removed = '';
    added = '';
  };
  for (const hunk of paragraphs) {
    if (hunk.op === 'delete') removed += hunk.text;
    else if (hunk.op === 'insert') added += hunk.text;
    else {
      flush();
      hunks.push(hunk);
    }
  }
  flush();

  const result = merged(hunks);
  return {
    hunks: result,
    wordsAdded: result.filter(hunk => hunk.op === 'insert').reduce((sum, hunk) => sum + wordCount(hunk.text), 0),
    wordsRemoved: result.filter(hunk => hunk.op === 'delete').reduce((sum, hunk) => sum + wordCount(hunk.text), 0),
  };
}

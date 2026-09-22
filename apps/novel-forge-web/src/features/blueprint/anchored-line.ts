/**
 * A line the author wrote about a particular wording — a why, a writer line. Each line carries its own anchor, so rewriting the
 * answer strands only the lines that were about the old wording, and writing one line back re-anchors that line alone. The writer
 * line rides every chapter pack, so a line left over from an answer the author discarded must never be locked.
 */
export interface AnchoredLine {
  text: string;
  anchor: string;
}

export const EMPTY_ANCHORED_LINE: AnchoredLine = { text: '', anchor: '' };

export interface AnchoredLineView {
  text: string;
  /** The answer has moved out from under the line: it is neither shown nor sent. */
  stale: boolean;
}

const same = (left: string, right: string): boolean => left.trim() === right.trim();

export function anchorLine(text: string, anchor: string): AnchoredLine {
  return { text, anchor };
}

export function readAnchoredLine(line: AnchoredLine, anchor: string): AnchoredLineView {
  const stale = !same(line.anchor, anchor) && line.text.trim().length > 0;
  return { text: stale ? '' : line.text, stale };
}

export const STALE_LINE_NOTE = 'You changed the answer, so this was written about one you are no longer locking. Say it again for this one.';

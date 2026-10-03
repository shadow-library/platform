/** The longest passage the server anchors a rewrite to. */
export const MAX_PASSAGE_CHARS = 6000;

/** A span of the draft body in UTF-16 code units, `end` exclusive — the units JavaScript string indices and the server both count in. */
export interface PassageRange {
  start: number;
  end: number;
}

export interface PassageSelection extends PassageRange {
  text: string;
}

export type SelectionRefusal = 'empty' | 'too-long' | 'unmapped' | 'cuts-markup' | 'line-endings';

export type SelectionResult = { kind: 'ok'; selection: PassageSelection } | { kind: SelectionRefusal };

/** Lowercase hex SHA-256 of the UTF-8 text, as the server checks the selection with. */
export async function passageHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Surrounding whitespace is dropped from a selection, so a drag that overshoots a paragraph still anchors on its words. */
export function selectionOf(body: string, from: number, to: number): SelectionResult {
  let start = Math.max(0, Math.min(from, to));
  let end = Math.min(body.length, Math.max(from, to));
  while (start < end && /\s/.test(body.charAt(start))) start++;
  while (end > start && /\s/.test(body.charAt(end - 1))) end--;
  if (start === end) return { kind: 'empty' };
  if (end - start > MAX_PASSAGE_CHARS) return { kind: 'too-long' };
  return { kind: 'ok', selection: { start, end, text: body.slice(start, end) } };
}

import { type ApiError, type DraftResponse, type PassageSuggestionResponse } from '@/lib/apis';
import { FINAL_RESTORE_REASON } from '@/lib/draft-versions';
import { proseSourceMap, sourceRangeOf } from '@/lib/prose-source-map';

/** The server refuses a longer selection with PSG_002. */
export const MAX_PASSAGE_CHARS = 6000;

export const QUICK_REQUESTS: readonly string[] = ['More tension', 'Shorter', 'More of their feeling', 'Fix the wording'];

/** A span of the draft body in UTF-16 code units, `end` exclusive — the units JavaScript string indices and the server both count in. */
export interface PassageRange {
  start: number;
  end: number;
}

export interface PassageSelection extends PassageRange {
  text: string;
}

export type SelectionRefusal = 'empty' | 'too-long' | 'unmapped' | 'cuts-markup' | 'line-endings' | 'unsaved';

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

const SELECTION_PROBLEMS: Record<SelectionRefusal, string | undefined> = {
  empty: undefined,
  'too-long': `Select at most ${MAX_PASSAGE_CHARS.toLocaleString()} characters to ask for changes.`,
  unmapped: 'The reader can’t place that selection in the chapter’s text — select it in Edit prose instead.',
  'cuts-markup': 'That selection cuts through a link, code, a list or other formatting — select all of it, or only words inside it.',
  'line-endings': 'This chapter’s line endings differ from what the editor shows — save it from Edit prose first, then ask again.',
  unsaved: 'Your edits aren’t saved yet — save them, then ask for changes.',
};

/** A selection made in one rendered piece of the reader, mapped back through the tokens that rendered it — never by searching for its text. */
export function renderedSelection(body: string, segment: Pick<ProseSegment, 'source' | 'from'>, domText: string, domStart: number, domEnd: number): SelectionResult {
  if (body.includes('\r')) return { kind: 'line-endings' };
  const map = proseSourceMap(segment.source, segment.from);
  if (!map) return { kind: 'unmapped' };
  const range = sourceRangeOf(body, map, domText, domStart, domEnd);
  return range.kind === 'ok' ? selectionOf(body, range.start, range.end) : range;
}

export function selectionProblem(result: { kind: SelectionRefusal }): string | undefined {
  return SELECTION_PROBLEMS[result.kind];
}

/**
 * A textarea hands back its value with line endings normalised, so offsets taken from it only match the saved body when the two are identical;
 * otherwise the ask is refused before anything is anchored.
 */
export function editorSelection(body: string, editorValue: string, from: number, to: number): SelectionResult {
  if (editorValue !== body) return { kind: body.includes('\r') ? 'line-endings' : 'unsaved' };
  return selectionOf(body, from, to);
}

export type SuggestionState = 'fresh' | 'relocated' | 'stale' | 'locked';

export interface SuggestionView {
  state: SuggestionState;
  canApply: boolean;
  /** Why Use this is withheld, shown beside the disabled button. */
  reason?: string;
  /** A note on where the change lands, shown when it is not where it was asked. */
  label?: string;
  /** What using it does to the chapter's approval or review. */
  warnings: string[];
  /** Where in the body the card sits: the passage's end as it stands now, or none when it can no longer be found. */
  anchorEnd?: number;
}

type SuggestionDraft = Pick<DraftResponse, 'status' | 'reviewStatus' | 'approvedRevision'>;

/** The server re-locates each open suggestion against the draft as it stands (P4-45): only a fresh or cleanly moved passage can be used. */
export function suggestionView(suggestion: Pick<PassageSuggestionResponse, 'baseRevision' | 'leakLines' | 'location'>, draft: SuggestionDraft, generating = false): SuggestionView {
  const { freshness, end } = suggestion.location;
  const warnings: string[] = [];
  if (suggestion.leakLines.length > 0) warnings.push('It may give away a locked secret — using it holds the chapter as a conflict until you resolve it.');
  if (draft.approvedRevision !== null && draft.status !== 'final') warnings.push('Using it changes an approved chapter — you’ll approve again afterwards.');
  const anchorEnd = end ?? undefined;
  if (draft.status === 'final') {
    return { state: 'locked', canApply: false, reason: 'This chapter is final — its text is locked. Change it through Amend.', warnings: [], anchorEnd };
  }
  if (freshness === 'stale') {
    const reason = `The text changed since this rewrite was suggested (it was for version ${suggestion.baseRevision}) — try again on the current text.`;
    return { state: 'stale', canApply: false, reason, warnings: [], anchorEnd };
  }
  if (generating || draft.reviewStatus === 'generating')
    return { state: freshness, canApply: false, reason: 'The chapter is being written — use it once that’s done.', warnings, anchorEnd };
  const label = freshness === 'relocated' ? 'The passage moved since — it changes where it stands now.' : undefined;
  return { state: freshness, canApply: true, label, warnings, anchorEnd };
}

export interface ProseSegment {
  /** Markdown source, split only on paragraph breaks so each piece renders as it would whole. */
  source: string;
  /** Where the piece starts in the body. */
  from: number;
  after: string[];
}

export interface ProseAnchor {
  key: string;
  /** Offset in the body; the card goes after the paragraph that holds it. Undefined places it before the prose. */
  at?: number;
}

export function splitAtAnchors(body: string, anchors: readonly ProseAnchor[]): { before: string[]; segments: ProseSegment[] } {
  const before = anchors.filter(anchor => anchor.at === undefined).map(anchor => anchor.key);
  const cuts = new Map<number, string[]>();
  for (const anchor of anchors) {
    if (anchor.at === undefined) continue;
    const at = Math.min(Math.max(anchor.at, 0), body.length);
    const breakAt = body.slice(at).search(/\n\s*\n/);
    const cut = breakAt === -1 ? body.length : at + breakAt;
    cuts.set(cut, [...(cuts.get(cut) ?? []), anchor.key]);
  }
  const segments: ProseSegment[] = [];
  let from = 0;
  for (const cut of [...cuts.keys()].sort((a, b) => a - b)) {
    segments.push({ source: body.slice(from, cut), from, after: cuts.get(cut) ?? [] });
    from = cut;
  }
  if (from < body.length || segments.length === 0) segments.push({ source: body.slice(from), from, after: [] });
  return { before, segments };
}

export const SELECTION_CHANGED_MESSAGE = 'The selected text no longer matches the chapter — select the passage again.';

const WRITE_REFUSALS: Record<string, string> = {
  PSG_001: 'That suggestion is gone — it may have been used or dismissed elsewhere.',
  PSG_002: `Select between 1 and ${MAX_PASSAGE_CHARS.toLocaleString()} characters inside the chapter to ask for changes.`,
  PSG_003: SELECTION_CHANGED_MESSAGE,
  PSG_004: 'This suggestion is stale — the passage moved or changed since it was made. Ask again on the current text.',
  PSG_005: 'That suggestion was already used or dismissed.',
  PSG_006: 'This chapter is final — its text is locked. Change it through Amend.',
  DRF_013: 'The chapter changed while you were working — the newest text is on screen now. Check it, then try again.',
  DRF_019: 'The chapter is being written — try again once that’s done.',
  VER_001: 'That version is no longer kept — pick another one.',
  VER_002: FINAL_RESTORE_REASON,
};

export function writeRefusalMessage(error: ApiError): string {
  return WRITE_REFUSALS[error.code] ?? error.message;
}

export function appliedMessage(applied: Pick<DraftResponse, 'revision' | 'reviewStatus'>): { tone: 'success' | 'warning'; text: string } {
  if (applied.reviewStatus === 'contradiction') {
    return { tone: 'warning', text: `Saved as version ${applied.revision} — it may give away a locked secret, so the chapter is held as a conflict. Check it in Review.` };
  }
  return { tone: 'success', text: `Passage rewritten — saved as version ${applied.revision}` };
}

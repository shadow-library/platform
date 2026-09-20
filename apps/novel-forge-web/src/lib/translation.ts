import {
  type ChapterTranslationStatus,
  type TranslationChapterSummaryResponse,
  type TranslationGlossaryCategory,
  type TranslationPhase,
  type TranslationTreatment,
} from '@/lib/apis';

// Mirrors `ChipIntent` from `@/components/nf` without importing the component barrel into a pure module.
type ChipIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export type ChapterRowState = ChapterTranslationStatus | 'in_progress' | 'untranslated';

export const CHAPTER_STATE_LABEL: Record<ChapterRowState, string> = {
  finalized: 'Finalized',
  translated: 'Translated',
  attention: 'Needs review',
  failed: 'Failed',
  in_progress: 'In progress',
  untranslated: 'Untranslated',
};

export const CHAPTER_STATE_INTENT: Record<ChapterRowState, ChipIntent> = {
  finalized: 'success',
  translated: 'info',
  attention: 'warning',
  failed: 'danger',
  in_progress: 'accent',
  untranslated: 'neutral',
};

export const TRANSLATION_PHASE_LABEL: Record<TranslationPhase, string> = {
  pending: 'Not started',
  seeding: 'Seeding glossary',
  review: 'Paused for term review',
  translating: 'Translating',
  done: 'Done',
  failed: 'Failed',
};

export const TREATMENT_LABEL: Record<TranslationTreatment, string> = {
  translate: 'Translate',
  localize: 'Localize',
  transliterate: 'Transliterate',
  preserve: 'Keep as is',
};

export const TREATMENT_INTENT: Record<TranslationTreatment, ChipIntent> = {
  translate: 'success',
  localize: 'info',
  transliterate: 'neutral',
  preserve: 'warning',
};

export const GLOSSARY_CATEGORIES: TranslationGlossaryCategory[] = ['character', 'place', 'organization', 'profession', 'title', 'rank', 'ability', 'item', 'creature', 'term'];

export const TREATMENTS: TranslationTreatment[] = ['translate', 'localize', 'transliterate', 'preserve'];

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The running chapter wins over the persisted status: the job is mid-flight and the row's stored state is the previous run's. */
export function chapterRowState(summary: Pick<TranslationChapterSummaryResponse, 'status'>, running = false): ChapterRowState {
  if (running) return 'in_progress';
  return summary.status ?? 'untranslated';
}

export function chapterAttentionNote(summary: Pick<TranslationChapterSummaryResponse, 'pendingTerms' | 'issueCount'>): string | null {
  const parts: string[] = [];
  if (summary.pendingTerms > 0) parts.push(`${count(summary.pendingTerms, 'term')} pending`);
  if (summary.issueCount > 0) parts.push(count(summary.issueCount, 'issue'));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function chapterStaleNote(summary: Pick<TranslationChapterSummaryResponse, 'glossaryStale' | 'sourceStale'>): string | null {
  if (summary.glossaryStale && summary.sourceStale) return 'glossary and original changed';
  if (summary.glossaryStale) return 'glossary changed';
  if (summary.sourceStale) return 'original changed';
  return null;
}

export interface FinalizeContext {
  status?: ChapterTranslationStatus | null;
  glossaryStale: boolean;
  sourceStale: boolean;
  pendingTerms: number;
  /** Named in the chapter reader, which loads the applied terms; the chapter list carries only the count. */
  pendingTermNames?: string[];
}

/** Every reason finalize would be refused, in the order the server checks them, phrased for a tooltip. Empty means the gate is open. */
export function finalizeBlockers({ status, glossaryStale, sourceStale, pendingTerms, pendingTermNames }: FinalizeContext): string[] {
  const reasons: string[] = [];
  if (!status) reasons.push('This chapter has no translation yet.');
  else if (status === 'finalized') reasons.push('Already finalized — reopen it to change the English text.');
  else if (status === 'failed') reasons.push('The last run failed — re-run the chapter before finalizing.');
  if (pendingTerms > 0) {
    const named = pendingTermNames?.length ? ` (${pendingTermNames.join(', ')})` : '';
    reasons.push(`Approve or reject ${count(pendingTerms, 'pending term')} first${named}`);
  }
  if (glossaryStale) reasons.push('The glossary changed since this translation — re-run the chapter.');
  if (sourceStale) reasons.push('The original changed since this translation — re-run the chapter.');
  return reasons;
}

export function finalizeTooltip(reasons: string[]): string {
  return reasons.length === 0 ? 'Write this English text into the novel and lock the chapter' : reasons.join(' ');
}

/** The header's primary action follows the phase: nothing run yet, paused after the seed with terms waiting, or more chapters left. */
export function startActionLabel(phase: TranslationPhase, suggestedTerms: number): string {
  if (phase === 'pending') return 'Start translation';
  if (phase === 'review' && suggestedTerms > 0) return 'Continue translating';
  return 'Translate remaining';
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export interface ParagraphPair {
  original?: string;
  english?: string;
}

/** Index-aligned pairs for the side-by-side reader; an uneven split leaves the shorter column blank rather than shifting every later row. */
export function alignParagraphs(original: string, english: string): ParagraphPair[] {
  const left = splitParagraphs(original);
  const right = splitParagraphs(english);
  const rows: ParagraphPair[] = [];
  for (let index = 0; index < Math.max(left.length, right.length); index++) rows.push({ original: left[index], english: right[index] });
  return rows;
}

export function pasteStatsLabel(text: string): string {
  return `${count(splitParagraphs(text).length, 'paragraph')} · ${count(text.length, 'character')}`;
}

export interface ChapterStep {
  chapter: number;
  page: number;
}

export interface ChapterWalk {
  chapter: number;
  page: number;
  pageSize: number;
  total: number;
  /** True when the directory is narrowed by status, which breaks the contiguity the page-crossing step relies on. */
  filtered: boolean;
  /** Chapter numbers on the page the reader was opened from, in directory order. */
  chapters: readonly number[];
}

/**
 * Off the end of the page the neighbour is on the next one, and unfiltered originals are contiguous
 * (the ingest door refuses a gap), so chapter ± 1 names it without fetching that page first. A filtered
 * list has no such guarantee, so stepping stops at the page edge there.
 */
export function chapterNeighbour(walk: ChapterWalk, delta: 1 | -1): ChapterStep | null {
  const index = walk.chapters.indexOf(walk.chapter);
  const neighbour = index >= 0 ? walk.chapters[index + delta] : undefined;
  if (neighbour !== undefined) return { chapter: neighbour, page: walk.page };
  if (walk.filtered) return null;
  if (delta === -1) return walk.page > 1 ? { chapter: walk.chapter - 1, page: walk.page - 1 } : null;
  return walk.page * walk.pageSize < walk.total ? { chapter: walk.chapter + 1, page: walk.page + 1 } : null;
}

/** Counts across the whole paginated collection, not the loaded page — "12 of 480" rather than "12 of 25". */
export function chapterPosition(walk: Pick<ChapterWalk, 'chapter' | 'page' | 'pageSize' | 'total' | 'chapters'>): string | null {
  const index = walk.chapters.indexOf(walk.chapter);
  if (index < 0 || walk.total === 0) return null;
  return `${(walk.page - 1) * walk.pageSize + index + 1} of ${walk.total}`;
}

export type QueueHotkey = 'next' | 'previous' | 'approve' | 'reject';

const QUEUE_HOTKEYS: Record<string, QueueHotkey> = { j: 'next', k: 'previous', a: 'approve', r: 'reject' };

export interface QueueHotkeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** The event landed in a field, a Radix listbox or an open dialog, where a bare letter is typing. */
  editableTarget: boolean;
}

export function queueHotkey(event: QueueHotkeyEvent): QueueHotkey | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.editableTarget) return null;
  return QUEUE_HOTKEYS[event.key.toLowerCase()] ?? null;
}

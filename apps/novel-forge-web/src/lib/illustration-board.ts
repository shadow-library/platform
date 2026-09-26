import { type IllustrationOrigin, type IllustrationSubjectType, type ListChapterRowsQueryParams } from '@/lib/apis';

export type SubjectFilter = IllustrationSubjectType | 'all';

/** The whole-novel `frontier` figure comes back regardless of the page shown, so a single row is enough to read it. */
export const FRONTIER_ROWS: ListChapterRowsQueryParams = { filter: 'all', limit: 1, offset: 0 };

export interface BoardIllustration {
  id: string;
  subjectType: IllustrationSubjectType;
  subjectKey?: string | null;
  origin: IllustrationOrigin;
  revision: number;
  selectedUrl?: string | null;
  candidates: { imageUrl: string }[];
}

export type CandidateSlot<T> = { kind: 'candidate'; candidate: T } | { kind: 'rendering' } | { kind: 'empty' };

export const CANDIDATE_PAIR = 2;

const SUBJECT_TYPES: IllustrationSubjectType[] = ['entity', 'chapter', 'cover'];

export const SUBJECT_LABEL: Record<IllustrationSubjectType, string> = { entity: 'Entity', chapter: 'Chapter', cover: 'Cover' };

export const FILTER_LABEL: Record<SubjectFilter, string> = { all: 'All', entity: 'Entities', chapter: 'Chapters', cover: 'Cover' };

export function parseSubjectType(value: unknown): IllustrationSubjectType | undefined {
  return SUBJECT_TYPES.find(type => type === value);
}

export function subjectLabel(illustration: Pick<BoardIllustration, 'subjectType' | 'subjectKey' | 'origin'>): string {
  if (illustration.origin === 'uploaded') return 'Uploaded cover';
  if (illustration.subjectType === 'cover') return 'Project cover';
  if (illustration.subjectType === 'chapter') return `Chapter ${illustration.subjectKey}`;
  return illustration.subjectKey ?? 'Entity';
}

export function thumbnailOf(illustration: Pick<BoardIllustration, 'selectedUrl' | 'candidates'>): string | undefined {
  return illustration.selectedUrl ?? illustration.candidates.at(-1)?.imageUrl ?? undefined;
}

export function illustrationCaption(illustration: Pick<BoardIllustration, 'subjectType' | 'revision'>): string {
  return `${SUBJECT_LABEL[illustration.subjectType]} · rev ${illustration.revision}`;
}

export function identityMeta(illustration: Pick<BoardIllustration, 'subjectType' | 'revision'>, updatedAgo: string): string {
  return `${SUBJECT_LABEL[illustration.subjectType]} · revision ${illustration.revision} · ${updatedAgo}`;
}

export function filterIllustrations<T extends Pick<BoardIllustration, 'subjectType' | 'subjectKey'>>(items: readonly T[], filter: SubjectFilter, key?: string): T[] {
  return items.filter(item => (filter === 'all' || item.subjectType === filter) && (!key || item.subjectKey === key));
}

export function countBySubject(items: readonly Pick<BoardIllustration, 'subjectType'>[]): Record<IllustrationSubjectType, number> {
  const counts: Record<IllustrationSubjectType, number> = { entity: 0, chapter: 0, cover: 0 };
  for (const item of items) counts[item.subjectType] += 1;
  return counts;
}

/** A round always returns a pair, so a lone candidate keeps its partner's slot drawn rather than reflowing the grid when the next round lands. */
export function candidateSlots<T>(candidates: readonly T[], rendering: boolean): CandidateSlot<T>[] {
  const slots: CandidateSlot<T>[] = candidates.map(candidate => ({ kind: 'candidate', candidate }));
  while (slots.length < CANDIDATE_PAIR) slots.push(rendering ? { kind: 'rendering' } : { kind: 'empty' });
  if (rendering && !slots.some(slot => slot.kind === 'rendering')) slots.push({ kind: 'rendering' });
  return slots;
}

export interface DepictsChapterOption {
  value: number;
  label: string;
}

/** Newest first, bounded to the latest final chapter (the frontier) — a later chapter is refused with ILL_016 for generation. Chapter 0 is "before the story". */
export function depictsChapterOptions(frontier: number): DepictsChapterOption[] {
  const options: DepictsChapterOption[] = [];
  for (let chapter = frontier; chapter >= 0; chapter--) options.push({ value: chapter, label: depictsChapterLabel(chapter, frontier) });
  return options;
}

export function depictsChapterLabel(chapter: number, frontier: number): string {
  if (chapter === 0) return 'Before the story';
  return chapter === frontier ? `Chapter ${chapter} · latest final` : `Chapter ${chapter}`;
}

/**
 * The wiki rule: an image is shown to readers from its depicted chapter onward. A chapter past the
 * frontier is a future point an upload or re-date may take (allowed there, refused with ILL_016 for
 * generation) and stays hidden until it publishes. A null chapter is a legacy image from before dating,
 * which keeps its old (always-visible) behaviour.
 */
export function depictsChapterVisibilityNote(chapter: number | null, frontier: number): string {
  if (chapter === null) return 'Shown to all readers (dated before this change).';
  if (chapter > frontier) return `Hidden from readers until chapter ${chapter} is finalized and published.`;
  if (chapter === 0) return 'Readers see this from the very start.';
  return `Readers see this from chapter ${chapter} on.`;
}

/** A future-chapter draft is valid only as a whole number strictly past the frontier — no silent rounding or clamping. */
export function parseFutureChapter(draft: string, frontier: number): number | undefined {
  const trimmed = draft.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > frontier ? value : undefined;
}

export function futureChapterError(draft: string, frontier: number): string | undefined {
  return parseFutureChapter(draft, frontier) === undefined ? `Enter a whole chapter number after ${frontier}` : undefined;
}

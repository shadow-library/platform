import {
  type IllustrationOrigin,
  type IllustrationRunRequestResponse,
  type IllustrationStatus,
  type IllustrationSubjectType,
  type ListChapterRowsQueryParams,
  type StartIllustrationBody,
} from '@/lib/apis';

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

export function subjectLabel(illustration: Pick<BoardIllustration, 'subjectType' | 'subjectKey' | 'origin'>, entityNames?: ReadonlyMap<string, string>): string {
  if (illustration.origin === 'uploaded') return 'Uploaded cover';
  if (illustration.subjectType === 'cover') return 'Project cover';
  if (illustration.subjectType === 'chapter') return `Chapter ${illustration.subjectKey}`;
  if (!illustration.subjectKey) return 'Entity';
  return entityNames?.get(illustration.subjectKey) ?? illustration.subjectKey;
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
export function candidateSlots<T>(candidates: readonly T[], rendering: boolean, holdPartner = true): CandidateSlot<T>[] {
  const slots: CandidateSlot<T>[] = candidates.map(candidate => ({ kind: 'candidate', candidate }));
  while (holdPartner && slots.length < CANDIDATE_PAIR) slots.push(rendering ? { kind: 'rendering' } : { kind: 'empty' });
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

export interface BoardRun {
  id: string;
  target: string;
  status: string;
  startedAt: string;
}

export interface RunSubject {
  subjectType: IllustrationSubjectType;
  subjectKey: string | null;
  origin: IllustrationOrigin;
}

export type RunStage = 'composing' | 'rendering';

// Nothing settles the run of a replica that died mid-render, so it would spin forever; well past any real render it reads as failed, which still offers a retry.
const RUN_STALE_MS = 15 * 60_000;

/** Mirrors what the server records as a started illustration's target; a refine run's `refine:<id>` matches no subject. */
export function runTarget(subjectType: IllustrationSubjectType, subjectKey?: string | null): string {
  return `${subjectType}:${subjectKey ?? 'cover'}`;
}

export function parseRunTarget(target: string): RunSubject | undefined {
  const separator = target.indexOf(':');
  const subjectType = parseSubjectType(target.slice(0, separator));
  if (!subjectType) return undefined;
  return { subjectType, subjectKey: subjectType === 'cover' ? null : target.slice(separator + 1), origin: 'generated' };
}

/** `runs` come newest first, so a failure is dropped once anything newer has been tried for its subject. */
export function splitBoardRuns<T extends BoardRun>(runs: readonly T[], starting: ReadonlySet<string>, dismissed: ReadonlySet<string>, now: number): { running: T[]; failed: T[] } {
  const running: T[] = [];
  const failed: T[] = [];
  const tried = new Set(starting);
  for (const run of runs) {
    if (!parseRunTarget(run.target)) continue;
    const stale = run.status === 'running' && now - Date.parse(run.startedAt) > RUN_STALE_MS;
    if (run.status === 'running' && !stale) running.push(run);
    else if ((run.status === 'failed' || stale) && !tried.has(run.target) && !dismissed.has(run.id)) failed.push(run);
    tried.add(run.target);
  }
  return { running, failed };
}

/** A start the server has not recorded a run for yet: the request is out, but there is nothing to stop or open. */
export function unclaimedStarts<T extends { target: string }>(starts: readonly T[], running: readonly BoardRun[]): T[] {
  return starts.filter(start => !running.some(run => run.target === start.target));
}

export function runStageOf(calls: readonly { node?: string | null; status: string }[] | undefined): RunStage {
  return calls?.some(call => call.node === 'compose' && call.status === 'ok') ? 'rendering' : 'composing';
}

export function runStageLabel(stage: RunStage): string {
  return stage === 'composing' ? 'Composing the prompt' : 'Rendering 2 candidates';
}

export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function startBodyOf(request: IllustrationRunRequestResponse): StartIllustrationBody {
  const cover = request.subjectType === 'cover';
  return {
    subjectType: request.subjectType,
    subjectKey: cover ? undefined : (request.subjectKey ?? undefined),
    instruction: request.instructions[0],
    references: request.references.length > 0 ? request.references : undefined,
    autoReferences: cover ? undefined : request.autoReferences,
    depictsChapter: request.subjectType === 'entity' ? (request.depictsChapter ?? undefined) : undefined,
  };
}

export function newestIllustrationFor<T extends { subjectType: IllustrationSubjectType; subjectKey?: string | null; createdAt: string }>(
  items: readonly T[],
  run: Pick<BoardRun, 'target' | 'startedAt'>,
): T | undefined {
  const started = Date.parse(run.startedAt);
  return items.find(item => runTarget(item.subjectType, item.subjectKey) === run.target && Date.parse(item.createdAt) >= started);
}

type ChoosableIllustration = Pick<BoardIllustration, 'origin'> & { status: IllustrationStatus; selectedRef?: string | null };

/** `active` covers both "needs a choice" and "choice made, not saved", which only the selection tells apart. */
export function illustrationChipLabel(illustration: ChoosableIllustration): string {
  if (illustration.status !== 'active' || illustration.origin === 'uploaded') return illustration.status;
  return illustration.selectedRef ? 'picked' : 'pick one';
}

/** The newest round, for a tile whose choice is still open. */
export function pendingPair<T>(illustration: ChoosableIllustration & { candidates: readonly T[] }): readonly [T, T] | undefined {
  if (illustrationChipLabel(illustration) !== 'pick one') return undefined;
  const [first, second] = illustration.candidates.slice(-2);
  return first !== undefined && second !== undefined ? [first, second] : undefined;
}

/** Saving deletes every other candidate from storage, so only the kept one still has an image to show. */
export function shownCandidates<T extends { ref: string }>(illustration: { status: IllustrationStatus; selectedRef?: string | null; candidates: readonly T[] }): readonly T[] {
  if (illustration.status !== 'saved') return illustration.candidates;
  return illustration.candidates.filter(candidate => candidate.ref === illustration.selectedRef);
}

export function pickHint(illustration: { status: IllustrationStatus; selectedRef?: string | null }): string | undefined {
  if (illustration.status !== 'active') return undefined;
  if (!illustration.selectedRef) return 'Click the image you want to keep. Saving unlocks once you have picked one.';
  return 'Saving keeps this image and deletes the others. Click another image to change your mind.';
}

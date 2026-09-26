export const PROGRESS_TOPIC_PREFIX = 'progress.';

export function progressKeyFromTopic(topic: string): string | null {
  return topic.startsWith(PROGRESS_TOPIC_PREFIX) ? topic.slice(PROGRESS_TOPIC_PREFIX.length) : null;
}

export type ProgressOverrideKind = 'undecided' | 'dismissed';
export type ProgressStatus = 'open' | 'answered' | ProgressOverrideKind;

export interface ProgressOverride {
  status: ProgressOverrideKind;
  entryId: bigint;
}

export interface ProgressOverrideEntry {
  id: bigint;
  kind: string;
  topic: string;
  payload: unknown;
}

function isOverrideKind(status: unknown): status is ProgressOverrideKind {
  return status === 'undecided' || status === 'dismissed';
}

/**
 * A checklist override is only ever written by the server itself (kind `system`, topic `progress.<key>`, `payload.status`);
 * anything else at that topic — a forged `direction`, a missing or malformed payload — is not one, and never overrides an answer.
 */
export function progressOverridesFrom(entries: readonly ProgressOverrideEntry[]): Map<string, ProgressOverride> {
  const overrides = new Map<string, ProgressOverride>();
  for (const entry of entries) {
    if (entry.kind !== 'system') continue;
    const key = progressKeyFromTopic(entry.topic);
    const status = (entry.payload as { status?: unknown } | null)?.status;
    if (key && isOverrideKind(status)) overrides.set(key, { status, entryId: entry.id });
  }
  return overrides;
}

export interface ProgressFields {
  premise: string | null | undefined;
  protagonistKey: string | null | undefined;
  opposition: string | null | undefined;
  theme: string | null | undefined;
  readerPromise: string | null | undefined;
  endingQuestion: string | null | undefined;
  ending: string | null | undefined;
  firstVolumeGoal: string | null | undefined;
  nextChapterPlanned: boolean;
  chapterOneWritten: boolean;
}

export interface ProgressItem {
  key: string;
  label: string;
  why: string;
  status: ProgressStatus;
  overrideEntryId?: bigint;
}

interface ProgressCheck {
  key: string;
  label: string;
  why: string;
  hasAnswer: (fields: ProgressFields) => boolean;
  /** Omitted means always; `next_chapter_planned` stops applying once chapter 1 is written, so it does not nag at every later chapter. */
  appliesWhile?: (fields: ProgressFields) => boolean;
}

const filled = (value: string | null | undefined): boolean => Boolean(value && value.trim().length > 0);

const PROGRESS_CHECKS: readonly ProgressCheck[] = [
  { key: 'premise', label: 'Premise', why: 'The one- or two-line idea the chat and every later decision build on.', hasAnswer: f => filled(f.premise) },
  { key: 'protagonist', label: 'Protagonist', why: 'Who the reader follows; scenes and knowledge are written from their point of view.', hasAnswer: f => filled(f.protagonistKey) },
  { key: 'opposition', label: 'Opposition', why: 'What or who pushes back, so chapters have something to write against.', hasAnswer: f => filled(f.opposition) },
  { key: 'theme', label: 'Theme', why: 'What the book is about underneath the plot.', hasAnswer: f => filled(f.theme) },
  { key: 'reader_promise', label: 'Reader promise', why: 'What the reader is waiting for and expects to be paid off.', hasAnswer: f => filled(f.readerPromise) },
  {
    key: 'ending',
    label: 'Ending',
    why: 'How the book ends. Planner-only — never shown to the reader early — and fine to leave undecided for now.',
    hasAnswer: f => filled(f.endingQuestion) || filled(f.ending),
  },
  { key: 'first_volume_goal', label: 'First volume goal', why: 'What changes by the end of volume one.', hasAnswer: f => filled(f.firstVolumeGoal) },
  {
    key: 'next_chapter_planned',
    label: 'Next chapter planned',
    why: 'A short plan for the next chapter, agreed with the chat before it is written.',
    hasAnswer: f => f.nextChapterPlanned,
    appliesWhile: f => !f.chapterOneWritten,
  },
];

export const PROGRESS_ITEM_KEYS: readonly string[] = PROGRESS_CHECKS.map(check => check.key);

/**
 * Advice only: never gates planning or writing. An override (the author marked a key undecided, or dismissed
 * it from the checklist) wins over the underlying field and persists until explicitly cleared.
 */
export function computeProgress(fields: ProgressFields, overrides: ReadonlyMap<string, ProgressOverride>): ProgressItem[] {
  return PROGRESS_CHECKS.filter(check => check.appliesWhile?.(fields) ?? true).map((check): ProgressItem => {
    const override = overrides.get(check.key);
    if (override) return { key: check.key, label: check.label, why: check.why, status: override.status, overrideEntryId: override.entryId };
    return { key: check.key, label: check.label, why: check.why, status: check.hasAnswer(fields) ? 'answered' : 'open' };
  });
}

export interface ProgressProjectFields {
  premise: string | null | undefined;
  protagonistKey: string | null | undefined;
  opposition: string | null | undefined;
  theme: string | null | undefined;
  readerPromise: string | null | undefined;
  endingQuestion: string | null | undefined;
  ending: string | null | undefined;
}

export interface ProgressNextChapter {
  chapter: number;
  brief?: { staleReason: string | null | undefined };
}

/** The one place that turns the project row, the volume list and the next-chapter brief into `ProgressFields`, shared by the progress endpoint and `forNovelChat`. */
export function progressFieldsFrom(project: ProgressProjectFields, volumes: readonly { objective: string | null | undefined }[], next: ProgressNextChapter): ProgressFields {
  return {
    premise: project.premise,
    protagonistKey: project.protagonistKey,
    opposition: project.opposition,
    theme: project.theme,
    readerPromise: project.readerPromise,
    endingQuestion: project.endingQuestion,
    ending: project.ending,
    firstVolumeGoal: volumes[0]?.objective,
    nextChapterPlanned: Boolean(next.brief && !next.brief.staleReason),
    chapterOneWritten: next.chapter > 1,
  };
}

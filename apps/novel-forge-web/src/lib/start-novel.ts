import { type CreateNovelWithNotesResponse, isApiError } from '@/lib/apis';

export const NOTES_MAX_WORDS = 10_000;
export const NOTES_MAX_CHARS = 100_000;
export const TITLE_MAX_CHARS = 255;
export const UNTITLED_NOVEL = 'Untitled novel';

export const NOTES_OPENER =
  'Here are my notes for the story. Organise them into my Story Bible as the world stands when the story opens, and keep anything that happens later as my plans.';
export const BLANK_OPENER = 'I’m starting a new novel. Help me design it — ask me one question at a time.';

export const NOTES_OVER_WORDS = `That’s over the ${NOTES_MAX_WORDS.toLocaleString('en')}-word limit. Trim your notes; you can add the rest in the chat.`;
export const NOTES_OVER_CHARS = `Your notes are over ${NOTES_MAX_CHARS.toLocaleString('en')} characters. Trim them; you can add the rest in the chat.`;

export interface StartErrors {
  title?: string;
  notes?: string;
  form?: string;
}

const formatNumber = (value: number): string => value.toLocaleString('en');

/** Mirrors the server's `countWords` (eval/deterministic-metrics) exactly, so the live limit and PRJ_012 never disagree. */
export function countNoteWords(notes: string): number {
  const trimmed = notes.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function notesWordLabel(words: number): string {
  if (words === 0) return `Up to ${formatNumber(NOTES_MAX_WORDS)} words`;
  const count = `${formatNumber(words)} ${words === 1 ? 'word' : 'words'}`;
  if (words > NOTES_MAX_WORDS) return `${count} · ${formatNumber(words - NOTES_MAX_WORDS)} over`;
  return `${count} · ${formatNumber(NOTES_MAX_WORDS - words)} left`;
}

export function titleError(title: string): string | undefined {
  return title.trim().length > TITLE_MAX_CHARS ? `Keep the title to ${TITLE_MAX_CHARS} characters` : undefined;
}

/** The server caps the stored notes at 100,000 characters as well as 10,000 words; the web sends them trimmed. */
export function notesCharError(notes: string): string | undefined {
  return notes.trim().length > NOTES_MAX_CHARS ? NOTES_OVER_CHARS : undefined;
}

export function isStartBlocked(title: string, notes: string, words: number): boolean {
  return Boolean(titleError(title) || notesCharError(notes)) || words > NOTES_MAX_WORDS;
}

/** The title is optional for the author but not for the server (1–255 characters), so a blank one is sent as the placeholder. */
export function titleToSubmit(title: string): string {
  return title.trim() || UNTITLED_NOVEL;
}

/** The server re-validates everything; each rejection lands on the field the author can fix, or on the form when no field can. */
export function startErrorsFrom(error: unknown): StartErrors {
  if (!isApiError(error)) return { form: 'Check your connection and try again.' };
  if (error.code === 'PRJ_014') return { title: `Give your novel a working title, or leave it blank for “${UNTITLED_NOVEL}”` };
  if (error.code === 'PRJ_012') return { notes: NOTES_OVER_WORDS };
  const mapped: StartErrors = {};
  for (const { field, msg } of error.fields ?? []) {
    if (/title$/i.test(field)) mapped.title = msg;
    else if (/notes$/i.test(field)) mapped.notes = msg;
  }
  return mapped.title || mapped.notes ? mapped : { form: error.message };
}

export function firstTurnFor(notes: string): string {
  return notes.trim() ? NOTES_OPENER : BLANK_OPENER;
}

export interface SubmitKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** Enter alone is a newline in the notes; ⌘/Ctrl+Enter submits, never mid-IME-composition (Safari reports that only as keyCode 229). */
export function isSubmitShortcut(event: SubmitKey): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey);
}

export interface StartNovelTarget {
  to: '/novels/$novelId/chat';
  params: { novelId: string };
  search: { session: string };
}

export function startNovelTarget(created: CreateNovelWithNotesResponse): StartNovelTarget {
  return { to: '/novels/$novelId/chat', params: { novelId: created.projectId }, search: { session: created.sessionId } };
}

export interface StartCompletionSteps {
  queue: (sessionId: string, content: string) => void;
  close: () => void;
  navigate: (target: StartNovelTarget) => void;
}

/** The opener is queued before the chat route can mount, and the dialog closes before navigating so it never renders over the chat. */
export function completeStart(created: CreateNovelWithNotesResponse, notes: string, steps: StartCompletionSteps): void {
  steps.queue(created.sessionId, firstTurnFor(notes));
  steps.close();
  steps.navigate(startNovelTarget(created));
}

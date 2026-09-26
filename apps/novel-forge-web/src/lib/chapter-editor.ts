import { DraftSaveConflict, isApiError } from '@/lib/apis';

export const AUTOSAVE_DELAY_MS = 3000;

export interface EditorText {
  title: string;
  body: string;
}

/** The exact server state a save is made against: the server refuses it unless all three still match. */
export interface DraftBase {
  draftId: string;
  revision: number;
  saveSeq: number;
}

export interface EditorVersion extends EditorText, DraftBase {}

export interface ServerDraft {
  id: string;
  revision: number;
  saveSeq: number;
  status: 'draft' | 'final';
  title?: string | null;
  body?: string | null;
}

export type EditorStatus = 'idle' | 'saving' | 'conflict' | 'locked' | 'deleted' | 'held' | 'failed';

export interface EditorState extends EditorText {
  /** The server version the text on screen was last reconciled with; the next save is made against exactly this one. */
  base: EditorVersion;
  status: EditorStatus;
  /** The newer server version found under a conflict or a lock. */
  theirs?: EditorVersion;
  error?: string;
}

export type EditorAction =
  | { type: 'edit'; title?: string; body?: string }
  | { type: 'save-started' }
  | { type: 'saved'; saved: EditorVersion }
  | { type: 'save-refused'; refusal: SaveRefusal }
  | { type: 'server'; draft: ServerDraft }
  | { type: 'deleted' }
  | { type: 'keep-mine' }
  | { type: 'take-theirs' }
  | { type: 'restore'; text: EditorText }
  | { type: 'retry' };

/** Why the server would not take a save, sorted into what the editor does about it. */
export type SaveRefusal =
  | { kind: 'conflict'; current: ServerDraft }
  | { kind: 'deleted' }
  | { kind: 'ambiguous' }
  | { kind: 'locked' }
  | { kind: 'held'; message: string }
  | { kind: 'failed'; message: string };

const BLOCKED: readonly EditorStatus[] = ['conflict', 'locked', 'deleted', 'held'];

export function wordCount(body?: string | null): number {
  if (!body) return 0;
  return body.trim().split(/\s+/).filter(Boolean).length;
}

export function versionOf(draft: ServerDraft): EditorVersion {
  return { draftId: draft.id, revision: draft.revision, saveSeq: draft.saveSeq, title: draft.title ?? '', body: draft.body ?? '' };
}

export function isSameBase(a: DraftBase, b: DraftBase): boolean {
  return a.draftId === b.draftId && a.revision === b.revision && a.saveSeq === b.saveSeq;
}

export function openEditor(draft: ServerDraft): EditorState {
  const base = versionOf(draft);
  return { title: base.title, body: base.body, base, status: draft.status === 'final' ? 'locked' : 'idle' };
}

export function isDirty(state: EditorState): boolean {
  return state.title !== state.base.title || state.body !== state.base.body;
}

export function canAutosave(state: EditorState): boolean {
  return (state.status === 'idle' || state.status === 'failed') && isDirty(state);
}

/** Saving cannot go on until the author chooses what happens to their text, or the server lets go of the chapter. */
export function isSaveBlocked(state: EditorState): boolean {
  return BLOCKED.includes(state.status);
}

export function isSettled(state: EditorState): boolean {
  return state.status === 'idle' && !isDirty(state);
}

export function hasUnsavedWork(state: EditorState): boolean {
  return isDirty(state) || state.status === 'saving';
}

/**
 * The server moved while the editor was open. Clean text follows it silently; unsaved text stops autosaving and waits
 * for the author to choose, because saving would overwrite a version they have not read.
 */
function reconcile(state: EditorState, draft: ServerDraft): EditorState {
  if (state.status === 'saving') return state;
  const theirs = versionOf(draft);
  if (draft.status === 'final') return { ...state, status: 'locked', theirs, error: undefined };
  if (isSameBase(theirs, state.base)) return state;
  if (!isDirty(state)) return { title: theirs.title, body: theirs.body, base: theirs, status: 'idle' };
  return { ...state, status: 'conflict', theirs, error: undefined };
}

/** A chapter found deleted or final while a save was in flight stays that way; a vaguer refusal of that save must not hide it. */
function refuse(state: EditorState, refusal: SaveRefusal): EditorState {
  const terminal = state.status === 'deleted' || state.status === 'locked';
  if (terminal && (refusal.kind === 'ambiguous' || refusal.kind === 'failed')) return state;
  const settled: EditorState = { ...state, status: 'idle' };
  switch (refusal.kind) {
    case 'conflict':
      return reconcile(settled, refusal.current);
    case 'deleted':
      return { ...settled, status: 'deleted', theirs: undefined, error: undefined };
    case 'ambiguous':
      return { ...settled, status: 'failed', error: 'The chapter could not be saved — try again' };
    case 'locked':
      return { ...settled, status: 'locked', error: undefined };
    case 'held':
      return { ...settled, status: 'held', error: refusal.message };
    case 'failed':
      return { ...settled, status: 'failed', error: refusal.message };
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'edit':
      if (state.status === 'locked' || state.status === 'deleted') return state;
      return {
        ...state,
        title: action.title ?? state.title,
        body: action.body ?? state.body,
        status: state.status === 'failed' ? 'idle' : state.status,
        error: state.status === 'held' ? state.error : undefined,
      };
    case 'save-started':
      return { ...state, status: 'saving', error: undefined };
    case 'saved':
      return { ...state, base: action.saved, status: state.status === 'deleted' ? 'deleted' : 'idle', theirs: undefined, error: undefined };
    case 'save-refused':
      return refuse(state, action.refusal);
    case 'server':
      return reconcile(state, action.draft);
    case 'deleted':
      return { ...state, status: 'deleted', theirs: undefined, error: undefined };
    case 'keep-mine':
      if (state.status !== 'conflict' || !state.theirs) return state;
      return { ...state, base: state.theirs, status: 'idle', theirs: undefined, error: undefined };
    case 'take-theirs':
      if (!state.theirs) return state;
      return { title: state.theirs.title, body: state.theirs.body, base: state.theirs, status: state.status === 'locked' ? 'locked' : 'idle' };
    case 'restore':
      return { ...state, ...action.text };
    case 'retry':
      return state.status === 'held' || state.status === 'failed' ? { ...state, status: 'idle', error: undefined } : state;
  }
}

export function leaveWarning(state: EditorState): string {
  if (state.status === 'conflict') return 'A newer version of this chapter arrived and your edits are waiting for you to choose between them. Leaving now loses your edits.';
  if (state.status === 'locked') return 'This chapter was finalized, so your edits can’t be saved here. Leaving now loses them — copy them first.';
  if (state.status === 'deleted') return 'This chapter was deleted, so your edits can’t be saved here. Leaving now loses them — copy them first.';
  if (state.status === 'held') return 'The AI is writing this chapter, so your edits can’t be saved yet. Leaving now loses them — copy them first.';
  return 'Your latest edits to this chapter aren’t saved yet. Leaving now loses them.';
}

export type SaveLabel = 'Saving…' | 'Unsaved changes' | 'Not saved' | 'Saved';

export function saveLabel(state: EditorState): SaveLabel {
  if (state.status === 'saving') return 'Saving…';
  if (state.status === 'failed' || isSaveBlocked(state)) return 'Not saved';
  return isDirty(state) ? 'Unsaved changes' : 'Saved';
}

const FINALIZED_CODE = 'DRF_002';
const AI_WRITING_CODE = 'DRF_019';
const MOVED_CODE = 'DRF_013';

/** A DRF_013 without a current draft is either a deleted chapter or a deadlock the server gave up on; only a retry tells them apart. */
export function saveRefusalOf(error: unknown): SaveRefusal {
  if (!isApiError(error)) return { kind: 'failed', message: error instanceof Error ? error.message : 'The chapter could not be saved' };
  if (error.code === AI_WRITING_CODE) return { kind: 'held', message: error.message };
  if (error.code === FINALIZED_CODE) return { kind: 'locked' };
  if (error.status === 404) return { kind: 'deleted' };
  if (error.code === MOVED_CODE && error instanceof DraftSaveConflict) {
    return error.current ? { kind: 'conflict', current: { ...error.current, status: 'draft' } } : { kind: 'ambiguous' };
  }
  return { kind: 'failed', message: error.message };
}

export interface DraftWrite {
  baseDraftId: string;
  baseRevision: number;
  baseSaveSeq: number;
  title?: string;
  body: string;
}

export interface SaveDeps {
  write: (text: DraftWrite) => Promise<ServerDraft>;
  getState: () => EditorState;
  dispatch: (action: EditorAction) => void;
  refusalOf: (error: unknown) => SaveRefusal;
}

/**
 * One save of the text on screen, made against the base it was edited from. A refusal that does not show the draft
 * moving — no current draft, or a current draft that is still the base — is what a deadlock looks like, so it is tried
 * once more before failing; a deleted chapter surfaces through the draft query's 404 instead.
 */
export async function runSave({ write, getState, dispatch, refusalOf }: SaveDeps): Promise<boolean> {
  const current = getState();
  if (!canAutosave(current)) return isSettled(current);
  const sent: EditorText = { title: current.title, body: current.body };
  const { base } = current;
  const request: DraftWrite = { baseDraftId: base.draftId, baseRevision: base.revision, baseSaveSeq: base.saveSeq, title: sent.title.trim() || undefined, body: sent.body };
  dispatch({ type: 'save-started' });
  for (let attempt = 0; ; attempt++) {
    try {
      const saved = await write(request);
      dispatch({ type: 'saved', saved: { ...versionOf(saved), ...sent } });
      return isSettled(getState());
    } catch (error) {
      const refusal = refusalOf(error);
      const retryable = refusal.kind === 'ambiguous' || (refusal.kind === 'conflict' && isSameBase(versionOf(refusal.current), base));
      if (retryable && attempt === 0) continue;
      dispatch({ type: 'save-refused', refusal: retryable ? { kind: 'ambiguous' } : refusal });
      return false;
    }
  }
}

export interface SaveQueue {
  current: Promise<unknown>;
}

/**
 * Runs saves one after another: a save asked for while another is in flight waits for it, then saves whatever is still
 * unsaved. Each call resolves true once the editor holds nothing the server lacks.
 */
export function enqueueSave(queue: SaveQueue, save: () => Promise<boolean>): Promise<boolean> {
  const next = queue.current.then(save, save);
  queue.current = next;
  return next;
}

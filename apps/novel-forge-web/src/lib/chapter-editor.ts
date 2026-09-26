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
  | { kind: 'collided' }
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

/** The draft a conflict reports back may have moved (a fold, another tab's identical save) without the text actually diverging — this is content equality, not `isSameBase`'s exact-version one. */
function matchesBase(current: Pick<ServerDraft, 'id' | 'title' | 'body'>, base: EditorVersion): boolean {
  return current.id === base.draftId && (current.title ?? '') === base.title && (current.body ?? '') === base.body;
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
  if (matchesBase(draft, state.base)) {
    const wasConflict = state.status === 'conflict';
    return { ...state, base: theirs, theirs: undefined, status: wasConflict ? 'idle' : state.status, error: wasConflict ? undefined : state.error };
  }
  if (!isDirty(state)) return { title: theirs.title, body: theirs.body, base: theirs, status: 'idle' };
  return { ...state, status: 'conflict', theirs, error: undefined };
}

/** A chapter found deleted or final while a save was in flight stays that way; a vaguer refusal of that save must not hide it. */
function refuse(state: EditorState, refusal: SaveRefusal): EditorState {
  const terminal = state.status === 'deleted' || state.status === 'locked';
  if (terminal && (refusal.kind === 'collided' || refusal.kind === 'failed')) return state;
  const settled: EditorState = { ...state, status: 'idle' };
  switch (refusal.kind) {
    case 'conflict':
      return reconcile(settled, refusal.current);
    case 'deleted':
      return { ...settled, status: 'deleted', theirs: undefined, error: undefined };
    case 'collided':
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

/** What a write that must stand on saved text — a restore, a passage rewrite — found when it asked the editor to settle. */
export type SettledBase = { kind: 'settled'; base: DraftBase } | { kind: 'unsettled'; status: EditorStatus };

export function settledBaseOf(state: EditorState): SettledBase {
  if (!isSettled(state)) return { kind: 'unsettled', status: state.status };
  const { draftId, revision, saveSeq } = state.base;
  return { kind: 'settled', base: { draftId, revision, saveSeq } };
}

export function unsettledMessage(status: EditorStatus): string {
  switch (status) {
    case 'conflict':
      return 'A newer version of this chapter arrived while you were editing — choose which text to keep, then try again.';
    case 'held':
      return 'The AI is writing this chapter, so your edits can’t be saved yet — try again once it’s done.';
    case 'locked':
      return 'This chapter is final — its text is locked.';
    case 'deleted':
      return 'This chapter was deleted.';
    case 'failed':
      return 'Your edits couldn’t be saved — save them, then try again.';
    default:
      return 'Your edits aren’t saved yet — save them, then try again.';
  }
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
const COLLIDED_CODE = 'DRF_021';

/** DRF_021 is a Postgres deadlock the server gave up on, worth exactly one blind retry. A bare DRF_013 — no current draft — is a genuine failure; a deleted chapter surfaces through 404/DRF_001 instead. */
export function saveRefusalOf(error: unknown): SaveRefusal {
  if (!isApiError(error)) return { kind: 'failed', message: error instanceof Error ? error.message : 'The chapter could not be saved' };
  if (error.code === AI_WRITING_CODE) return { kind: 'held', message: error.message };
  if (error.code === FINALIZED_CODE) return { kind: 'locked' };
  if (error.status === 404) return { kind: 'deleted' };
  if (error.code === COLLIDED_CODE) return { kind: 'collided' };
  if (error.code === MOVED_CODE && error instanceof DraftSaveConflict) {
    return error.current ? { kind: 'conflict', current: { ...error.current, status: 'draft' } } : { kind: 'failed', message: error.message };
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
 * One save of the text on screen, made against the base it was edited from. A DRF_021 collision is retried
 * once blindly; a conflict whose current draft has the same id, title and body as the base — nothing really
 * diverged — adopts it as the new base and retries once too, so it never surfaces as a false conflict.
 */
export async function runSave({ write, getState, dispatch, refusalOf }: SaveDeps): Promise<boolean> {
  const current = getState();
  if (!canAutosave(current)) return isSettled(current);
  const sent: EditorText = { title: current.title, body: current.body };
  let base = current.base;
  dispatch({ type: 'save-started' });
  for (let attempt = 0; ; attempt++) {
    const request: DraftWrite = { baseDraftId: base.draftId, baseRevision: base.revision, baseSaveSeq: base.saveSeq, title: sent.title.trim() || undefined, body: sent.body };
    try {
      const saved = await write(request);
      dispatch({ type: 'saved', saved: { ...versionOf(saved), ...sent } });
      return isSettled(getState());
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal.kind === 'collided' && attempt === 0) continue;
      if (refusal.kind === 'conflict' && attempt === 0 && matchesBase(refusal.current, base)) {
        base = versionOf(refusal.current);
        continue;
      }
      dispatch({ type: 'save-refused', refusal });
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

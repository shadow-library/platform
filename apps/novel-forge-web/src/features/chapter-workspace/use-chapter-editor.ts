import { useCallback, useEffect, useRef, useState } from 'react';

import { type DraftResponse, useSaveDraftMutation } from '@/lib/apis';
import {
  AUTOSAVE_DELAY_MS,
  type EditorAction,
  editorReducer,
  type EditorState,
  type EditorText,
  enqueueSave,
  isDirty,
  openEditor,
  runSave,
  saveRefusalOf,
  type SettledBase,
  settledBaseOf,
} from '@/lib/chapter-editor';

export interface ChapterEditorController {
  state: EditorState;
  setTitle: (title: string) => void;
  setBody: (body: string) => void;
  /** Waits for any save in flight, then saves what is left; resolves true once the server holds the text on screen. */
  save: () => Promise<boolean>;
  keepMine: () => void;
  /** Replaces the text on screen with the server's version and returns what was replaced, so it can be put back. */
  takeTheirs: () => EditorText;
  restore: (text: EditorText) => void;
  /** Lets a save held back by the server be tried again. */
  retry: () => Promise<boolean>;
  /** Saves anything unsaved, then hands back the server version the editor now stands on — the base a restore or a suggestion is applied against. */
  settledBase: () => Promise<SettledBase>;
}

export function useChapterEditor(novelId: string, draft: DraftResponse, deleted: boolean): ChapterEditorController {
  const { mutateAsync: writeDraft } = useSaveDraftMutation(novelId, draft.chapter);
  const [state, setState] = useState(() => openEditor(draft));
  // The saves chain reads the state between awaits, before React has rendered the last dispatch, so the ref is the source of truth.
  const stateRef = useRef(state);

  const dispatch = useCallback((action: EditorAction): void => {
    stateRef.current = editorReducer(stateRef.current, action);
    setState(stateRef.current);
  }, []);

  const lastReviewStatus = useRef(draft.reviewStatus);
  useEffect(() => {
    dispatch({ type: 'server', draft });
    const aiFinished = lastReviewStatus.current === 'generating' && draft.reviewStatus !== 'generating';
    lastReviewStatus.current = draft.reviewStatus;
    if (aiFinished && stateRef.current.status === 'held') dispatch({ type: 'retry' });
  }, [dispatch, draft]);

  useEffect(() => {
    if (deleted) dispatch({ type: 'deleted' });
  }, [deleted, dispatch]);

  const saveOnce = useCallback(
    () =>
      runSave({
        write: text => writeDraft(text),
        getState: () => stateRef.current,
        dispatch,
        refusalOf: saveRefusalOf,
      }),
    [dispatch, writeDraft],
  );
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(() => enqueueSave(queueRef, saveOnce), [saveOnce]);

  useEffect(() => {
    if (state.status !== 'idle' || !isDirty(state)) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, save]);

  return {
    state,
    setTitle: title => dispatch({ type: 'edit', title }),
    setBody: body => dispatch({ type: 'edit', body }),
    save,
    keepMine: () => dispatch({ type: 'keep-mine' }),
    takeTheirs: () => {
      const replaced = { title: stateRef.current.title, body: stateRef.current.body };
      dispatch({ type: 'take-theirs' });
      return replaced;
    },
    restore: text => dispatch({ type: 'restore', text }),
    retry: () => {
      dispatch({ type: 'retry' });
      return save();
    },
    settledBase: async () => {
      await save();
      return settledBaseOf(stateRef.current);
    },
  };
}

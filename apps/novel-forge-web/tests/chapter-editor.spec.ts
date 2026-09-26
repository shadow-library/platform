import { describe, expect, it } from 'bun:test';

import { type DraftResponse } from '../src/lib/apis/api-types.gen';
import { DraftSaveConflict, resultOrConflict, savedDraftOrThrow } from '../src/lib/apis/draft.api';
import { ApiError } from '../src/lib/apis/transport';
import {
  canAutosave,
  type DraftWrite,
  type EditorAction,
  editorReducer,
  type EditorState,
  type EditorVersion,
  enqueueSave,
  hasUnsavedWork,
  isDirty,
  isSaveBlocked,
  leaveWarning,
  openEditor,
  runSave,
  type SaveDeps,
  saveLabel,
  saveRefusalOf,
  type ServerDraft,
  settledBaseOf,
  unsettledMessage,
  wordCount,
} from '../src/lib/chapter-editor';

const DRAFT: ServerDraft = { id: 'd1', revision: 3, saveSeq: 7, status: 'draft', title: 'The ledger', body: 'Hollis kept the ledger.' };
const THEIRS: ServerDraft = { id: 'd1', revision: 5, saveSeq: 9, status: 'draft', title: 'The ledger', body: 'The chat rewrote scene 2.' };

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function saved(revision: number, saveSeq: number, body: string, title = 'The ledger'): EditorVersion {
  return { draftId: 'd1', revision, saveSeq, title, body };
}

function conflict(current?: Omit<ServerDraft, 'status'>): DraftSaveConflict {
  return new DraftSaveConflict({
    code: 'DRF_013',
    message: 'This chapter changed while you were working on it. Reload it and try again.',
    current: current && { ...current, title: current.title ?? null, body: current.body ?? '', summary: null, updatedAt: '2026-09-26T00:00:00Z' },
  });
}

function apiError(status: number, code: string, message = code): ApiError {
  return new ApiError(status, { code, type: 'CLIENT_ERROR', message });
}

describe('wordCount', () => {
  it('should count words across any whitespace', () => {
    expect(wordCount('  one two\n\nthree\tfour ')).toBe(4);
  });

  it('should count nothing in an empty chapter', () => {
    expect([wordCount(''), wordCount(null), wordCount('   ')]).toEqual([0, 0, 0]);
  });
});

describe('editorReducer — round trip', () => {
  it('should open clean on the server version and its whole base', () => {
    const state = openEditor(DRAFT);

    expect(state.base).toEqual({ draftId: 'd1', revision: 3, saveSeq: 7, title: 'The ledger', body: 'Hollis kept the ledger.' });
    expect([isDirty(state), canAutosave(state), saveLabel(state)]).toEqual([false, false, 'Saved']);
  });

  it('should mark a title or body edit as unsaved and ready to autosave', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', title: 'What the ledger says' }, { type: 'edit', body: 'Hollis kept it in a tin box.' });

    expect([isDirty(state), canAutosave(state), hasUnsavedWork(state), saveLabel(state)]).toEqual([true, true, true, 'Unsaved changes']);
  });

  it('should come back clean on the saved base once the write lands', () => {
    const saving = run(openEditor(DRAFT), { type: 'edit', body: 'Hollis kept it in a tin box.' }, { type: 'save-started' });
    const done = run(saving, { type: 'saved', saved: saved(3, 8, 'Hollis kept it in a tin box.') });

    expect([saveLabel(saving), hasUnsavedWork(saving)]).toEqual(['Saving…', true]);
    expect([done.base.saveSeq, isDirty(done), saveLabel(done)]).toEqual([8, false, 'Saved']);
  });

  it('should keep text typed during a save unsaved against the new base', () => {
    const state = run(
      openEditor(DRAFT),
      { type: 'edit', body: 'first' },
      { type: 'save-started' },
      { type: 'edit', body: 'first and more' },
      { type: 'saved', saved: saved(4, 8, 'first') },
    );

    expect([state.base.revision, isDirty(state), canAutosave(state)]).toEqual([4, true, true]);
  });

  it('should hold a failed save until the next edit retries it', () => {
    const failed = run(openEditor(DRAFT), { type: 'edit', body: 'x' }, { type: 'save-started' }, { type: 'save-refused', refusal: { kind: 'failed', message: 'Network down' } });
    const retyped = run(failed, { type: 'edit', body: 'xy' });

    expect([failed.status, failed.error, saveLabel(failed)]).toEqual(['failed', 'Network down', 'Not saved']);
    expect([retyped.status, retyped.error]).toEqual(['idle', undefined]);
  });

  it('should not read the refetch of its own save as someone else’s change', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'save-started' }, { type: 'saved', saved: saved(3, 8, 'mine') });

    expect(run(state, { type: 'server', draft: { ...DRAFT, saveSeq: 8, body: 'mine' } })).toBe(state);
  });
});

describe('editorReducer — conflict', () => {
  it('should follow a newer server version silently when nothing is unsaved', () => {
    const state = run(openEditor(DRAFT), { type: 'server', draft: THEIRS });

    expect([state.status, state.base.revision, state.body]).toEqual(['idle', 5, 'The chat rewrote scene 2.']);
  });

  it('should treat a save folded into the same revision as a newer version', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: { ...DRAFT, saveSeq: 8, body: 'another tab' } });

    expect([state.status, state.theirs?.saveSeq]).toEqual(['conflict', 8]);
  });

  it('should adopt a same-content server push as the new base without disturbing unsaved text or becoming a conflict', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: { ...DRAFT, revision: 4, saveSeq: 12 } });

    expect([state.status, state.body, state.base.revision, state.base.saveSeq, canAutosave(state)]).toEqual(['idle', 'mine', 4, 12, true]);
  });

  it('should clear a stuck conflict when another tab reverts to content matching the base, resuming autosave', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: THEIRS }, { type: 'server', draft: { ...DRAFT, revision: 6, saveSeq: 20 } });

    expect([state.status, state.body, state.error, state.theirs]).toEqual(['idle', 'mine', undefined, undefined]);
    expect(canAutosave(state)).toBe(true);
  });

  it('should stop autosaving and offer the recover path when unsaved text meets a newer version', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: THEIRS });

    expect([state.status, state.body, state.base.revision, state.theirs?.revision]).toEqual(['conflict', 'mine', 3, 5]);
    expect([canAutosave(state), hasUnsavedWork(state)]).toEqual([false, true]);
  });

  it('should keep mine by saving it against the newer version next', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: THEIRS }, { type: 'keep-mine' });

    expect([state.status, state.body, state.base.saveSeq, canAutosave(state), state.error]).toEqual(['idle', 'mine', 9, true, undefined]);
  });

  it('should take theirs by dropping the unsaved text', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: THEIRS }, { type: 'take-theirs' });

    expect([state.status, state.body, state.base.revision, isDirty(state)]).toEqual(['idle', 'The chat rewrote scene 2.', 5, false]);
  });

  it('should keep typing in a conflict without resuming autosave', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: THEIRS }, { type: 'edit', body: 'mine, more' });

    expect([state.status, state.body, canAutosave(state)]).toEqual(['conflict', 'mine, more', false]);
  });

  it('should turn a failed save into a conflict when the server has moved on', () => {
    const state = run(
      openEditor(DRAFT),
      { type: 'edit', body: 'mine' },
      { type: 'save-refused', refusal: { kind: 'failed', message: 'Network down' } },
      { type: 'server', draft: THEIRS },
    );

    expect([state.status, state.error]).toEqual(['conflict', undefined]);
  });

  it('should lock the editor when the chapter is finalized underneath it', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: { ...DRAFT, revision: 4, status: 'final' } });

    expect([state.status, canAutosave(state), run(state, { type: 'edit', body: 'more' }).body]).toEqual(['locked', false, 'mine']);
  });

  it('should keep the lock when the author takes the final version', () => {
    const state = run(
      openEditor(DRAFT),
      { type: 'edit', body: 'mine' },
      { type: 'server', draft: { ...DRAFT, revision: 4, status: 'final', body: 'final text' } },
      { type: 'take-theirs' },
    );

    expect([state.status, state.body, isDirty(state)]).toEqual(['locked', 'final text', false]);
  });

  it('should ignore keep-mine outside a conflict', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' });

    expect(run(state, { type: 'keep-mine' })).toBe(state);
  });

  it('should put the replaced text back on undo, unsaved against the newer version', () => {
    const state = run(
      openEditor(DRAFT),
      { type: 'edit', body: 'mine' },
      { type: 'server', draft: THEIRS },
      { type: 'take-theirs' },
      { type: 'restore', text: { title: 'The ledger', body: 'mine' } },
    );

    expect([state.body, state.base.revision, canAutosave(state)]).toEqual(['mine', 5, true]);
  });

  it('should hold unsaved text when the chapter is deleted, and refuse further edits', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'deleted' }, { type: 'edit', body: 'more' });

    expect([state.status, state.body, isSaveBlocked(state), hasUnsavedWork(state)]).toEqual(['deleted', 'mine', true, true]);
    expect(leaveWarning(state)).toContain('deleted');
  });

  it('should hold saving while the AI writes the chapter, and let the author try again', () => {
    const held = run(
      openEditor(DRAFT),
      { type: 'edit', body: 'mine' },
      { type: 'save-refused', refusal: { kind: 'held', message: 'Chapter 4 is being written by the AI right now' } },
    );
    const typed = run(held, { type: 'edit', body: 'mine, more' });

    expect([held.status, held.error, isSaveBlocked(held), canAutosave(held)]).toEqual(['held', 'Chapter 4 is being written by the AI right now', true, false]);
    expect([typed.status, typed.error]).toEqual(['held', 'Chapter 4 is being written by the AI right now']);
    expect(run(held, { type: 'retry' }).status).toBe('idle');
  });

  it('should keep a deletion found mid-save when that save then fails vaguely', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'save-started' }, { type: 'deleted' }, { type: 'save-refused', refusal: { kind: 'collided' } });

    expect([state.status, state.body]).toEqual(['deleted', 'mine']);
  });

  it('should keep a lock when a later refusal only says the save failed', () => {
    const locked = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: { ...DRAFT, revision: 4, status: 'final' } });

    expect(run(locked, { type: 'save-refused', refusal: { kind: 'failed', message: 'Network down' } })).toBe(locked);
  });

  it('should record a save that landed before the deletion without leaving the deleted state', () => {
    const state = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'save-started' }, { type: 'deleted' }, { type: 'saved', saved: saved(3, 8, 'mine') });

    expect([state.status, state.base.saveSeq, isDirty(state), hasUnsavedWork(state)]).toEqual(['deleted', 8, false, false]);
  });

  it('should leave a server update alone while its own save is in flight', () => {
    const saving = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'save-started' });

    expect(run(saving, { type: 'server', draft: THEIRS })).toBe(saving);
  });
});

describe('savedDraftOrThrow', () => {
  it('should raise a 409 body as a conflict carrying the current draft', () => {
    const body = { code: 'DRF_013', message: 'changed', current: { id: 'd1', revision: 5, saveSeq: 9, title: null, body: 'theirs', summary: null, updatedAt: 'now' } };

    expect(() => savedDraftOrThrow(body)).toThrow(DraftSaveConflict);
    try {
      savedDraftOrThrow(body);
    } catch (error) {
      expect([(error as DraftSaveConflict).code, (error as DraftSaveConflict).current?.revision]).toEqual(['DRF_013', 5]);
    }
  });

  it('should pass a saved draft through', () => {
    const draft = { id: 'd1', chapter: 4, revision: 4, saveSeq: 8 } as DraftResponse;

    expect(savedDraftOrThrow(draft)).toBe(draft);
  });
});

describe('resultOrConflict', () => {
  it('should raise a passage or version refusal read with modeled(409), such as a stale suggestion, as a conflict without a current draft', () => {
    try {
      resultOrConflict({ code: 'PSG_004', message: 'stale' });
      throw new Error('expected a conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(DraftSaveConflict);
      expect([(error as DraftSaveConflict).code, (error as DraftSaveConflict).current]).toEqual(['PSG_004', undefined]);
    }
  });

  it('should pass an applied suggestion through, though it carries no id of its own', () => {
    const applied = { draft: { id: 'd1' } as DraftResponse, suggestion: { id: 's1' } };

    expect(resultOrConflict(applied)).toBe(applied);
  });
});

describe('saveRefusalOf', () => {
  it('should read a refusal carrying the current draft as a conflict with it', () => {
    expect(saveRefusalOf(conflict(THEIRS))).toEqual({ kind: 'conflict', current: { ...THEIRS, summary: null, updatedAt: '2026-09-26T00:00:00Z' } });
  });

  it('should fail outright, not retry, a bare DRF_013 with no current draft — a deleted chapter surfaces through 404 instead', () => {
    expect(saveRefusalOf(conflict())).toEqual({ kind: 'failed', message: 'This chapter changed while you were working on it. Reload it and try again.' });
  });

  it('should read a Postgres deadlock as a distinct, retryable collision', () => {
    expect(saveRefusalOf(apiError(409, 'DRF_021', 'This save collided with another save happening at the same time — try again'))).toEqual({ kind: 'collided' });
  });

  it('should sort the server’s other refusals', () => {
    expect(saveRefusalOf(apiError(400, 'DRF_002'))).toEqual({ kind: 'locked' });
    expect(saveRefusalOf(apiError(409, 'DRF_019', 'The AI is writing chapter 4'))).toEqual({ kind: 'held', message: 'The AI is writing chapter 4' });
    expect(saveRefusalOf(apiError(404, 'DRF_001'))).toEqual({ kind: 'deleted' });
    expect(saveRefusalOf(apiError(400, 'DRF_020', 'A save made against an earlier read must send all three'))).toEqual({
      kind: 'failed',
      message: 'A save made against an earlier read must send all three',
    });
  });
});

interface Harness {
  deps: SaveDeps;
  writes: DraftWrite[];
  state: () => EditorState;
}

function harness(start: EditorState, overrides: Partial<SaveDeps> = {}): Harness {
  let state = start;
  const writes: DraftWrite[] = [];
  let saveSeq = start.base.saveSeq;
  const deps: SaveDeps = {
    write: async text => {
      writes.push(text);
      saveSeq += 1;
      return { id: text.baseDraftId, revision: text.baseRevision, saveSeq, status: 'draft', title: text.title, body: text.body };
    },
    getState: () => state,
    dispatch: action => {
      state = editorReducer(state, action);
    },
    refusalOf: saveRefusalOf,
    ...overrides,
  };
  return { deps, writes, state: () => state };
}

describe('runSave', () => {
  it('should send the text on screen with the whole base it was edited from', async () => {
    const h = harness(run(openEditor(DRAFT), { type: 'edit', title: '  New title ', body: 'mine' }));

    expect(await runSave(h.deps)).toBe(true);
    expect(h.writes).toEqual([{ baseDraftId: 'd1', baseRevision: 3, baseSaveSeq: 7, title: 'New title', body: 'mine' }]);
    expect([h.state().base.saveSeq, isDirty(h.state())]).toEqual([8, false]);
  });

  it('should send no title when it is blank, so a missing title stays missing', async () => {
    const h = harness(run(openEditor({ ...DRAFT, title: null }), { type: 'edit', body: 'mine' }));

    await runSave(h.deps);

    expect(h.writes[0]?.title).toBeUndefined();
  });

  it('should turn a refusal carrying a newer draft into the recover path, without reading first', async () => {
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }), {
      write: async () => {
        throw conflict(THEIRS);
      },
    });

    expect(await runSave(h.deps)).toBe(false);
    expect([h.state().status, h.state().theirs?.revision, h.state().body]).toEqual(['conflict', 5, 'mine']);
  });

  it('should retry once when the refusal’s current draft is still the base, rather than show a false conflict', async () => {
    let calls = 0;
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }));
    const write = h.deps.write;
    h.deps.write = async text => {
      calls += 1;
      if (calls === 1) throw conflict(DRAFT);
      return write(text);
    };

    expect(await runSave(h.deps)).toBe(true);
    expect([calls, h.state().status]).toEqual([2, 'idle']);
  });

  it("should adopt a conflict's current draft as the new base and retry once when only its version moved, not its content", async () => {
    let calls = 0;
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }));
    const write = h.deps.write;
    h.deps.write = async text => {
      calls += 1;
      if (calls === 1) throw conflict({ ...DRAFT, revision: 4, saveSeq: 12 });
      return write(text);
    };

    expect(await runSave(h.deps)).toBe(true);
    expect([calls, h.state().status]).toEqual([2, 'idle']);
    expect(h.writes[0]).toMatchObject({ baseRevision: 4, baseSaveSeq: 12, body: 'mine' });
  });

  it('should retry once on a DRF_021 collision, without treating it as a conflict', async () => {
    let calls = 0;
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }));
    const write = h.deps.write;
    h.deps.write = async text => {
      calls += 1;
      if (calls === 1) throw apiError(409, 'DRF_021', 'This save collided with another save happening at the same time — try again');
      return write(text);
    };

    expect(await runSave(h.deps)).toBe(true);
    expect([calls, h.state().status]).toEqual([2, 'idle']);
  });

  it('should fail outright, without retrying, when a refusal carries no current draft at all', async () => {
    let calls = 0;
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }), {
      write: async () => {
        calls += 1;
        throw conflict();
      },
    });

    expect(await runSave(h.deps)).toBe(false);
    expect([calls, h.state().status, h.state().body]).toEqual([1, 'failed', 'mine']);
  });

  it('should hold the text while the AI writes the chapter', async () => {
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }), {
      write: async () => {
        throw apiError(409, 'DRF_019', 'Chapter 4 is being written by the AI right now');
      },
    });

    expect(await runSave(h.deps)).toBe(false);
    expect([h.state().status, h.state().error, h.state().body]).toEqual(['held', 'Chapter 4 is being written by the AI right now', 'mine']);
  });

  it('should report any other failure without losing the text', async () => {
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }), {
      write: async () => {
        throw new Error('Network down');
      },
    });

    expect(await runSave(h.deps)).toBe(false);
    expect([h.state().status, h.state().error, h.state().body]).toEqual(['failed', 'Network down', 'mine']);
  });
});

describe('enqueueSave', () => {
  it('should make a save asked for mid-flight wait, then save what was typed since against the new base', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const h = harness(run(openEditor(DRAFT), { type: 'edit', body: 'first' }));
    const write = h.deps.write;
    h.deps.write = async text => {
      await gate;
      return write(text);
    };
    const queue = { current: Promise.resolve() as Promise<unknown> };

    const autosave = enqueueSave(queue, () => runSave(h.deps));
    await Promise.resolve();
    h.deps.dispatch({ type: 'edit', body: 'first and more' });
    const shortcut = enqueueSave(queue, () => runSave(h.deps));
    release();

    expect(await autosave).toBe(false);
    expect(await shortcut).toBe(true);
    expect(h.writes.map(text => [text.body, text.baseSaveSeq])).toEqual([
      ['first', 7],
      ['first and more', 8],
    ]);
    expect(isDirty(h.state())).toBe(false);
  });

  it('should settle a save that has nothing left to write', async () => {
    const h = harness(openEditor(DRAFT));

    expect(await enqueueSave({ current: Promise.resolve() }, () => runSave(h.deps))).toBe(true);
    expect(h.writes).toEqual([]);
  });
});

describe('settledBaseOf', () => {
  it('should hand back the base of clean, idle text', () => {
    expect(settledBaseOf(openEditor(DRAFT))).toEqual({ kind: 'settled', base: { draftId: 'd1', revision: 3, saveSeq: 7 } });
  });

  it('should refuse unsaved, conflicting or held text, naming why', () => {
    expect(settledBaseOf(run(openEditor(DRAFT), { type: 'edit', body: 'mine' }))).toEqual({ kind: 'unsettled', status: 'idle' });
    const conflicted = run(openEditor(DRAFT), { type: 'edit', body: 'mine' }, { type: 'server', draft: THEIRS });
    expect(settledBaseOf(conflicted)).toEqual({ kind: 'unsettled', status: 'conflict' });
  });
});

describe('unsettledMessage', () => {
  it('should say what to do for a conflict and for a save the AI is holding back', () => {
    expect(unsettledMessage('conflict')).toContain('choose which text to keep');
    expect(unsettledMessage('held')).toContain('The AI is writing this chapter');
    expect(unsettledMessage('idle')).toBe('Your edits aren’t saved yet — save them, then try again.');
  });
});

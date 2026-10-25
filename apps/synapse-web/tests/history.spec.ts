import { describe, expect, it } from 'bun:test';

import { editorLabel } from '../src/features/shared/editor-label';
import { listVersions, predecessorOf, restoreResultNotice, restoreTargetOf, versionNote } from '../src/features/history/history-view';

type Summary = Parameters<typeof listVersions>[0][number];

const summary = (version: number, state: Summary['state'] = 'ARCHIVED'): Summary => ({ version, state, createdAt: '2026-10-01T00:00:00.000Z', createdByName: null });

describe('listVersions', () => {
  it('should order versions newest first', () => {
    const versions = [summary(1), summary(3, 'PUBLISHED'), summary(2)];
    expect(listVersions(versions).map(version => version.version)).toEqual([3, 2, 1]);
  });

  it('should be empty when no version is live yet', () => {
    expect(listVersions([])).toEqual([]);
  });
});

describe('predecessorOf', () => {
  const versions = [summary(1), summary(3), summary(7, 'PUBLISHED')];

  it('should pick the next lower version present, even across gaps', () => {
    expect(predecessorOf(versions, 7)).toBe(3);
    expect(predecessorOf(versions, 3)).toBe(1);
  });

  it('should be null for the first version', () => {
    expect(predecessorOf(versions, 1)).toBeNull();
  });
});

describe('editorLabel', () => {
  it('should say you when the subject is the signed-in one, whatever the name', () => {
    expect(editorLabel({ createdBy: 'sub-1', createdByName: 'Ada' }, 'sub-1')).toBe('you');
    expect(editorLabel({ createdBy: 'sub-1', createdByName: null }, 'sub-1')).toBe('you');
  });

  it('should name another editor and never fall back to the subject id', () => {
    expect(editorLabel({ createdBy: 'sub-2', createdByName: 'Grace' }, 'sub-1')).toBe('Grace');
    expect(editorLabel({ createdBy: 'sub-2', createdByName: 'Grace' }, undefined)).toBe('Grace');
    expect(editorLabel({ createdBy: 'sub-2', createdByName: null }, 'sub-1')).toBeNull();
    expect(editorLabel({ createdBy: 'sub-2', createdByName: '' }, 'sub-1')).toBeNull();
  });

  it('should be null when nobody is recorded', () => {
    expect(editorLabel({}, 'sub-1')).toBeNull();
    expect(editorLabel({ createdBy: '', createdByName: null }, '')).toBeNull();
  });
});

describe('versionNote', () => {
  it('should read a rollback as the version it restored', () => {
    expect(versionNote('Rollback to v12')).toBe('Restored version 12');
  });

  it('should keep every other note as written', () => {
    expect(versionNote('Novel Forge · Chat — data policy changed')).toBe('Novel Forge · Chat — data policy changed');
    expect(versionNote('Rollback to v12 and more')).toBe('Rollback to v12 and more');
    expect(versionNote(undefined)).toBeUndefined();
  });
});

describe('restoreTargetOf', () => {
  const access = { activeVersion: 7, predecessor: 5, canWrite: true };

  it('should offer Undo on the live version, back to the one before it', () => {
    expect(restoreTargetOf(7, access)).toEqual({ kind: 'undo', version: 5, expectedLive: 7 });
  });

  it('should offer to restore an older version against the live one', () => {
    expect(restoreTargetOf(3, { ...access, predecessor: 1 })).toEqual({ kind: 'restore', version: 3, expectedLive: 7 });
  });

  it('should offer nothing for the first version while it is live', () => {
    expect(restoreTargetOf(7, { ...access, predecessor: null })).toBeNull();
  });

  it('should offer nothing to a role that cannot change the catalog, or before the live version is known', () => {
    expect(restoreTargetOf(3, { ...access, canWrite: false })).toBeNull();
    expect(restoreTargetOf(3, { ...access, activeVersion: undefined })).toBeNull();
  });
});

describe('restoreResultNotice', () => {
  const undo = { kind: 'undo' as const, version: 5, expectedLive: 7 };
  const restore = { kind: 'restore' as const, version: 3, expectedLive: 7 };
  const issue = { path: 'tasks.novel-forge.chat.routes[0].model', code: 'unknown_model', message: 'gone' };

  it('should say nothing when the version went live or the person cancelled', () => {
    expect(restoreResultNotice({ kind: 'applied', version: 8, previous: 7 }, undo)).toBeNull();
    expect(restoreResultNotice({ kind: 'alreadyLive' }, undo)).toBeNull();
    expect(restoreResultNotice({ kind: 'cancelled' }, restore)).toBeNull();
  });

  it('should explain that someone else changed the catalog and nothing was changed', () => {
    expect(restoreResultNotice({ kind: 'conflict' }, undo)).toMatchObject({ intent: 'warning', body: expect.stringContaining('Nothing was changed') });
  });

  it('should name what was not undone or restored, with the reason', () => {
    expect(restoreResultNotice({ kind: 'invalid', issues: [issue] }, undo)).toMatchObject({ intent: 'danger', title: "Version 7 wasn't undone", issues: [issue] });
    expect(restoreResultNotice({ kind: 'refused', reason: 'Not allowed' }, restore)).toEqual({ intent: 'danger', title: "Version 3 wasn't restored", body: 'Not allowed' });
    expect(restoreResultNotice({ kind: 'failed', message: 'offline' }, restore)).toMatchObject({ body: 'offline' });
  });

  it('should say there is nothing to restore when the settings are already live', () => {
    expect(restoreResultNotice({ kind: 'unchanged' }, restore)).toEqual({ intent: 'info', title: 'Nothing to restore', body: "Version 3's settings are already live." });
  });
});

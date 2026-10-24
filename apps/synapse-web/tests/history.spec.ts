import { describe, expect, it } from 'bun:test';

import { describeChanges } from '../src/features/catalog/catalog-changes';
import { authorOf, groupChanges, listVersions, predecessorOf, rollbackDescription, rollbackIssueRows } from '../src/features/history/history-view';
import { catalogFixture } from './catalog-fixture';

type Summary = Parameters<typeof listVersions>[0][number];

const summary = (version: number, state: Summary['state'] = 'ARCHIVED'): Summary => ({ version, state, createdAt: '2026-10-01T00:00:00.000Z' });

describe('listVersions', () => {
  it('should order versions newest first and drop the draft', () => {
    const versions = [summary(1), summary(3, 'PUBLISHED'), summary(0, 'DRAFT'), summary(2)];
    expect(listVersions(versions).map(version => version.version)).toEqual([3, 2, 1]);
  });

  it('should be empty when nothing is published', () => {
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

describe('authorOf', () => {
  it('should say you when the subject is the signed-in one', () => {
    expect(authorOf('sub-1', 'sub-1')).toEqual({ kind: 'you' });
  });

  it('should keep another subject as secondary data', () => {
    expect(authorOf('sub-2', 'sub-1')).toEqual({ kind: 'other', subject: 'sub-2' });
    expect(authorOf('sub-2', undefined)).toEqual({ kind: 'other', subject: 'sub-2' });
  });

  it('should be null when nobody is recorded', () => {
    expect(authorOf(undefined, 'sub-1')).toBeNull();
    expect(authorOf('', 'sub-1')).toBeNull();
  });
});

describe('groupChanges', () => {
  it('should group by area in a fixed order and skip empty areas', () => {
    const before = catalogFixture();
    const after = catalogFixture();
    after.tasks['novel-forge.chat'].routes[1] = { model: 'sonnet-5.5' };
    after.budgets[1] = { app: 'memoir', per: 'app', window: '30d', maxCalls: 5 };
    const groups = groupChanges(describeChanges(before, after));
    expect(groups.map(group => group.title)).toEqual(['Features', 'Budgets']);
    expect(groups.every(group => group.changes.length > 0)).toBe(true);
  });

  it('should be empty when nothing changed', () => {
    expect(groupChanges(describeChanges(catalogFixture(), catalogFixture()))).toEqual([]);
  });
});

describe('rollbackIssueRows', () => {
  const issue = { path: 'tasks.novel-forge.chat.routes[0].model', code: 'unknown_model', message: 'gone' };

  it('should read the issue as a sentence and keep the path separate', () => {
    const [row] = rollbackIssueRows([issue], null);
    expect(row?.sentence).toBe("It names a model the catalog doesn't have");
    expect(row?.path).toBe(issue.path);
    expect(row?.owner).toBeUndefined();
  });

  it('should name the owning entity when the document is known', () => {
    const [row] = rollbackIssueRows([issue], catalogFixture());
    expect(row?.owner).toBe('novel-forge.chat');
  });
});

describe('rollbackDescription', () => {
  it('should say the version becomes live and the draft is untouched', () => {
    expect(rollbackDescription(4)).toBe("Version 4's settings become live for every app as a new version. Your unpublished draft is not touched.");
  });
});

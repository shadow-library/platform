import { type ChangeOutcome } from '@/features/catalog/catalog-change';
import { type CatalogChange } from '@/features/catalog/catalog-changes';
import { type IssueNotice } from '@/features/shared/issue-notice';
import { type VersionOutcome } from '@/lib/apis/catalog.api';

import { plural } from './change-summary';

export type ChangeResult = ChangeOutcome | { kind: 'cancelled' };

export type ChangeAction = 'added' | 'updated' | 'removed';

export type UndoResult = { kind: 'done'; outcome: VersionOutcome; undone: number } | { kind: 'conflict' } | { kind: 'forbidden' } | { kind: 'failed'; message: string };

export const CONFLICT_NOTICE: IssueNotice = {
  intent: 'warning',
  title: 'Someone else changed the catalog at the same time',
  body: "Your change wasn't applied. The screen now shows their version; check it and try again.",
};

const FAILED_TITLES: Readonly<Record<ChangeAction, (name: string) => string>> = {
  added: name => `${name} wasn't added`,
  updated: name => `${name} wasn't changed`,
  removed: name => `${name} wasn't removed`,
};

export function isSettled(result: ChangeResult): boolean {
  return result.kind === 'applied' || result.kind === 'unchanged';
}

export function changeResultNotice(result: ChangeResult, name: string, action: ChangeAction): IssueNotice | null {
  const failed = FAILED_TITLES[action](name);
  switch (result.kind) {
    case 'applied':
    case 'cancelled':
      return null;
    case 'invalid':
      return { intent: 'danger', title: failed, body: 'Synapse refused the change:', issues: result.issues };
    case 'unchanged':
      return { intent: 'info', title: 'Nothing to change', body: `The catalog already has these settings for ${name}.` };
    case 'refused':
      return { intent: 'danger', title: failed, body: result.reason };
    case 'conflict':
      return CONFLICT_NOTICE;
    case 'failed':
      return { intent: 'danger', title: failed, body: result.message };
  }
}

export function appliedNotice(version: number, changes: readonly Pick<CatalogChange, 'sentence'>[]): IssueNotice {
  const [first] = changes;
  const more = changes.length - 1;
  const body = first ? `${first.sentence}${more > 0 ? `, and ${plural(more, 'more change')}` : ''}.` : undefined;
  return { intent: 'success', title: `Live now (version ${version})`, ...(body && { body }) };
}

export function undoNotice(result: UndoResult): IssueNotice {
  switch (result.kind) {
    case 'done':
      if (result.outcome.kind === 'invalid')
        return {
          intent: 'danger',
          title: "Your change couldn't be undone",
          body: 'The previous version no longer passes the catalog checks, so nothing was changed:',
          issues: result.outcome.issues,
        };
      if (result.outcome.value.version === result.undone) return { intent: 'info', title: 'Nothing to undo', body: 'The catalog already matches the previous version.' };
      return { intent: 'success', title: `Change undone, live now (version ${result.outcome.value.version})`, body: 'The previous settings are back for every app.' };
    case 'conflict':
      return {
        intent: 'warning',
        title: "Your change wasn't undone",
        body: 'Someone else changed the catalog since, and undoing now would revert their change too. History shows every version.',
      };
    case 'forbidden':
      return { intent: 'danger', title: "Your change wasn't undone", body: "Your role isn't allowed to make this change any more. Ask a Synapse administrator." };
    case 'failed':
      return { intent: 'danger', title: "Your change wasn't undone", body: result.message };
  }
}

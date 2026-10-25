import { type DraftEditOutcome } from '@/features/catalog/draft-edit';
import { type CatalogIssueResponse } from '@/lib/apis/api-types.gen';

import { type Notice } from './notice.types';

export interface DraftNotice extends Notice {
  changesLink?: boolean;
  issues?: CatalogIssueResponse[];
}

export type DraftAction = 'added' | 'updated' | 'removed';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function draftOutcomeNotice(outcome: DraftEditOutcome, name: string, action: DraftAction): DraftNotice {
  const failed = action === 'removed' ? `${name} wasn't removed` : `${name} wasn't saved`;
  switch (outcome.kind) {
    case 'saved': {
      const title = `${name} ${action} in the draft`;
      if (outcome.issues.length === 0) return { intent: 'success', title, body: 'It goes live once the draft is published.', changesLink: true };
      return { intent: 'warning', title, body: draftProblemsSentence(outcome.issues.length), changesLink: true };
    }
    case 'invalid':
      return { intent: 'danger', title: failed, body: "Synapse couldn't accept the draft with this change.", issues: outcome.issues };
    case 'unchanged':
      return { intent: 'info', title: 'Nothing to save', body: `The draft already has these settings for ${name}.` };
    case 'refused':
      return { intent: 'danger', title: failed, body: outcome.reason };
    case 'conflict':
      return { intent: 'warning', title: 'Someone else changed the draft', body: "Your change wasn't saved. The screen now shows their version; check it and try again." };
    case 'failed':
      return { intent: 'danger', title: failed, body: outcome.message };
  }
}

export function draftProblemsSentence(count: number): string {
  return `The draft now has ${plural(count, 'problem')} to fix before it can be published.`;
}

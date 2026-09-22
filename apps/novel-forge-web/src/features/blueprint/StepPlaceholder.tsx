import { type ReactElement, type ReactNode } from 'react';

import { EmptyState } from '@/components/nf';
import { ConceptIcon, LockIcon } from '@/components/icons';

export interface StepPlaceholderProps {
  title: string;
  description: ReactNode;
  /** A locked phase is a different absence from a screen that is not built yet, and reads as one. */
  locked?: boolean;
  actions?: ReactNode;
}

/** What a step with no screen of its own shows: a sentence, never a dead link or a blank page. */
export function StepPlaceholder({ title, description, locked, actions }: StepPlaceholderProps): ReactElement {
  return <EmptyState icon={locked === true ? <LockIcon size={22} /> : <ConceptIcon size={22} />} title={title} description={description} actions={actions} />;
}

import { type ReactElement } from 'react';

import { type EntryCapAdvisory } from '@/lib/data';

import styles from './EntryCapNote.module.css';

export interface EntryCapNoteProps {
  advisory: EntryCapAdvisory | null | undefined;
}

/**
 * One quiet line beneath a form or a save confirmation. It never renders a modal, a colour, or a blocked
 * state: PRD §4.13 makes the monthly allowance advisory, and `advisory.blocksSave` is typed `false` so this
 * component has nothing to branch on.
 */
export function EntryCapNote({ advisory }: EntryCapNoteProps): ReactElement | null {
  if (!advisory || advisory.message === null) return null;

  return (
    <p className={styles.note} data-cap-level={advisory.level} role="note">
      {advisory.message}
    </p>
  );
}

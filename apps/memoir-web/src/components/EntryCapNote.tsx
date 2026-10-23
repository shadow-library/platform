import { type ReactElement } from 'react';

import { type EntryCapAdvisory } from '@/lib/data';

import styles from './EntryCapNote.module.css';

export interface EntryCapNoteProps {
  advisory: EntryCapAdvisory | null | undefined;
}

/**
 * One quiet line beneath a form or a save confirmation. The allowance is advisory — `advisory.blocksSave` is typed `false` — so there is no modal,
 * colour or blocked state to branch to.
 */
export function EntryCapNote({ advisory }: EntryCapNoteProps): ReactElement | null {
  if (!advisory || advisory.message === null) return null;

  return (
    <p className={styles.note} data-cap-level={advisory.level} role="note">
      {advisory.message}
    </p>
  );
}

import { type ReactElement } from 'react';

import { textLength } from './text-limit';
import styles from './blueprint.module.css';

export interface CharCountProps {
  value: string | undefined;
  max: number;
  /** The share of the limit after which the count appears; below it a count is noise. */
  from?: number;
}

/** A field's count against its limit, shown once it matters: the field refuses past the limit instead of cutting the author off. */
export function CharCount({ value, max, from = 0.8 }: CharCountProps): ReactElement | null {
  const length = textLength(value);
  if (length < max * from) return null;
  return (
    <span className={styles.steerCount} data-over={length > max || undefined} aria-live="polite">
      {length.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}

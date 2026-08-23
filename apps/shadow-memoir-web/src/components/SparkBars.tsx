import { type ReactElement } from 'react';
import { cn } from '@shadow-library/ui';

import styles from './SparkBars.module.css';

export interface SparkBarsProps {
  values: (number | null)[];
  /** Accessible summary of the whole strip — the bars themselves are decorative. */
  label: string;
  height?: number;
  /** Emphasise the final bar, which is nearly always "today". */
  highlightLast?: boolean;
  className?: string;
}

/**
 * A blank day is a gap, never a zero — PRD §2.6. A null value renders as an empty track so a missed day
 * cannot read as a day with nothing in it.
 */
export function SparkBars({ values, label, height = 40, highlightLast = false, className }: SparkBarsProps): ReactElement {
  const present = values.filter((value): value is number => value !== null);
  const max = present.length > 0 ? Math.max(...present) : 1;

  return (
    <div className={cn(styles.strip, className)} style={{ height }} role="img" aria-label={label}>
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(styles.bar, value === null && styles.blank)}
          style={{
            height: value === null ? '100%' : `${Math.max((value / max) * 100, 4)}%`,
            opacity: value === null ? 1 : highlightLast && index === values.length - 1 ? 1 : 0.45 + (index / values.length) * 0.4,
          }}
        />
      ))}
    </div>
  );
}

import { forwardRef } from 'react';

import { cn } from '@/lib';

import styles from './Progress.module.css';
import { type ProgressProps } from './Progress.types';

/** Determinate bars expose `role="progressbar"` with aria-valuenow/min/max; indeterminate bars omit the value. The fill only moves forward. */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { value = 0, max = 100, indeterminate = false, label, intent = 'accent', size = 'sm', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...props },
  ref,
) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const labelText = typeof label === 'string' ? label : undefined;

  return (
    <div ref={ref} className={cn(styles.root, className)} {...props}>
      {label != null ? (
        <div className={styles.labelRow}>
          <span className={styles.label}>{label}</span>
          {indeterminate ? null : <span className={styles.percent}>{Math.round(pct)}%</span>}
        </div>
      ) : null}
      <div
        className={styles.track}
        data-size={size}
        role="progressbar"
        aria-label={ariaLabel ?? labelText}
        aria-labelledby={ariaLabelledBy}
        aria-valuemin={0}
        aria-valuemax={indeterminate ? undefined : max}
        aria-valuenow={indeterminate ? undefined : value}
      >
        <div className={styles.fill} data-intent={intent} data-indeterminate={indeterminate || undefined} style={indeterminate ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
});

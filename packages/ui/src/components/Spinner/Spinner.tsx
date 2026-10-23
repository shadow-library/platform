import { forwardRef } from 'react';

import { cn } from '@/lib';

import styles from './Spinner.module.css';
import { type SpinnerProps } from './Spinner.types';

/** `role="status"` with visually-hidden label text; rotation stops under reduced motion. */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner({ size = 'md', label = 'Loading', className, ...props }, ref) {
  return (
    <span ref={ref} className={cn(styles.root, className)} data-size={size} role="status" {...props}>
      <span className={styles.ring} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
});

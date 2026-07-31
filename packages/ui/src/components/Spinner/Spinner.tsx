/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Spinner.module.css';
import { type SpinnerProps } from './Spinner.types';

/**
 * A circular track + accent arc that rotates at the tokenized spin speed. Non-interactive; carries
 * `role="status"` with visually-hidden label text so screen readers hear "Loading", not silence.
 * Under reduced motion the rotation stops (a static ring) rather than spinning.
 */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner({ size = 'md', label = 'Loading', className, ...props }, ref) {
  return (
    <span ref={ref} className={cn(styles.root, className)} data-size={size} role="status" {...props}>
      <span className={styles.ring} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
});

/**
 * Importing npm packages
 */
import { forwardRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Badge.module.css';
import { type BadgeProps } from './Badge.types';

/**
 * Declaring the constants
 */
function formatCount(children: ReactNode, max: number | undefined): ReactNode {
  if (max == null) return children;
  const value = typeof children === 'number' ? children : Number(children);
  if (Number.isNaN(value) || value <= max) return children;
  return `${max}+`;
}

/**
 * A small, non-interactive status marker: state words, counts, and dots. Badges *tell* — they carry
 * no hover, cursor, or remove affordance (that is a Tag/Chip). Intent lives in the token layer, so a
 * theme flip recolors every badge automatically. Meaning is never color alone: pair a `dot` with the
 * word, and count badges take an `aria-label` from the caller.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { intent = 'neutral', variant = 'soft', dot = false, max, size = 'md', className, children, ...props },
  ref,
) {
  const showDot = dot || variant === 'dot';
  return (
    <span ref={ref} className={cn(styles.root, className)} data-variant={variant} data-intent={intent} data-size={size} {...props}>
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {variant === 'count' ? formatCount(children, max) : children}
    </span>
  );
});

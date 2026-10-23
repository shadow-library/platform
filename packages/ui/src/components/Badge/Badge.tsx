import { forwardRef, type ReactNode } from 'react';

import { cn } from '@/lib';

import styles from './Badge.module.css';
import { type BadgeProps } from './Badge.types';

function formatCount(children: ReactNode, max: number | undefined): ReactNode {
  if (max == null) return children;
  const value = typeof children === 'number' ? children : Number(children);
  if (Number.isNaN(value) || value <= max) return children;
  return `${max}+`;
}

/** Non-interactive status marker. Meaning is never colour alone: pair a `dot` with the word, and give count badges an `aria-label`. */
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

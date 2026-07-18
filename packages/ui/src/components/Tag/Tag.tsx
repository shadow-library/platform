/**
 * Importing npm packages
 */
import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Tag.module.css';
import { type TagProps } from './Tag.types';

/**
 * Declaring the constants
 */
function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * User-defined metadata — categories, labels, topics. A quiet neutral rectangle (radius-4, vs the
 * Badge pill), optionally carrying a color swatch, a remove button, or (via `asChild`) a link. The
 * fill stays neutral by design; the swatch is the only color slot. This is the same tag the Multi
 * Select trigger renders.
 */
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag({ size = 'md', color, onRemove, asChild = false, className, children, ...props }, ref) {
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(styles.root, className)} data-size={size} data-interactive="true" {...props}>
        {children}
      </Slot>
    );
  }

  const removeLabel = typeof children === 'string' ? `Remove ${children}` : 'Remove';
  return (
    <span ref={ref} className={cn(styles.root, className)} data-size={size} data-removable={onRemove ? '' : undefined} {...props}>
      {color != null ? <span className={styles.swatch} style={{ background: color }} aria-hidden="true" /> : null}
      {children}
      {onRemove != null ? (
        <button type="button" className={styles.remove} aria-label={removeLabel} onClick={onRemove}>
          <RemoveIcon />
        </button>
      ) : null}
    </span>
  );
});

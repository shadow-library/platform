import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

import { cn } from '@/lib';

import styles from './Tag.module.css';
import { type TagProps } from './Tag.types';

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

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

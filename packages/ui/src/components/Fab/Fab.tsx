import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

import { cn } from '@/lib';

import styles from './Fab.module.css';
import { type FabProps } from './Fab.types';

/**
 * Layered above shell chrome (z-shell) and below every overlay (z-scrim and up). Icon-only needs `aria-label`.
 * Reserve its height from the scrollable content below via Shell's `--sh-shell-bottom-extra`; keep one per screen.
 */
export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { icon, label, variant = 'primary', size = 'md', placement = 'bottom-end', asChild = false, type, className, children, ...props },
  ref,
) {
  const rootClassName = cn(styles.root, className);
  const shared = { 'data-variant': variant, 'data-size': size, 'data-placement': placement, 'data-extended': label != null || undefined };

  if (asChild) {
    return (
      <Slot ref={ref} className={rootClassName} {...shared} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button ref={ref} type={type ?? 'button'} className={rootClassName} {...shared} {...props}>
      <span className={styles.icon} aria-hidden={label != null || undefined}>
        {icon}
      </span>
      {label != null ? <span className={styles.label}>{label}</span> : null}
    </button>
  );
});

/**
 * Importing npm packages
 */
import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Fab.module.css';
import { type FabProps } from './Fab.types';

/**
 * Declaring the constants
 */

/**
 * Floating Action Button — the screen's single promoted action on touch layouts. Floats above the
 * content in a thumb-reachable corner, offset past the device safe areas, at z-sticky (under every
 * overlay). Icon-only by default (pass `aria-label`); a `label` extends it into a pill. Pair it with
 * `BottomNavigation` by stacking their bottom offsets in the consumer layout; keep one per screen.
 */
export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { icon, label, variant = 'primary', size = 'md', placement = 'bottom-end', asChild = false, type, className, children, ...props },
  ref,
) {
  const rootClassName = cn(styles.root, className);
  const shared = { 'data-variant': variant, 'data-size': size, 'data-placement': placement, 'data-extended': label != null || undefined };

  // asChild delegates rendering to the consumer's element (e.g. a router link); the child owns its content.
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

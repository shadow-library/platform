/**
 * Importing npm packages
 */

import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Button.module.css';
import { type ButtonProps } from './Button.types';

/**
 * Declaring the constants
 */

/**
 * The atomic unit of action. Renders a native `<button>` (or, with `asChild`, the child element),
 * from which every other interactive control inherits sizing, radius, focus, and motion.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, fullWidth = false, prefix, suffix, asChild = false, type, disabled, className, children, ...props },
  ref,
) {
  const rootClassName = cn(styles.root, className);

  // asChild delegates rendering to the consumer's element (e.g. a router link); the loading
  // spinner and adornment wrappers do not apply — the child owns its content.
  if (asChild) {
    return (
      <Slot ref={ref} className={rootClassName} data-variant={variant} data-size={size} data-full-width={fullWidth || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={rootClassName}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      data-full-width={fullWidth || undefined}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden='true' /> : null}
      <span className={styles.content}>
        {prefix != null ? <span className={styles.affix}>{prefix}</span> : null}
        {children}
        {suffix != null ? <span className={styles.affix}>{suffix}</span> : null}
      </span>
      {loading ? <span className={styles.srOnly}>Loading</span> : null}
    </button>
  );
});

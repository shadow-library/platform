/**
 * Importing npm packages
 */

import { Slot, Slottable } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './IconButton.module.css';
import { type IconButtonProps } from './IconButton.types';

/**
 * Declaring the constants
 */

/**
 * A square, icon-only specialization of Button for scarce space and conventional actions.
 * Requires an `aria-label` (and mirrors it into a native `title` until Tooltip lands); pass
 * `pressed` to switch to toggle semantics.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = 'ghost', size = 'md', loading = false, pressed, asChild = false, type, disabled, title, className, children, ...props },
  ref,
) {
  const ariaLabel = props['aria-label'];
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (nodeEnv !== 'production' && !ariaLabel) throw new Error('IconButton: a non-empty `aria-label` is required for an accessible name.');

  const dataProps = {
    'data-variant': variant,
    'data-size': size,
    'data-loading': loading || undefined,
    'data-pressed': pressed ? 'true' : undefined,
  };
  const content = loading ? <span className={styles.spinner} aria-hidden="true" /> : <span className={styles.icon}>{icon}</span>;

  // asChild renders the consumer's element (e.g. a link) as the button, with the icon injected.
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(styles.root, className)} {...dataProps} aria-pressed={pressed} title={title ?? ariaLabel} {...props}>
        {content}
        <Slottable>{children}</Slottable>
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(styles.root, className)}
      {...dataProps}
      aria-pressed={pressed}
      title={title ?? ariaLabel}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </button>
  );
});

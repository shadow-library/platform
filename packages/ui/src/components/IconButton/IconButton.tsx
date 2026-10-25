import { Slot, Slottable } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

import { cn, guardAriaDisabled } from '@/lib';

import styles from './IconButton.module.css';
import { type IconButtonProps } from './IconButton.types';

/** Requires an `aria-label` (mirrored into a native `title`); pass `pressed` for toggle semantics. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = 'ghost', size = 'md', loading = false, pressed, asChild = false, type, disabled, title, onClick, className, children, ...props },
  ref,
) {
  const ariaLabel = props['aria-label'];
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (nodeEnv !== 'production' && !ariaLabel) throw new Error('IconButton: a non-empty `aria-label` is required for an accessible name.');

  const handleClick = guardAriaDisabled(props['aria-disabled'], onClick);
  const dataProps = {
    'data-variant': variant,
    'data-size': size,
    'data-loading': loading || undefined,
    'data-pressed': pressed ? 'true' : undefined,
  };
  const content = loading ? <span className={styles.spinner} aria-hidden="true" /> : <span className={styles.icon}>{icon}</span>;

  if (asChild) {
    return (
      <Slot ref={ref} className={cn(styles.root, className)} {...dataProps} aria-pressed={pressed} title={title ?? ariaLabel} onClick={handleClick} {...props}>
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
      onClick={handleClick}
      {...props}
    >
      {content}
    </button>
  );
});

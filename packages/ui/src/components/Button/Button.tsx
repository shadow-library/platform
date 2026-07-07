/**
 * Importing npm packages
 */

import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { useButtonGroupContext } from '../ButtonGroup/ButtonGroup.context';
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
  { variant: variantProp, size: sizeProp, loading = false, loadingText, fullWidth = false, prefix, suffix, asChild = false, type, disabled, className, children, ...props },
  ref,
) {
  // Inside a ButtonGroup the group's variant/size win — the whole set stays uniform by design.
  const group = useButtonGroupContext();
  const variant = group?.variant ?? variantProp ?? 'secondary';
  const size = group?.size ?? sizeProp ?? 'md';

  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (nodeEnv !== 'production' && group && ((variantProp != null && variantProp !== group.variant) || (sizeProp != null && sizeProp !== group.size)))
    console.warn('Button: `variant`/`size` are controlled by the enclosing ButtonGroup and the value passed here is ignored.');

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

  // Two loading modes: with loadingText the label is swapped for the spinner + new label;
  // without it the spinner overlays and the original content is hidden to preserve width.
  const showLoadingText = loading && loadingText != null;

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
      {loading && !showLoadingText ? <span className={styles.spinner} data-overlay='true' aria-hidden='true' /> : null}
      <span className={styles.content} data-hidden={loading && !showLoadingText ? 'true' : undefined}>
        {showLoadingText ? (
          <>
            <span className={styles.spinner} aria-hidden='true' />
            {loadingText}
          </>
        ) : (
          <>
            {prefix != null ? <span className={styles.affix}>{prefix}</span> : null}
            {children}
            {suffix != null ? <span className={styles.affix}>{suffix}</span> : null}
          </>
        )}
      </span>
      {loading && !showLoadingText ? <span className={styles.srOnly}>Loading</span> : null}
    </button>
  );
});

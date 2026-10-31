import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

import { cn, guardAriaDisabled } from '@/lib';

import { useButtonGroupContext } from '../ButtonGroup/ButtonGroup.context';
import styles from './Button.module.css';
import { type ButtonProps } from './Button.types';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant: variantProp,
    size: sizeProp,
    tone = 'neutral',
    loading = false,
    loadingText,
    fullWidth = false,
    prefix,
    suffix,
    asChild = false,
    type,
    disabled,
    onClick,
    className,
    children,
    ...props
  },
  ref,
) {
  // Inside a ButtonGroup the group's variant/size win — the whole set stays uniform by design.
  const group = useButtonGroupContext();
  const requestedVariant = group?.variant ?? variantProp ?? 'secondary';
  const variant = tone === 'danger' && requestedVariant === 'primary' ? 'danger' : requestedVariant;
  const size = group?.size ?? sizeProp ?? 'md';
  const dataTone = tone === 'danger' ? 'danger' : undefined;

  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (nodeEnv !== 'production' && group && ((variantProp != null && variantProp !== group.variant) || (sizeProp != null && sizeProp !== group.size)))
    // eslint-disable-next-line no-console -- intentional dev-only guidance, stripped in production builds
    console.warn('Button: `variant`/`size` are controlled by the enclosing ButtonGroup and the value passed here is ignored.');

  const rootClassName = cn(styles.root, className);
  const handleClick = guardAriaDisabled(props['aria-disabled'], onClick);

  // asChild delegates rendering to the consumer's element (e.g. a router link); the loading
  // spinner and adornment wrappers do not apply — the child owns its content.
  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={rootClassName}
        data-variant={variant}
        data-tone={dataTone}
        data-size={size}
        data-full-width={fullWidth || undefined}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  const showLoadingText = loading && loadingText != null;

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={rootClassName}
      data-variant={variant}
      data-tone={dataTone}
      data-size={size}
      data-loading={loading || undefined}
      data-full-width={fullWidth || undefined}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      {loading && !showLoadingText ? <span className={styles.spinner} data-overlay="true" aria-hidden="true" /> : null}
      <span className={styles.content} data-hidden={loading && !showLoadingText ? 'true' : undefined}>
        {showLoadingText ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
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

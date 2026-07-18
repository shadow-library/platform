/**
 * Importing npm packages
 */
import { type ChangeEvent, forwardRef, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn, mergeRefs } from '@/lib';

import styles from './Input.module.css';
import { type InputProps } from './Input.types';

/**
 * Declaring the constants
 */
function ClearIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 8S3.9 3.5 8 3.5 14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.3 6.3a2 2 0 0 0 2.8 2.8M4.2 4.3C2.6 5.3 1.5 8 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6M9.9 4C9.3 3.7 8.7 3.5 8 3.5 3.9 3.5 1.5 8 1.5 8m13 0s-.6 1.2-1.8 2.4" />
      <path d="M2 2l12 12" />
    </svg>
  );
}

/**
 * Single-line text entry — the field-surface reference every other form control inherits. The
 * bordered wrapper owns the focus-within ring and adornments; the inner `<input>` is transparent
 * and border-less. Label, helper text, and error messages belong to Form Field, not here.
 *
 * `className`/`style` target the wrapper (layout/width); all other props flow to the `<input>`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    type = 'text',
    size = 'md',
    prefix,
    suffix,
    invalid = false,
    clearable = false,
    revealable = true,
    value,
    defaultValue,
    onChange,
    onValueChange,
    disabled = false,
    readOnly = false,
    className,
    style,
    inputClassName,
    ...props
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => (defaultValue != null ? String(defaultValue) : ''));
  const currentValue = isControlled ? value : uncontrolledValue;

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    if (!isControlled) setUncontrolledValue(event.target.value);
    onValueChange?.(event.target.value);
    onChange?.(event);
  }

  function handleClear(): void {
    if (!isControlled) setUncontrolledValue('');
    onValueChange?.('');
    inputRef.current?.focus();
  }

  const prefixIsAddon = typeof prefix === 'string';
  const suffixIsAddon = typeof suffix === 'string';
  const showClear = clearable && !disabled && !readOnly && String(currentValue ?? '').length > 0;
  const isPassword = type === 'password';
  const showReveal = isPassword && revealable && !disabled;
  const resolvedType = isPassword && revealed ? 'text' : type;
  const lead = prefix == null ? 'none' : prefixIsAddon ? 'addon' : 'icon';
  const trail = suffix != null ? (suffixIsAddon ? 'addon' : 'icon') : showClear || showReveal ? 'icon' : 'none';

  return (
    <div
      className={cn(styles.root, className)}
      style={style}
      data-size={size}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-lead={lead}
      data-trail={trail}
    >
      {prefix != null ? (
        <span className={prefixIsAddon ? styles.addon : styles.adornment} data-side="before">
          {prefix}
        </span>
      ) : null}
      <input
        ref={mergeRefs(ref, inputRef)}
        type={resolvedType}
        className={cn(styles.field, inputClassName)}
        value={currentValue}
        onChange={handleChange}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        {...props}
      />
      {showClear ? (
        <button type="button" className={styles.clear} aria-label="Clear" onClick={handleClear}>
          <ClearIcon />
        </button>
      ) : null}
      {showReveal ? (
        <button type="button" className={styles.reveal} aria-label={revealed ? 'Hide password' : 'Show password'} aria-pressed={revealed} onClick={() => setRevealed(v => !v)}>
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      ) : null}
      {suffix != null ? (
        <span className={suffixIsAddon ? styles.addon : styles.adornment} data-side="after">
          {suffix}
        </span>
      ) : null}
    </div>
  );
});

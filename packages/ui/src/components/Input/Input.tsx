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
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M4 4l8 8M12 4l-8 8' />
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
    size = 'md',
    prefix,
    suffix,
    invalid = false,
    clearable = false,
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
  const lead = prefix == null ? 'none' : prefixIsAddon ? 'addon' : 'icon';
  const trail = suffix != null ? (suffixIsAddon ? 'addon' : 'icon') : showClear ? 'icon' : 'none';

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
        <span className={prefixIsAddon ? styles.addon : styles.adornment} data-side='before'>
          {prefix}
        </span>
      ) : null}
      <input
        ref={mergeRefs(ref, inputRef)}
        className={cn(styles.field, inputClassName)}
        value={currentValue}
        onChange={handleChange}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        {...props}
      />
      {showClear ? (
        <button type='button' className={styles.clear} aria-label='Clear' onClick={handleClear}>
          <ClearIcon />
        </button>
      ) : null}
      {suffix != null ? (
        <span className={suffixIsAddon ? styles.addon : styles.adornment} data-side='after'>
          {suffix}
        </span>
      ) : null}
    </div>
  );
});

/**
 * Importing npm packages
 */
import { type ChangeEvent, type ClipboardEvent, forwardRef, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn, mergeRefs } from '@/lib';

import styles from './OtpInput.module.css';
import { type OtpInputProps } from './OtpInput.types';

/**
 * Declaring the constants
 */
const PRESET_PATTERN: Record<'numeric' | 'alphanumeric' | 'alphabetic', RegExp> = {
  numeric: /[0-9]/,
  alphanumeric: /[a-zA-Z0-9]/,
  alphabetic: /[a-zA-Z]/,
};

/**
 * Segmented one-time-code entry. Each character owns a box; typing advances, Backspace retreats,
 * and a paste is distributed across the boxes after filtering to the allowed characters — so
 * copy-pasting a code (with or without separators) lands one character per box. The value stays
 * left-aligned and contiguous; `length` and the allowed set are always known, which is what makes
 * paste distribution deterministic.
 *
 * `className`/`style` and remaining props target the group fieldset; `value`/`onValueChange` are the API.
 */
export const OtpInput = forwardRef<HTMLInputElement, OtpInputProps>(function OtpInput(
  {
    length = 6,
    type = 'numeric',
    allowedPattern,
    value,
    defaultValue = '',
    onValueChange,
    onComplete,
    size = 'md',
    mask = false,
    invalid = false,
    disabled = false,
    readOnly = false,
    autoFocus = false,
    name,
    placeholder = '',
    className,
    'aria-label': ariaLabel = 'Verification code',
    ...rest
  },
  ref,
) {
  const pattern = allowedPattern ?? PRESET_PATTERN[type];
  const sanitize = useCallback(
    (raw: string): string =>
      Array.from(raw)
        .filter(char => pattern.test(char))
        .join(''),
    [pattern],
  );

  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(() => sanitize(defaultValue).slice(0, length));
  const currentValue = (isControlled ? sanitize(value) : uncontrolled).slice(0, length);
  const chars = useMemo(() => Array.from({ length }, (_, index) => currentValue[index] ?? ''), [currentValue, length]);

  const boxesRef = useRef<(HTMLInputElement | null)[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: autoFocus is a mount-only intent, not a live prop
  useEffect(() => {
    if (autoFocus) boxesRef.current[0]?.focus();
  }, []);

  function commit(next: string): void {
    const clipped = next.slice(0, length);
    if (!isControlled) setUncontrolled(clipped);
    onValueChange?.(clipped);
    if (clipped.length === length) onComplete?.(clipped);
  }

  function focusBox(index: number): void {
    const el = boxesRef.current[Math.max(0, Math.min(index, length - 1))];
    el?.focus();
    el?.select();
  }

  /** Place `incoming` starting at `index`, collapse to a contiguous left-aligned string, commit, and return it. */
  function place(index: number, incoming: string): string {
    const next = [...chars];
    let cursor = index;
    for (const char of incoming) {
      if (cursor >= length) break;
      next[cursor] = char;
      cursor += 1;
    }
    const nextValue = next.join('').slice(0, length);
    commit(nextValue);
    return nextValue;
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>): void {
    const typed = sanitize(event.target.value);
    if (!typed) return; // rejected character — React restores the controlled value
    focusBox(place(index, typed).length);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (readOnly || disabled) return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...chars];
      if (next[index]) {
        next[index] = '';
        commit(next.join(''));
      } else if (index > 0) {
        next[index - 1] = '';
        commit(next.join(''));
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      const next = [...chars];
      next[index] = '';
      commit(next.join(''));
      return;
    }
    const jumps: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: length - 1 };
    if (event.key in jumps) {
      event.preventDefault();
      focusBox(jumps[event.key] ?? index);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>): void {
    event.preventDefault();
    if (readOnly || disabled) return;
    const pasted = sanitize(event.clipboardData.getData('text'));
    if (!pasted) return;
    focusBox(place(index, pasted).length);
  }

  return (
    <fieldset className={cn(styles.root, className)} aria-label={ariaLabel} disabled={disabled} data-size={size} data-invalid={invalid || undefined} {...rest}>
      {chars.map((char, index) => (
        <input
          key={index}
          ref={
            index === 0
              ? mergeRefs<HTMLInputElement>(ref, node => {
                  boxesRef.current[0] = node;
                })
              : node => {
                  boxesRef.current[index] = node;
                }
          }
          className={styles.box}
          type={mask ? 'password' : 'text'}
          inputMode={type === 'numeric' ? 'numeric' : 'text'}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={char}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={`${ariaLabel}, character ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          data-filled={char ? '' : undefined}
          onChange={event => handleChange(index, event)}
          onKeyDown={event => handleKeyDown(index, event)}
          onPaste={event => handlePaste(index, event)}
          onFocus={event => event.currentTarget.select()}
        />
      ))}
      {name ? <input type='hidden' name={name} value={currentValue} /> : null}
    </fieldset>
  );
});

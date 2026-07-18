/**
 * Importing npm packages
 */
import { type ChangeEvent, forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn, mergeRefs } from '@/lib';

import styles from './Textarea.module.css';
import { type TextareaProps } from './Textarea.types';

/**
 * Declaring the constants
 */

/** Clamp the element's height to its content between minRows and maxRows, toggling internal scroll. */
function fitToContent(el: HTMLTextAreaElement, minRows: number, maxRows: number): void {
  const style = getComputedStyle(el);
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const verticalBorder = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
  const minHeight = lineHeight * minRows + verticalPadding + verticalBorder;
  const maxHeight = lineHeight * maxRows + verticalPadding + verticalBorder;

  el.style.height = 'auto';
  const contentHeight = el.scrollHeight + verticalBorder;
  const height = Math.min(Math.max(contentHeight, minHeight), maxHeight);
  el.style.height = `${height}px`;
  el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}

/**
 * Multi-line text entry — the Input field surface stretched vertically. Adds only what multi-line
 * requires: row-based height, auto-grow between `minRows`/`maxRows`, and an optional character
 * counter that appears in the last 20% of the limit. Label and error text live in Form Field.
 *
 * `className`/`style` target the wrapper; other props flow to the `<textarea>`.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    size = 'md',
    minRows = 3,
    maxRows = 12,
    autoGrow = true,
    showCount = false,
    invalid = false,
    value,
    defaultValue,
    onChange,
    onValueChange,
    maxLength,
    className,
    style,
    ...props
  },
  ref,
) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => (defaultValue != null ? String(defaultValue) : ''));
  const currentValue = isControlled ? value : uncontrolledValue;

  const resize = useCallback(() => {
    const el = fieldRef.current;
    if (el && autoGrow) fitToContent(el, minRows, maxRows);
  }, [autoGrow, minRows, maxRows]);

  // Re-fit whenever the value or bounds change (covers controlled updates and programmatic resets).
  // currentValue is an intentional re-fit trigger; resize reads the DOM, not the value.
  useEffect(resize, [resize, currentValue]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    if (!isControlled) setUncontrolledValue(event.target.value);
    onValueChange?.(event.target.value);
    onChange?.(event);
    resize();
  }

  const length = String(currentValue ?? '').length;
  const hasCounter = showCount && maxLength != null;
  const nearLimit = maxLength != null && length >= maxLength * 0.8;
  const atLimit = maxLength != null && length >= maxLength;

  const describedBy = [props['aria-describedby'], hasCounter ? counterId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn(styles.root, className)} style={style}>
      <textarea
        ref={mergeRefs(ref, fieldRef)}
        className={styles.field}
        data-size={size}
        data-autogrow={autoGrow ? 'true' : 'false'}
        data-invalid={invalid || undefined}
        rows={minRows}
        value={currentValue}
        maxLength={maxLength}
        onChange={handleChange}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hasCounter ? (
        <div className={styles.counter} id={counterId} data-visible={nearLimit ? 'true' : undefined} data-state={atLimit ? 'limit' : undefined}>
          {length} / {maxLength}
        </div>
      ) : null}
    </div>
  );
});

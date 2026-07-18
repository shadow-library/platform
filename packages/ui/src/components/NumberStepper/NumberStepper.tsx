/**
 * Importing npm packages
 */
import { type ChangeEvent, forwardRef, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { cn } from '@/lib';

import styles from './NumberStepper.module.css';
import { type NumberStepperProps } from './NumberStepper.types';

/**
 * Declaring the constants
 */
const PARTIAL = /^-?\d*\.?\d*$/;

function MinusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M4 8h8" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 4v8M4 8h8" />
    </svg>
  );
}
function ChevronUp() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 10L8 6.5l3.5 3.5" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 6L8 9.5 11.5 6" />
    </svg>
  );
}

/**
 * A numeric field with step buttons for quantities adjusted in small increments (replicas, retries,
 * timeouts). The field is role="spinbutton" with aria-valuenow/min/max (+ aria-valuetext for units);
 * step buttons are labelled but removed from the tab order (arrows in the field do the same job).
 * Non-numeric keystrokes are rejected; out-of-range typed values surface on blur, never silently
 * clamped mid-edit. Holding a step button repeats.
 */
export const NumberStepper = forwardRef<HTMLInputElement, NumberStepperProps>(function NumberStepper(
  {
    value,
    defaultValue = null,
    onValueChange,
    min,
    max,
    step = 1,
    precision,
    unit,
    buttons = 'split',
    size = 'md',
    disabled = false,
    readOnly = false,
    invalid = false,
    itemLabel,
    id,
    className,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const [current, setCurrent] = useControllableState<number | null>({ value, defaultValue, onChange: onValueChange });

  const format = (input: number): string => (precision != null ? input.toFixed(precision) : String(input));
  const [text, setText] = useState(current != null ? format(current) : '');
  const [invalidTyped, setInvalidTyped] = useState(false);
  const holdRef = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});

  // sync the field text from the external value only
  useEffect(() => {
    setText(current != null ? format(current) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync the field text from the external value only; `format` is stable
  }, [current]);

  function clampRound(input: number): number {
    let next = input;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    return precision != null ? Number(next.toFixed(precision)) : next;
  }

  function commit(next: number | null): void {
    setCurrent(next);
    setInvalidTyped(false);
  }

  function stepBy(direction: 1 | -1): void {
    if (disabled || readOnly) return;
    const base = current ?? min ?? 0;
    const next = clampRound(base + direction * step);
    commit(next);
    setText(format(next));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    if (!PARTIAL.test(next)) return;
    setText(next);
    if (next === '' || next === '-' || next === '.' || next === '-.') {
      if (next === '') commit(null);
      return;
    }
    const parsed = Number(next);
    if (!Number.isNaN(parsed)) commit(precision != null ? Number(parsed.toFixed(precision)) : parsed);
  }

  function handleBlur(): void {
    if (text === '' || text === '-' || text === '.' || text === '-.') return;
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      setInvalidTyped(true);
      return;
    }
    const outOfRange = (min != null && parsed < min) || (max != null && parsed > max);
    setInvalidTyped(outOfRange);
  }

  function startHold(direction: 1 | -1): void {
    stepBy(direction);
    holdRef.current.timeout = setTimeout(() => {
      holdRef.current.interval = setInterval(() => stepBy(direction), 100);
    }, 400);
  }
  function stopHold(): void {
    clearTimeout(holdRef.current.timeout);
    clearInterval(holdRef.current.interval);
  }
  useEffect(() => {
    const timers = holdRef.current;
    return () => {
      clearTimeout(timers.timeout);
      clearInterval(timers.interval);
    };
  }, []);

  const atMin = min != null && current != null && current <= min;
  const atMax = max != null && current != null && current >= max;
  const decLabel = `Decrease${itemLabel != null ? ` ${itemLabel}` : ''}`;
  const incLabel = `Increase${itemLabel != null ? ` ${itemLabel}` : ''}`;

  const decButton = (
    <button
      type="button"
      tabIndex={-1}
      className={styles.step}
      aria-label={decLabel}
      disabled={disabled || readOnly || atMin}
      onPointerDown={() => startHold(-1)}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
    >
      {buttons === 'split' ? <MinusIcon /> : <ChevronDown />}
    </button>
  );
  const incButton = (
    <button
      type="button"
      tabIndex={-1}
      className={styles.step}
      aria-label={incLabel}
      disabled={disabled || readOnly || atMax}
      onPointerDown={() => startHold(1)}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
    >
      {buttons === 'split' ? <PlusIcon /> : <ChevronUp />}
    </button>
  );

  return (
    <div
      className={cn(styles.root, className)}
      data-size={size}
      data-buttons={buttons}
      data-invalid={invalid || invalidTyped || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-has-unit={unit != null || undefined}
    >
      {buttons === 'split' ? decButton : null}
      <input
        ref={ref}
        id={id}
        className={styles.input}
        type="text"
        inputMode={precision != null ? 'decimal' : 'numeric'}
        role="spinbutton"
        autoComplete="off"
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-valuenow={current ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={current != null && unit != null ? `${format(current)} ${unit}` : undefined}
        aria-invalid={invalid || invalidTyped || undefined}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {unit != null ? <span className={styles.unit}>{unit}</span> : null}
      {buttons === 'split' ? (
        incButton
      ) : (
        <span className={styles.chevrons}>
          {incButton}
          {decButton}
        </span>
      )}
    </div>
  );
});

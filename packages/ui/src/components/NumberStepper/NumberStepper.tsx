/**
 * Importing npm packages
 */
import { type ChangeEvent, forwardRef, type KeyboardEvent, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState, useIsomorphicLayoutEffect } from '@/hooks';
import { cn } from '@/lib';

import styles from './NumberStepper.module.css';
import { type NumberStepperProps } from './NumberStepper.types';

/**
 * Declaring the constants
 */
const PARTIAL = /^-?\d*\.?\d*$/;

function decimalsOf(input: number): number {
  return String(input).split('.')[1]?.length ?? 0;
}

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
 * step buttons are labelled but removed from the tab order (ArrowUp/ArrowDown in the field do the same job).
 * Non-numeric keystrokes are rejected; typed values are clamped to the range on blur (unless `clampOnBlur` is off), never mid-edit.
 * Holding a step button repeats from the latest value until the bound.
 */
export const NumberStepper = forwardRef<HTMLInputElement, NumberStepperProps>(function NumberStepper(
  {
    value,
    defaultValue = null,
    onValueChange,
    min,
    max,
    step = 1,
    startValue,
    clampOnBlur = true,
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
    'aria-describedby': ariaDescribedBy,
  },
  ref,
) {
  const [current, setCurrent] = useControllableState<number | null>({ value, defaultValue, onChange: onValueChange });

  const format = (input: number): string => (precision != null ? input.toFixed(precision) : String(input));
  const [text, setText] = useState(current != null ? format(current) : '');
  const [editing, setEditing] = useState(false);
  const holdRef = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});

  const [syncedValue, setSyncedValue] = useState(current);
  if (syncedValue !== current) {
    setSyncedValue(current);
    if (!editing) setText(current != null ? format(current) : '');
  }

  function clampRound(input: number): number {
    let next = input;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    return precision != null ? Number(next.toFixed(precision)) : next;
  }

  function commit(next: number | null): void {
    if (next !== current) setCurrent(next);
  }

  function stopHold(): void {
    clearTimeout(holdRef.current.timeout);
    clearInterval(holdRef.current.interval);
  }

  function stepBy(direction: 1 | -1): void {
    if (disabled || readOnly) return stopHold();
    const base = current ?? min ?? 0;
    const decimals = precision ?? Math.max(decimalsOf(step), decimalsOf(base));
    const next = current == null && startValue != null ? clampRound(startValue) : clampRound(Number((base + direction * step).toFixed(decimals)));
    commit(next);
    setText(format(next));
    setEditing(false);
    const bound = direction > 0 ? max : min;
    if (bound != null && next === bound) stopHold();
  }
  const latestStepBy = useRef(stepBy);
  useIsomorphicLayoutEffect(() => {
    latestStepBy.current = stepBy;
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    if (!PARTIAL.test(next)) return;
    setText(next);
    setEditing(true);
    if (next === '-' || next === '.' || next === '-.') return;
    const parsed = next === '' ? null : Number(next);
    if (Number.isNaN(parsed)) return;
    commit(parsed != null && precision != null ? Number(parsed.toFixed(precision)) : parsed);
  }

  function handleBlur(): void {
    setEditing(false);
    if (!editing || disabled || readOnly) return setText(current != null ? format(current) : '');
    const parsed = text === '' ? Number.NaN : Number(text);
    if (Number.isNaN(parsed)) return setText(current != null ? format(current) : '');
    if (!clampOnBlur) return;
    const next = clampRound(parsed);
    commit(next);
    setText(format(next));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    stepBy(event.key === 'ArrowUp' ? 1 : -1);
  }

  function startHold(direction: 1 | -1): void {
    stepBy(direction);
    holdRef.current.timeout = setTimeout(() => {
      holdRef.current.interval = setInterval(() => latestStepBy.current(direction), 100);
    }, 400);
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
      onPointerCancel={stopHold}
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
      onPointerCancel={stopHold}
    >
      {buttons === 'split' ? <PlusIcon /> : <ChevronUp />}
    </button>
  );

  return (
    <div
      className={cn(styles.root, className)}
      data-size={size}
      data-buttons={buttons}
      data-invalid={invalid || undefined}
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
        aria-describedby={ariaDescribedBy}
        aria-valuenow={current ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={current != null && unit != null ? `${format(current)} ${unit}` : undefined}
        aria-invalid={invalid || undefined}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
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

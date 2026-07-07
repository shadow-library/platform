/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn, pad2 } from '@/lib';

import styles from './TimePicker.module.css';
import { type TimePickerProps } from './TimePicker.types';

/**
 * Declaring the constants
 */
function toMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h > 23 || m > 59 ? null : h * 60 + m;
}
function toHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}
function formatMinutes(minutes: number, hour12: boolean): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!hour12) return `${pad2(h)}:${pad2(m)}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

/** Loosely parse "9:30", "930", "9.30pm", "21:30" to minutes of day, or null. */
function parseTime(input: string): number | null {
  const clean = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!clean) return null;
  const periodMatch = /(am|pm|a|p)$/.exec(clean);
  const period = periodMatch?.[1]?.[0] ?? null;
  const core = (periodMatch ? clean.slice(0, periodMatch.index) : clean).replace(/[:.]/g, '');
  if (!/^\d{1,4}$/.test(core)) return null;
  let h: number;
  let m: number;
  if (core.length <= 2) {
    h = Number(core);
    m = 0;
  } else if (core.length === 3) {
    h = Number(core.slice(0, 1));
    m = Number(core.slice(1));
  } else {
    h = Number(core.slice(0, 2));
    m = Number(core.slice(2));
  }
  if (period === 'p' && h < 12) h += 12;
  if (period === 'a' && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function ClockIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='8' cy='8' r='6' />
      <path d='M8 4.5V8l2.5 1.5' />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3 8.5l3.5 3.5L13 5' />
    </svg>
  );
}

/**
 * A time field with a suggestion menu, on 24-hour `HH:MM` strings at the API boundary. Typing is the
 * accessible fast path — loose input ("930", "9.30pm", "21:30") parses on blur, out-of-range/invalid
 * surfaces then, and the field reverts rather than storing an impossible value. The suggestion list
 * follows Combobox's listbox pattern. (Segmented spinbuttons are a future enhancement.)
 */
export function TimePicker({
  value,
  defaultValue = null,
  onValueChange,
  min,
  max,
  step = 30,
  hour12 = true,
  size = 'md',
  disabled = false,
  readOnly = false,
  invalid = false,
  placeholder,
  id,
  className,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string | null>(defaultValue);
  const currentValue = isControlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [invalidTyped, setInvalidTyped] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const minMinutes = min ? toMinutes(min) : null;
  const maxMinutes = max ? toMinutes(max) : null;

  const options = useMemo(() => {
    const start = minMinutes ?? 0;
    const end = maxMinutes ?? 24 * 60 - 1;
    const list: number[] = [];
    for (let minutes = start; minutes <= end; minutes += step) list.push(minutes);
    return list;
  }, [minMinutes, maxMinutes, step]);

  // Reflect committed value into the field text.
  useEffect(() => {
    const minutes = currentValue ? toMinutes(currentValue) : null;
    setText(minutes != null ? formatMinutes(minutes, hour12) : '');
  }, [currentValue, hour12]);

  function commit(next: string | null): void {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
    setInvalidTyped(false);
  }

  function selectMinutes(minutes: number): void {
    commit(toHHMM(minutes));
    setText(formatMinutes(minutes, hour12));
    setOpen(false);
  }

  function revertText(): void {
    const fallback = currentValue ? toMinutes(currentValue) : null;
    setText(fallback != null ? formatMinutes(fallback, hour12) : '');
  }

  function handleBlur(): void {
    if (text.trim() === '') {
      commit(null);
      return;
    }
    const minutes = parseTime(text);
    if (minutes == null) {
      // Unparseable input is rejected, field left unchanged.
      revertText();
      setInvalidTyped(false);
      return;
    }
    if ((minMinutes != null && minutes < minMinutes) || (maxMinutes != null && minutes > maxMinutes)) {
      revertText();
      setInvalidTyped(true);
      return;
    }
    commit(toHHMM(minutes));
    setText(formatMinutes(minutes, hour12));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActiveIndex(index => Math.min(options.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const minutes = options[activeIndex];
      if (minutes != null) selectMinutes(minutes);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const currentMinutes = currentValue ? toMinutes(currentValue) : null;
  const activeId = open && options.length > 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <Popover.Root open={open} onOpenChange={next => !disabled && !readOnly && setOpen(next)}>
      <Popover.Anchor asChild>
        <div
          className={cn(styles.field, className)}
          data-size={size}
          data-invalid={invalid || invalidTyped || undefined}
          data-disabled={disabled || undefined}
          data-readonly={readOnly || undefined}
        >
          <input
            ref={inputRef}
            id={id}
            className={styles.input}
            type='text'
            role='combobox'
            autoComplete='off'
            spellCheck={false}
            placeholder={placeholder ?? (hour12 ? '--:-- --' : '--:--')}
            value={text}
            disabled={disabled}
            readOnly={readOnly}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete='none'
            aria-activedescendant={activeId}
            aria-invalid={invalid || invalidTyped || undefined}
            aria-label={ariaLabel}
            onChange={event => setText(event.target.value)}
            onFocus={() => !disabled && !readOnly && setOpen(true)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <Popover.Trigger asChild>
            <button type='button' className={styles.trigger} aria-label='Choose time' disabled={disabled || readOnly} tabIndex={-1}>
              <ClockIcon />
            </button>
          </Popover.Trigger>
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content className={styles.content} align='start' sideOffset={4} onOpenAutoFocus={event => event.preventDefault()}>
          <div id={listId} role='listbox' aria-label='Times' className={styles.list}>
            {options.map((minutes, index) => {
              const selected = currentMinutes === minutes;
              return (
                // biome-ignore lint/a11y/useFocusableInteractive: virtual option (aria-activedescendant); focus stays in the field
                // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the field input
                <div
                  key={minutes}
                  id={`${listId}-opt-${index}`}
                  role='option'
                  aria-selected={selected}
                  className={styles.option}
                  data-active={activeIndex === index || undefined}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => selectMinutes(minutes)}
                >
                  <span>{formatMinutes(minutes, hour12)}</span>
                  <span className={styles.check}>{selected ? <CheckIcon /> : null}</span>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

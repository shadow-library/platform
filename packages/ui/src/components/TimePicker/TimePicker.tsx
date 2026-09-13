/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { type KeyboardEvent, type PointerEvent, type ReactElement, useCallback, useId, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { CheckIcon } from '@/icons';
import { cn, pad2 } from '@/lib';

import styles from './TimePicker.module.css';
import { type TimePickerProps } from './TimePicker.types';

/**
 * Defining types
 */
type Interaction = 'idle' | 'typed' | 'navigated';

interface ClockParts {
  hours: number;
  minutes: number;
}

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

function displayText(value: string | null, hour12: boolean): string {
  const minutes = value ? toMinutes(value) : null;
  return minutes != null ? formatMinutes(minutes, hour12) : '';
}

function splitClock(core: string): ClockParts | null {
  const separated = /^(\d{1,2})[:.](\d{2})?$/.exec(core);
  if (separated) return { hours: Number(separated[1]), minutes: Number(separated[2] ?? 0) };
  if (!/^\d{1,4}$/.test(core)) return null;
  if (core.length <= 2) return { hours: Number(core), minutes: 0 };
  const split = core.length - 2;
  return { hours: Number(core.slice(0, split)), minutes: Number(core.slice(split)) };
}

/** Loosely parse "9:30", "930", "9.30pm", "21:30" to minutes of day, or null. */
function parseTime(input: string): number | null {
  const clean = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!clean) return null;
  const periodMatch = /(am|pm|a|p)$/.exec(clean);
  const period = periodMatch?.[1]?.[0] ?? null;
  const clock = splitClock(periodMatch ? clean.slice(0, periodMatch.index) : clean);
  if (!clock) return null;
  let { hours } = clock;
  if (period === 'p' && hours < 12) hours += 12;
  if (period === 'a' && hours === 12) hours = 0;
  if (hours > 23 || clock.minutes > 59) return null;
  return hours * 60 + clock.minutes;
}

function nearestIndex(options: number[], minutes: number | null): number {
  if (minutes == null) return 0;
  return options.reduce((best, option, index) => (Math.abs(option - minutes) < Math.abs((options[best] ?? option) - minutes) ? index : best), 0);
}

/** Scrolls only the list: `scrollIntoView` would also scroll the page and a Dialog body while the popper is still unpositioned. */
function scrollOptionIntoView(option: Element | null | undefined, block: 'center' | 'nearest'): void {
  const list = option?.parentElement;
  if (!(option instanceof HTMLElement) || !list) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (block === 'center') {
    list.scrollTop = top - (list.clientHeight - option.offsetHeight) / 2;
    return;
  }
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

/**
 * A time field with a suggestion menu, on 24-hour `HH:MM` strings at the API boundary. Typing is the
 * accessible fast path — loose input ("930", "9.30pm", "21:30") parses on blur or Enter, out-of-range/invalid
 * surfaces then, and the field reverts rather than storing an impossible value. The suggestion list
 * follows Combobox's listbox pattern: it opens on the current value, arrows move the highlight, and Enter
 * picks the highlighted time only after arrow navigation — otherwise it keeps what was typed.
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
}: TimePickerProps): ReactElement {
  const [currentValue, setCurrentValue] = useControllableState<string | null>({ value, defaultValue, onChange: onValueChange });

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => displayText(currentValue, hour12));
  const [invalidTyped, setInvalidTyped] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [interaction, setInteraction] = useState<Interaction>('idle');
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [emitted, setEmitted] = useState(currentValue);
  const triggerPointerRef = useRef<PointerEvent['pointerType']>('mouse');
  const listId = useId();
  const interactive = !disabled && !readOnly;

  const minMinutes = min ? toMinutes(min) : null;
  const maxMinutes = max ? toMinutes(max) : null;
  const currentMinutes = currentValue ? toMinutes(currentValue) : null;

  const options = useMemo(() => {
    const start = minMinutes ?? 0;
    const end = maxMinutes ?? 24 * 60 - 1;
    const list: number[] = [];
    for (let minutes = start; minutes <= end; minutes += step) list.push(minutes);
    return list;
  }, [minMinutes, maxMinutes, step]);

  const [synced, setSynced] = useState({ value: currentValue, hour12 });
  if (synced.value !== currentValue || synced.hour12 !== hour12) {
    setSynced({ value: currentValue, hour12 });
    setEmitted(currentValue);
    setText(displayText(currentValue, hour12));
  }

  const attachList = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    if (node) scrollOptionIntoView(node.querySelector('[data-active]'), 'center');
  }, []);

  const isInsideField = (target: EventTarget | null): boolean => target instanceof Node && (fieldRef.current?.contains(target) ?? false);

  function highlight(index: number, block: 'center' | 'nearest'): void {
    setActiveIndex(index);
    scrollOptionIntoView(listRef.current?.children[index], block);
  }

  function openList(): void {
    if (!interactive) return;
    const typed = interaction === 'typed' ? parseTime(text) : null;
    setActiveIndex(nearestIndex(options, typed ?? currentMinutes));
    setOpen(true);
  }

  function commit(next: string | null): void {
    setInvalidTyped(false);
    setInteraction('idle');
    if (next === emitted) return;
    setEmitted(next);
    setCurrentValue(next);
  }

  function revert(outOfRange: boolean): void {
    setText(displayText(currentValue, hour12));
    setInvalidTyped(outOfRange);
    setInteraction('idle');
  }

  function selectMinutes(minutes: number): void {
    commit(toHHMM(minutes));
    setText(formatMinutes(minutes, hour12));
    setOpen(false);
  }

  function commitText(): void {
    if (text.trim() === '') return commit(null);
    const minutes = parseTime(text);
    if (minutes == null) return revert(false);
    if ((minMinutes != null && minutes < minMinutes) || (maxMinutes != null && minutes > maxMinutes)) return revert(true);
    commit(toHHMM(minutes));
    setText(formatMinutes(minutes, hour12));
  }

  function handleChange(next: string): void {
    setText(next);
    setInteraction('typed');
    const minutes = parseTime(next);
    if (!open) {
      setActiveIndex(nearestIndex(options, minutes ?? currentMinutes));
      setOpen(true);
      return;
    }
    if (minutes != null) highlight(nearestIndex(options, minutes), 'nearest');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!interactive) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      highlight(Math.min(options.length - 1, Math.max(0, activeIndex + delta)), 'nearest');
      setInteraction('navigated');
      return;
    }
    if (event.key === 'Enter') {
      if (!open && interaction !== 'typed') return;
      event.preventDefault();
      const highlighted = options[activeIndex];
      if (interaction === 'navigated' && highlighted != null) return selectMinutes(highlighted);
      commitText();
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const activeId = open && options.length > 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          ref={fieldRef}
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
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder ?? (hour12 ? '--:-- --' : '--:--')}
            value={text}
            disabled={disabled}
            readOnly={readOnly}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="none"
            aria-activedescendant={activeId}
            aria-invalid={invalid || invalidTyped || undefined}
            aria-label={ariaLabel}
            onChange={event => handleChange(event.target.value)}
            onFocus={openList}
            onKeyDown={handleKeyDown}
            onBlur={commitText}
          />
          <button
            type="button"
            className={styles.trigger}
            aria-label="Choose time"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            disabled={!interactive}
            tabIndex={-1}
            onPointerDown={event => {
              event.preventDefault();
              triggerPointerRef.current = event.pointerType;
            }}
            onClick={() => {
              if (open) return setOpen(false);
              // A focused input raises the on-screen keyboard over the list on touch devices.
              if (triggerPointerRef.current !== 'touch') inputRef.current?.focus();
              openList();
            }}
          >
            <ClockIcon />
          </button>
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          className={styles.content}
          align="start"
          sideOffset={4}
          onOpenAutoFocus={event => event.preventDefault()}
          onPointerDownOutside={event => {
            if (isInsideField(event.detail.originalEvent.target)) event.preventDefault();
          }}
          onFocusOutside={event => {
            if (isInsideField(event.detail.originalEvent.target)) event.preventDefault();
          }}
        >
          <div ref={attachList} id={listId} role="listbox" aria-label="Times" className={styles.list}>
            {options.map((minutes, index) => {
              const selected = currentMinutes === minutes;
              return (
                // virtual option (aria-activedescendant); focus stays in the field
                // keyboard is handled on the field input
                <div
                  key={minutes}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={selected}
                  className={styles.option}
                  data-active={activeIndex === index || undefined}
                  onPointerMove={() => setActiveIndex(index)}
                  onPointerDown={event => event.preventDefault()}
                  onClick={() => selectMinutes(minutes)}
                >
                  <span>{formatMinutes(minutes, hour12)}</span>
                  <span className={styles.check}>{selected ? <CheckIcon strokeWidth={2.5} /> : null}</span>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

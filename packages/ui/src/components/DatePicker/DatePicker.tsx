/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { addDays, addMonths, buildMonthMatrix, cn, formatLongDate, isSameDay, parseISODate, startOfMonth, toISODate } from '@/lib';

import { Input } from '../Input';
import styles from './DatePicker.module.css';
import { type DatePickerProps } from './DatePicker.types';

/**
 * Declaring the constants
 */
function CalendarIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='2.5' y='3' width='11' height='10.5' rx='1.5' />
      <path d='M2.5 6h11M5.5 1.5v3M10.5 1.5v3' />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M10 4L6 8l4 4' />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6 4l4 4-4 4' />
    </svg>
  );
}

function weekdayLabels(weekStartsOn: number): string[] {
  const base = new Date(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, index) => addDays(base, (weekStartsOn + index) % 7).toLocaleDateString(undefined, { weekday: 'short' }));
}

/**
 * A date field with a calendar popover, on ISO strings (YYYY-MM-DD) at the API boundary. Typing is the
 * accessible fast path — the field parses live and the calendar follows; the grid is an aid, never a
 * gate. The open calendar is a role="dialog" grid with roving-tabindex day cells labeled in full, day
 * states mapped to tokens (today border-accent, selected accent fill, disabled dimmed). Built on
 * Popover + Input.
 */
export function DatePicker({
  value,
  defaultValue = null,
  onValueChange,
  min,
  max,
  disabledDates,
  size = 'md',
  placeholder = 'YYYY-MM-DD',
  disabled = false,
  readOnly = false,
  invalid = false,
  clearable = true,
  weekStartsOn = 0,
  id,
  className,
  prefix,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue);
  const currentValue = isControlled ? value : internalValue;
  const selectedDate = currentValue ? parseISODate(currentValue) : null;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(currentValue ?? '');
  const [invalidTyped, setInvalidTyped] = useState(false);
  const [viewDate, setViewDate] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const [focusedDate, setFocusedDate] = useState(() => selectedDate ?? new Date());

  const dayRefs = useRef(new Map<string, HTMLButtonElement>());

  const minDate = min ? parseISODate(min) : null;
  const maxDate = max ? parseISODate(max) : null;
  const blackout = useMemo(() => new Set(disabledDates ?? []), [disabledDates]);

  // Reflect external value changes into the field and view.
  useEffect(() => {
    setText(currentValue ?? '');
    const parsed = currentValue ? parseISODate(currentValue) : null;
    if (parsed) {
      setViewDate(startOfMonth(parsed));
      setFocusedDate(parsed);
    }
  }, [currentValue]);

  // Move DOM focus to the roving day while the calendar is open.
  useEffect(() => {
    if (!open) return;
    dayRefs.current.get(toISODate(focusedDate))?.focus();
  }, [open, focusedDate]);

  function isDisabled(date: Date): boolean {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return blackout.has(toISODate(date));
  }

  function commit(next: string | null): void {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
    setInvalidTyped(false);
  }

  function selectDate(date: Date): void {
    if (isDisabled(date)) return;
    const iso = toISODate(date);
    commit(iso);
    setText(iso);
    setFocusedDate(date);
    setOpen(false);
  }

  function handleType(next: string): void {
    setText(next);
    const parsed = parseISODate(next);
    if (parsed) {
      setViewDate(startOfMonth(parsed));
      setFocusedDate(parsed);
    }
  }

  function handleBlur(): void {
    if (text.trim() === '') {
      commit(null);
      return;
    }
    const parsed = parseISODate(text);
    if (parsed && !isDisabled(parsed)) commit(toISODate(parsed));
    else setInvalidTyped(true);
  }

  function moveFocus(date: Date): void {
    setFocusedDate(date);
    if (date.getMonth() !== viewDate.getMonth() || date.getFullYear() !== viewDate.getFullYear()) setViewDate(startOfMonth(date));
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const key = event.key;
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (key in moves) {
      event.preventDefault();
      moveFocus(addDays(focusedDate, moves[key] ?? 0));
    } else if (key === 'Home') {
      event.preventDefault();
      moveFocus(addDays(focusedDate, -((focusedDate.getDay() - weekStartsOn + 7) % 7)));
    } else if (key === 'End') {
      event.preventDefault();
      moveFocus(addDays(focusedDate, 6 - ((focusedDate.getDay() - weekStartsOn + 7) % 7)));
    } else if (key === 'PageUp') {
      event.preventDefault();
      moveFocus(addMonths(focusedDate, -1));
    } else if (key === 'PageDown') {
      event.preventDefault();
      moveFocus(addMonths(focusedDate, 1));
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      selectDate(focusedDate);
    }
  }

  const weeks = buildMonthMatrix(viewDate.getFullYear(), viewDate.getMonth(), weekStartsOn);
  const weekdays = weekdayLabels(weekStartsOn);
  const today = new Date();
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        if (disabled || readOnly) return;
        setOpen(next);
        if (next) setFocusedDate(selectedDate ?? new Date());
      }}
    >
      <Popover.Anchor asChild>
        <div className={cn(styles.fieldWrap, className)}>
          <Input
            id={id}
            size={size}
            value={text}
            prefix={prefix}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            invalid={invalid || invalidTyped}
            clearable={clearable}
            inputMode='numeric'
            autoComplete='off'
            aria-label={ariaLabel}
            aria-haspopup='dialog'
            aria-expanded={open}
            onValueChange={next => {
              if (next === '') commit(null);
              handleType(next);
            }}
            onBlur={handleBlur}
            suffix={
              <Popover.Trigger asChild>
                <button type='button' className={styles.trigger} aria-label='Open calendar' disabled={disabled || readOnly}>
                  <CalendarIcon />
                </button>
              </Popover.Trigger>
            }
          />
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content className={styles.content} align='start' sideOffset={4} role='dialog' aria-label='Choose date' onOpenAutoFocus={event => event.preventDefault()}>
          <div className={styles.header}>
            <button type='button' className={styles.navButton} aria-label='Previous month' onClick={() => setViewDate(addMonths(viewDate, -1))}>
              <ChevronLeft />
            </button>
            <span className={styles.monthLabel} aria-live='polite'>
              {monthLabel}
            </span>
            <button type='button' className={styles.navButton} aria-label='Next month' onClick={() => setViewDate(addMonths(viewDate, 1))}>
              <ChevronRight />
            </button>
          </div>

          {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <table role="grid"> is the WAI-ARIA date-grid pattern; roving-tabindex day buttons are the interactive cells */}
          <table role='grid' className={styles.grid} aria-label={monthLabel} onKeyDown={handleGridKeyDown}>
            <thead>
              <tr>
                {weekdays.map(day => (
                  <th key={day} scope='col' className={styles.weekday}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map(week => (
                <tr key={toISODate(week[0] ?? viewDate)}>
                  {week.map(day => {
                    const iso = toISODate(day);
                    const outside = day.getMonth() !== viewDate.getMonth();
                    const dayDisabled = isDisabled(day);
                    const selected = selectedDate != null && isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, today);
                    const isFocusTarget = isSameDay(day, focusedDate);
                    return (
                      <td key={iso} className={styles.cell}>
                        <button
                          ref={node => {
                            if (node) dayRefs.current.set(iso, node);
                            else dayRefs.current.delete(iso);
                          }}
                          type='button'
                          className={styles.day}
                          data-date={iso}
                          data-outside={outside || undefined}
                          data-today={isToday || undefined}
                          data-selected={selected || undefined}
                          tabIndex={isFocusTarget ? 0 : -1}
                          disabled={dayDisabled}
                          aria-label={`${formatLongDate(day)}${selected ? ', selected' : ''}`}
                          aria-current={isToday ? 'date' : undefined}
                          onClick={() => selectDate(day)}
                        >
                          {day.getDate()}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.footer}>
            <button type='button' className={styles.today} onClick={() => selectDate(today)} disabled={isDisabled(today)}>
              Today
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

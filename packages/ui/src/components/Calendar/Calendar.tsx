/**
 * Importing npm packages
 */
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { addDays, addMonths, buildMonthMatrix, cn, formatLongDate, isSameDay, parseISODate, startOfMonth, toISODate } from '@/lib';

import styles from './Calendar.module.css';
import { type CalendarProps, type CalendarValue, type DateRange } from './Calendar.types';

/**
 * Declaring the constants
 */
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
  const base = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, index) => addDays(base, (weekStartsOn + index) % 7).toLocaleDateString(undefined, { weekday: 'narrow' }));
}

function asRange(value: CalendarValue | undefined): DateRange {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return { start: null, end: null };
}

/**
 * An inline ARIA grid of dates with a roving day cursor (arrows cross month boundaries, turning the
 * page — one continuous plane of days). Single, multiple, and range selection on ISO strings; range
 * clicks before the start swap roles so users are never scolded for clicking backwards. Reuses the
 * shared date helpers and the Date Picker's day-state tokens.
 */
export function Calendar({
  mode = 'single',
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  disabledDates,
  months = 1,
  showOutsideDays,
  weekStartsOn = 0,
  className,
  'aria-label': ariaLabel = 'Calendar',
}: CalendarProps) {
  // Multi-month views hide adjacent-month days by default so a boundary date never appears in both grids.
  const renderOutsideDays = showOutsideDays ?? months === 1;
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<CalendarValue>(defaultValue ?? (mode === 'multiple' ? [] : mode === 'range' ? { start: null, end: null } : null));
  const current = isControlled ? value : internal;

  const firstSelected = useMemo(() => {
    if (mode === 'single' && typeof current === 'string') return parseISODate(current);
    if (mode === 'multiple' && Array.isArray(current) && current[0]) return parseISODate(current[0]);
    if (mode === 'range') {
      const range = asRange(current);
      if (range.start) return parseISODate(range.start);
    }
    return null;
  }, [current, mode]);

  const [viewDate, setViewDate] = useState(() => startOfMonth(firstSelected ?? new Date()));
  const [focusedDate, setFocusedDate] = useState(() => firstSelected ?? new Date());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldFocus = useRef(false);

  const minDate = min ? parseISODate(min) : null;
  const maxDate = max ? parseISODate(max) : null;
  const blackout = useMemo(() => new Set(disabledDates ?? []), [disabledDates]);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    dayRefs.current.get(toISODate(focusedDate))?.focus();
  }, [focusedDate]);

  function isDisabled(date: Date): boolean {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return blackout.has(toISODate(date));
  }

  function commit(next: CalendarValue): void {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
  }

  function selectDate(date: Date): void {
    if (isDisabled(date)) return;
    const iso = toISODate(date);
    if (mode === 'single') {
      commit(iso);
    } else if (mode === 'multiple') {
      const list = Array.isArray(current) ? current : [];
      commit(list.includes(iso) ? list.filter(entry => entry !== iso) : [...list, iso]);
    } else {
      const range = asRange(current);
      if (!range.start || range.end) {
        commit({ start: iso, end: null });
      } else {
        const start = parseISODate(range.start);
        if (start && date < start) commit({ start: iso, end: range.start });
        else commit({ start: range.start, end: iso });
      }
    }
  }

  function moveFocus(date: Date): void {
    shouldFocus.current = true;
    setFocusedDate(date);
    if (date.getMonth() !== viewDate.getMonth() || date.getFullYear() !== viewDate.getFullYear()) setViewDate(startOfMonth(date));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(addDays(focusedDate, moves[event.key] ?? 0));
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      moveFocus(addMonths(focusedDate, -1));
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      moveFocus(addMonths(focusedDate, 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDate(focusedDate);
    }
  }

  const range = asRange(current);
  const rangeStart = range.start ? parseISODate(range.start) : null;
  const rangeEnd = range.end ? parseISODate(range.end) : null;
  const multipleSet = new Set(Array.isArray(current) ? current : []);

  function isSelected(date: Date): boolean {
    const iso = toISODate(date);
    if (mode === 'single') return current === iso;
    if (mode === 'multiple') return multipleSet.has(iso);
    return (rangeStart != null && isSameDay(date, rangeStart)) || (rangeEnd != null && isSameDay(date, rangeEnd));
  }

  function inRange(date: Date): boolean {
    if (mode !== 'range' || !rangeStart) return false;
    const end = rangeEnd ?? (hoverDate && !rangeEnd ? hoverDate : null);
    if (!end) return false;
    const lo = rangeStart < end ? rangeStart : end;
    const hi = rangeStart < end ? end : rangeStart;
    return date > lo && date < hi;
  }

  // The trailing/leading half-band the endpoint cell paints so its pill connects to the in-range strip.
  function rangeEdge(date: Date): 'start' | 'end' | undefined {
    if (mode !== 'range' || !rangeStart) return undefined;
    const end = rangeEnd ?? (hoverDate && !rangeEnd ? hoverDate : null);
    if (!end) return undefined;
    const lo = rangeStart < end ? rangeStart : end;
    const hi = rangeStart < end ? end : rangeStart;
    if (isSameDay(lo, hi)) return undefined;
    if (isSameDay(date, lo)) return 'start';
    if (isSameDay(date, hi)) return 'end';
    return undefined;
  }

  const weekdays = weekdayLabels(weekStartsOn);
  const today = new Date();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard grid navigation is handled here and delegated to the day buttons
    <div className={cn(styles.root, className)} onKeyDown={handleKeyDown}>
      <div className={styles.months} data-count={months}>
        {Array.from({ length: months }, (_, offset) => {
          const monthDate = addMonths(viewDate, offset);
          const weeks = buildMonthMatrix(monthDate.getFullYear(), monthDate.getMonth(), weekStartsOn);
          const monthLabel = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
          return (
            <div key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`} className={styles.month}>
              <div className={styles.header}>
                {offset === 0 ? (
                  <button type='button' className={styles.nav} aria-label='Previous month' onClick={() => setViewDate(addMonths(viewDate, -1))}>
                    <ChevronLeft />
                  </button>
                ) : (
                  <span className={styles.navSpacer} />
                )}
                <span className={styles.monthLabel} aria-live='polite'>
                  {monthLabel}
                </span>
                {offset === months - 1 ? (
                  <button type='button' className={styles.nav} aria-label='Next month' onClick={() => setViewDate(addMonths(viewDate, 1))}>
                    <ChevronRight />
                  </button>
                ) : (
                  <span className={styles.navSpacer} />
                )}
              </div>
              {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <table role="grid"> is the WAI-ARIA date-grid pattern; roving-tabindex day buttons are the interactive cells */}
              <table className={styles.grid} role='grid' aria-label={`${ariaLabel}, ${monthLabel}`}>
                <thead>
                  <tr>
                    {weekdays.map((day, index) => (
                      <th key={`${day}-${index}`} scope='col' className={styles.weekday}>
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map(week => (
                    <tr key={toISODate(week[0] ?? monthDate)}>
                      {week.map(day => {
                        const iso = toISODate(day);
                        const outside = day.getMonth() !== monthDate.getMonth();
                        if (outside && !renderOutsideDays) return <td key={iso} className={styles.cell} aria-hidden='true' />;
                        const dayDisabled = isDisabled(day);
                        const selected = isSelected(day);
                        const within = inRange(day);
                        const edge = rangeEdge(day);
                        const isToday = isSameDay(day, today);
                        return (
                          <td key={iso} className={styles.cell} data-in-range={within || undefined} data-range-edge={edge}>
                            <button
                              ref={node => {
                                if (node) dayRefs.current.set(iso, node);
                                else dayRefs.current.delete(iso);
                              }}
                              type='button'
                              className={styles.day}
                              data-outside={outside || undefined}
                              data-today={isToday || undefined}
                              data-selected={selected || undefined}
                              data-in-range={within || undefined}
                              tabIndex={!outside && isSameDay(day, focusedDate) ? 0 : -1}
                              disabled={dayDisabled}
                              aria-label={`${formatLongDate(day)}${selected ? ', selected' : ''}`}
                              aria-current={isToday ? 'date' : undefined}
                              onClick={() => selectDate(day)}
                              onPointerEnter={() => setHoverDate(day)}
                              onPointerLeave={() => setHoverDate(current => (current && isSameDay(current, day) ? null : current))}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { cn, DEFAULT_LOCALE, parseISODate } from '@/lib';

import { Button } from '../Button';
import { Calendar, type DateRange } from '../Calendar';
import styles from './DateRangePicker.module.css';
import { type DateRangePickerProps } from './DateRangePicker.types';

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

function formatShort(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = parseISODate(iso);
  return date ? date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.start === b.start && a.end === b.end;
}

/**
 * A range field + preset rail + two-month Calendar, on `{ start, end }` ISO strings. Grid picking is
 * Calendar's range grammar (click start, click end, backwards clicks swap — the value shape can't
 * represent an invalid range). Presets store the rule and highlight on reopen; any manual edit flips
 * the rail to Custom. `confirm` mode defers commit until Apply for query-expensive dashboards.
 */
export function DateRangePicker({
  value,
  defaultValue,
  onValueChange,
  presets = [],
  months = 2,
  min,
  max,
  confirm = false,
  size = 'md',
  disabled = false,
  placeholder = 'Select dates',
  locale = DEFAULT_LOCALE,
  id,
  className,
  'aria-label': ariaLabel,
}: DateRangePickerProps) {
  const [current, setCurrent] = useControllableState<DateRange>({ value, defaultValue: defaultValue ?? { start: null, end: null }, onChange: onValueChange });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(current);

  function commit(next: DateRange): void {
    setCurrent(next);
  }

  function handleOpenChange(next: boolean): void {
    if (disabled) return;
    setOpen(next);
    if (next) setDraft(current);
  }

  function handleCalendarChange(next: DateRange): void {
    setDraft(next);
    if (!confirm) commit(next);
  }

  function applyPreset(range: DateRange): void {
    setDraft(range);
    if (!confirm) {
      commit(range);
      setOpen(false);
    }
  }

  const displayStart = formatShort(current.start, locale);
  const displayEnd = formatShort(current.end, locale);
  const display = displayStart ? (displayEnd ? `${displayStart} – ${displayEnd}` : `${displayStart} – …`) : null;
  const activePreset = presets.find(preset => sameRange(preset.range, current));

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type='button'
          id={id}
          className={cn(styles.field, className)}
          data-size={size}
          data-empty={display == null || undefined}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup='dialog'
        >
          <span className={styles.value}>{display ?? placeholder}</span>
          <span className={styles.icon}>
            <CalendarIcon />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={styles.content} align='start' sideOffset={4} role='dialog' aria-label='Choose date range'>
          <div className={styles.body}>
            {presets.length > 0 ? (
              <div className={styles.rail} role='listbox' aria-label='Presets'>
                {presets.map(preset => {
                  const selected = activePreset?.label === preset.label;
                  return (
                    <button
                      key={preset.label}
                      type='button'
                      role='option'
                      aria-selected={selected}
                      className={styles.preset}
                      data-selected={selected || undefined}
                      onClick={() => applyPreset(preset.range)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <Calendar
              mode='range'
              months={months}
              value={draft}
              onValueChange={next => handleCalendarChange(next as DateRange)}
              min={min}
              max={max}
              locale={locale}
              aria-label={ariaLabel ?? 'Date range'}
            />
          </div>
          {confirm ? (
            <div className={styles.footer}>
              <Popover.Close asChild>
                <Button variant='ghost' size='sm'>
                  Cancel
                </Button>
              </Popover.Close>
              <Button
                size='sm'
                onClick={() => {
                  commit(draft);
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

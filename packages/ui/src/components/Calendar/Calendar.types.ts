/**
 * Defining types
 */
export interface DateRange {
  start: string | null;
  end: string | null;
}

export type CalendarValue = string | null | string[] | DateRange;

export interface CalendarProps {
  /** Selection mode. @default 'single' */
  mode?: 'single' | 'multiple' | 'range';
  /** Controlled value (ISO strings): `string|null` (single), `string[]` (multiple), `{start,end}` (range). */
  value?: CalendarValue;
  /** Uncontrolled initial value. */
  defaultValue?: CalendarValue;
  /** Fires with the next value in the mode's shape. */
  onValueChange?: (value: CalendarValue) => void;
  /** Earliest selectable ISO date (inclusive). */
  min?: string;
  /** Latest selectable ISO date (inclusive). */
  max?: string;
  /** Blacked-out ISO dates. */
  disabledDates?: string[];
  /** Months shown side by side. @default 1 */
  months?: 1 | 2 | 3;
  /** Show leading/trailing days from adjacent months. Off by default in multi-month views so a date never repeats. @default months === 1 */
  showOutsideDays?: boolean;
  /** 0 = Sunday, 1 = Monday. @default 0 */
  weekStartsOn?: 0 | 1;
  /** Reference "today". Pass a fixed value for deterministic SSR; omitted, the current day is resolved on the client after mount so it never mismatches the server. */
  today?: Date;
  /** Locale for weekday, month, and day labels. Pinned by default so SSR and client agree. @default 'en-US' */
  locale?: string;
  className?: string;
  'aria-label'?: string;
}

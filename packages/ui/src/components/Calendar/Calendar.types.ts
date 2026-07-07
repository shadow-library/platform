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
  /** 0 = Sunday, 1 = Monday. @default 0 */
  weekStartsOn?: 0 | 1;
  className?: string;
  'aria-label'?: string;
}

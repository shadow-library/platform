import { type DateRange } from '../Calendar';

export type { DateRange };

export interface RangePreset {
  label: string;
  range: DateRange;
}

export interface DateRangePickerProps {
  /** Controlled `{ start, end }` (ISO strings). */
  value?: DateRange;
  /** Uncontrolled initial `{ start, end }` (ISO strings). */
  defaultValue?: DateRange;
  /** Fires with the next range. */
  onValueChange?: (value: DateRange) => void;
  /** Relative/absolute presets shown in the rail (store the rule, resolve at query time). */
  presets?: RangePreset[];
  /** Months shown side by side. @default 2 */
  months?: 1 | 2;
  /** Earliest selectable ISO date (inclusive). */
  min?: string;
  /** Latest selectable ISO date (inclusive). */
  max?: string;
  /** Defer onValueChange until Apply (dashboards where each change costs queries). @default false */
  confirm?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Danger border/ring on the trigger. A button cannot carry `aria-invalid`, so the error itself reaches assistive tech through `aria-describedby`. */
  invalid?: boolean;
  placeholder?: string;
  /** Locale for the range display and calendar labels. Pinned by default so SSR and client agree. @default 'en-US' */
  locale?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

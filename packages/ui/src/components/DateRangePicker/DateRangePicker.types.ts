/**
 * Importing user defined packages
 */
import { type DateRange } from '../Calendar';

/**
 * Defining types
 */
export type { DateRange };

export interface RangePreset {
  label: string;
  range: DateRange;
}

export interface DateRangePickerProps {
  /** Controlled `{ start, end }` (ISO strings). */
  value?: DateRange;
  /** Uncontrolled initial value. */
  defaultValue?: DateRange;
  /** Fires with the next range. */
  onValueChange?: (value: DateRange) => void;
  /** Relative/absolute presets shown in the rail (store the rule, resolve at query time). */
  presets?: RangePreset[];
  /** Months shown side by side. @default 2 */
  months?: 1 | 2;
  min?: string;
  max?: string;
  /** Defer onValueChange until Apply (dashboards where each change costs queries). @default false */
  confirm?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  placeholder?: string;
  /** Locale for the range display and calendar labels. Pinned by default so SSR and client agree. @default 'en-US' */
  locale?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

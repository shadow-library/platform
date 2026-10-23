export type RatingSize = 'sm' | 'md' | 'lg';

export interface RatingProps {
  /** Controlled value (0 = unrated). */
  value?: number;
  /** Uncontrolled initial value. */
  defaultValue?: number;
  /** Fires with the next value. */
  onValueChange?: (value: number) => void;
  /** Number of stars. @default 5 */
  max?: number;
  /** Display size (input is always the md target). @default 'md' */
  size?: RatingSize;
  /** Render as a non-interactive display (supports fractional values). @default false */
  readOnly?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Click the current value again to clear it. @default true */
  allowClear?: boolean;
  /** Value → meaning labels (e.g. `['Terrible','Poor','Average','Good','Excellent']`). */
  labels?: string[];
  reviewCount?: number;
  'aria-label'?: string;
}

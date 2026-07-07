/**
 * Defining types
 */
export type TimePickerSize = 'sm' | 'md' | 'lg';

export interface TimePickerProps {
  /** Controlled value as 24-hour `HH:MM`, or `null`. */
  value?: string | null;
  /** Uncontrolled initial value. */
  defaultValue?: string | null;
  /** Fires with the next `HH:MM` value (`null` when cleared). */
  onValueChange?: (value: string | null) => void;
  /** Earliest selectable `HH:MM`. */
  min?: string;
  /** Latest selectable `HH:MM`. */
  max?: string;
  /** Minutes between suggestions. @default 30 */
  step?: number;
  /** 12-hour display with AM/PM. @default true */
  hour12?: boolean;
  /** Field height — matches Input. @default 'md' */
  size?: TimePickerSize;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

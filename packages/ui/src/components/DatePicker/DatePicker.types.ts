/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export type DatePickerSize = 'sm' | 'md' | 'lg';

export interface DatePickerProps {
  /** Controlled ISO value (YYYY-MM-DD), or `null`. */
  value?: string | null;
  /** Uncontrolled initial ISO value. */
  defaultValue?: string | null;
  /** Fires with the next ISO value (`null` when cleared). */
  onValueChange?: (value: string | null) => void;
  /** Earliest selectable ISO date (inclusive). */
  min?: string;
  /** Latest selectable ISO date (inclusive). */
  max?: string;
  /** Individually blacked-out ISO dates. */
  disabledDates?: string[];
  /** Field height — matches Input. @default 'md' */
  size?: DatePickerSize;
  /** Field placeholder. @default 'YYYY-MM-DD' */
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Force the danger field grammar. */
  invalid?: boolean;
  /** Show a clear (×) button when a date is set. @default true */
  clearable?: boolean;
  /** 0 = Sunday, 1 = Monday. @default 0 */
  weekStartsOn?: 0 | 1;
  id?: string;
  className?: string;
  'aria-label'?: string;
  /** Field prefix adornment. */
  prefix?: ReactNode;
}

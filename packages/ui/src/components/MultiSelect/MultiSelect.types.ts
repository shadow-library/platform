/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type MultiSelectSize = 'sm' | 'md' | 'lg';

export interface MultiSelectOption {
  /** Stable identity stored in the value array. */
  value: string;
  /** Text shown in the list and as a tag — keep it short. */
  label: string;
  /** Prevent selection; the row is skipped by the keyboard. */
  disabled?: boolean;
}

export interface MultiSelectProps {
  /** The full option set — data, not JSX, so search/select-all operate on the array. */
  options: MultiSelectOption[];
  /** Selected values (controlled). */
  value?: string[];
  /** Initial selected values (uncontrolled). */
  defaultValue?: string[];
  /** Fires with the next selection array on every toggle/remove/clear. */
  onValueChange?: (value: string[]) => void;
  /** Text shown while nothing is selected. */
  placeholder?: string;
  /** Trigger min-height/typography scale. @default 'md' */
  size?: MultiSelectSize;
  /** Presentation-only invalid state: danger border/ring + `aria-invalid`. */
  invalid?: boolean;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Tags shown before collapsing the rest into a `+N` chip. @default 3 */
  maxVisibleTags?: number;
  /** Cap the number of selectable values; remaining options disable when reached. */
  maxSelected?: number;
  /** Pin a search field to the top of the list (recommended past ~10 options). */
  searchable?: boolean;
  /** Show a leading “Select all” row with an indeterminate partial state. */
  selectAll?: boolean;
  /** Show the footer “Clear all” action. @default true */
  clearable?: boolean;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state (uncontrolled). */
  defaultOpen?: boolean;
  /** Fires when the list opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** `id` for the trigger, for external `<label for>` wiring. */
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Class applied to the trigger. */
  className?: string;
  /** Class applied to the list content surface. */
  contentClassName?: string;
}

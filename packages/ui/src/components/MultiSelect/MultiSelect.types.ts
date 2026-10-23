export type MultiSelectSize = 'sm' | 'md' | 'lg';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Prevent selection; the row is skipped by the keyboard. */
  disabled?: boolean;
}

export interface MultiSelectProps {
  /** The full option set — data, not JSX, so search/select-all operate on the array. */
  options: MultiSelectOption[];
  value?: string[];
  defaultValue?: string[];
  /** Fires with the next selection array on every toggle/remove/clear. */
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  /** Trigger min-height/typography scale. @default 'md' */
  size?: MultiSelectSize;
  invalid?: boolean;
  disabled?: boolean;
  /** Tags shown before collapsing the rest into a `+N` chip. @default 3 */
  maxVisibleTags?: number;
  /** Cap the number of selectable values; remaining options disable when reached. */
  maxSelected?: number;
  searchable?: boolean;
  selectAll?: boolean;
  /** Show the footer “Clear all” action. @default true */
  clearable?: boolean;
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  /** Fires when the list opens or closes. */
  onOpenChange?: (open: boolean) => void;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  contentClassName?: string;
}

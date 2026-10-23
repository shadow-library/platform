import { type ReactNode } from 'react';

export type ComboboxSize = 'sm' | 'md' | 'lg';

export interface ComboboxOption {
  value: string;
  /** Field label — what the field renders and what blur reverts to (required per item). */
  label: string;
  description?: ReactNode;
  media?: ReactNode;
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Static options — filtered locally by the query unless `onSearch` is given. */
  options?: ComboboxOption[];
  /** Controlled selected value (`null` when cleared). */
  value?: string | null;
  /** Uncontrolled initial value. */
  defaultValue?: string | null;
  /** Fires with the next value. */
  onValueChange?: (value: string | null) => void;
  /** Async searcher (debounced 300ms); its results replace the list and drive the loading state. */
  onSearch?: (query: string) => Promise<ComboboxOption[]>;
  /** @default 'Search…' */
  placeholder?: string;
  /** Control height — matches Input. @default 'md' */
  size?: ComboboxSize;
  invalid?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Show a clear (×) button when a value is committed. @default true */
  clearable?: boolean;
  /** Offer a "Create '{query}'" row when the query matches nothing. */
  creatable?: boolean;
  /** Fires when the create row is chosen. */
  onCreate?: (query: string) => void;
  loading?: boolean;
  /** Row shown when nothing matches. @default 'No results' */
  emptyMessage?: string;
  prefix?: ReactNode;
  id?: string;
  className?: string;
  contentClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

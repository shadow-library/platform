/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface AccordionProps {
  /** `single` scans one panel at a time; `multiple` keeps several open. */
  type: 'single' | 'multiple';
  /** Controlled open value(s). */
  value?: string | string[];
  /** Uncontrolled initial open value(s). */
  defaultValue?: string | string[];
  /** Fires when the open set changes. */
  onValueChange?: (value: string | string[]) => void;
  /** In single mode, allow closing the open item (all-collapsed). @default false */
  collapsible?: boolean;
  disabled?: boolean;
  dir?: 'ltr' | 'rtl';
  orientation?: 'horizontal' | 'vertical';
  /** `plain` (hairlines) or `contained` (Card chrome per item). @default 'plain' */
  variant?: 'plain' | 'contained';
  /** Heading level for the item headers. @default 3 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  children?: ReactNode;
}

export interface AccordionItemProps {
  /** Unique value identifying the item. */
  value: string;
  /** Scannable header label (a table-of-contents entry, not a sentence). */
  title: ReactNode;
  /** Trailing meta (badge/count) — joined to the header's accessible name. */
  meta?: ReactNode;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

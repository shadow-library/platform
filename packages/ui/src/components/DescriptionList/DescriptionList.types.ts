/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */

/** Row is the default detail-panel grammar; column stacks for narrow contexts; grid tiles facts. */
export type DescriptionListLayout = 'row' | 'column' | 'grid';

export interface DescriptionListProps extends Omit<ComponentPropsWithoutRef<'dl'>, 'title'> {
  /** Term/detail arrangement. @default 'row' */
  layout?: DescriptionListLayout;
  /** Fixed term-column width in px (row layout only; 120–200 recommended). @default 150 */
  termWidth?: number;
  /** Minimum column count for grid layout — degrades to fewer as width narrows. @default 2 */
  columns?: number;
  /** Optional header title, right-aligned with `action`. */
  title?: ReactNode;
  /** Optional header action slot (e.g. an Edit button) — the list itself never edits inline. */
  action?: ReactNode;
  /** `DescriptionList.Item` children. */
  children: ReactNode;
}

export interface DescriptionListItemProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** The key. Rendered as `<dt>`; also names the copy button. */
  term: ReactNode;
  /** Render the value in the monospace face (IDs, hashes, paths). @default false */
  mono?: boolean;
  /** Reveal a copy button on hover/focus; click copies the value's text and toasts. @default false */
  copyable?: boolean;
  /** Mask the value (••••) behind a reveal toggle; reveal state never persists. @default false */
  masked?: boolean;
  /** The value. Empty/omitted children render the em-dash empty policy automatically. */
  children?: ReactNode;
}

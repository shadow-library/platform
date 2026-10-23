import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type DescriptionListLayout = 'row' | 'column' | 'grid';

export interface DescriptionListProps extends Omit<ComponentPropsWithoutRef<'dl'>, 'title'> {
  /** Term/detail arrangement. @default 'row' */
  layout?: DescriptionListLayout;
  /** Fixed term-column width in px (row layout only; 120–200 recommended). @default 150 */
  termWidth?: number;
  /** Minimum column count for grid layout — degrades to fewer as width narrows. @default 2 */
  columns?: number;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export interface DescriptionListItemProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  term: ReactNode;
  /** Render the value in the monospace face (IDs, hashes, paths). @default false */
  mono?: boolean;
  /** Reveal a copy button on hover/focus; click copies the value's text and toasts. @default false */
  copyable?: boolean;
  /** Mask the value (••••) behind a reveal toggle; reveal state never persists. @default false */
  masked?: boolean;
  children?: ReactNode;
}

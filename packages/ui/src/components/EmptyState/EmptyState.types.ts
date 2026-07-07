/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
}

export interface EmptyStateProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** States the fact ("No services yet"); name the query in no-results titles. */
  title: ReactNode;
  /** 1–2 lines: why, and the way forward. */
  description?: ReactNode;
  /** Decorative illustration (aria-hidden); page size + first-use only. */
  illustration?: ReactNode;
  /** The single primary action, phrased as a verb. */
  action?: EmptyStateAction;
  /** Optional "Learn more"-style text button. */
  secondaryAction?: EmptyStateAction;
  /** `page` allows an illustration + roomy padding; `inline` is compact for cards/table bodies/lists. @default 'page' */
  size?: 'page' | 'inline';
}

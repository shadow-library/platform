import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
}

export interface EmptyStateProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Decorative illustration (aria-hidden); page size + first-use only. */
  illustration?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** `page` allows an illustration + roomy padding; `inline` is compact for cards/table bodies/lists. @default 'page' */
  size?: 'page' | 'inline';
}

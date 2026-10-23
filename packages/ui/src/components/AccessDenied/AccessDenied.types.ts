import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { type EmptyStateAction } from '../EmptyState';

export interface AccessDeniedProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** The application access was refused to; naming it makes the copy actionable. */
  application?: string;
  title?: ReactNode;
  /** Overrides the derived body — pass the provider's `error_description` when it sent one. */
  description?: ReactNode;
  /** Decorative glyph; the title carries the meaning. */
  illustration?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** The provider's error code, shown verbatim so it can be pasted into a support ticket. */
  error?: string;
  requestId?: string;
  /** Escape hatch for actions the object form can't express, e.g. a router link in `<Button asChild>`; rendered below the actions. */
  footer?: ReactNode;
}

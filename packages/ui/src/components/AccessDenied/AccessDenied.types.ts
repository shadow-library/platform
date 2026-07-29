/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { type EmptyStateAction } from '../EmptyState';

/**
 * Defining types
 */
export interface AccessDeniedProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * The application access was refused to. Naming it is the difference between a wall and a request
   * the user can actually make, so pass it whenever the identity provider supplied it.
   */
  application?: string;
  /** Overrides the derived title. */
  title?: ReactNode;
  /** Overrides the derived body — pass the provider's `error_description` when it sent one. */
  description?: ReactNode;
  /** Decorative glyph; the title carries the meaning. */
  illustration?: ReactNode;
  /** The single way forward, usually back to sign-in. */
  action?: EmptyStateAction;
  /** Optional secondary route out, e.g. contacting support. */
  secondaryAction?: EmptyStateAction;
  /** The provider's error code, shown verbatim so it can be pasted into a support ticket. */
  error?: string;
  /** Correlation id for the same purpose; rendered beside the code. */
  requestId?: string;
  /**
   * Escape hatch for actions the object form cannot express — a router `<Link>` wrapped in a
   * `<Button asChild>`, say. Rendered below the actions.
   */
  footer?: ReactNode;
}

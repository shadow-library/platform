/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type AlertIntent = 'info' | 'success' | 'warning' | 'danger';

export interface AlertAction {
  label: string;
  onClick: () => void;
}

export interface AlertProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Semantic intent — no neutral (a neutral "alert" is a Card well with text). @default 'info' */
  intent?: AlertIntent;
  /** Title line (body-sm 600). */
  title?: ReactNode;
  /** One outlined action button — the way out of the condition. */
  action?: AlertAction;
  /** Presence renders a dismiss × — only for acknowledgeable notices, never errors/limits. */
  onDismiss?: () => void;
}

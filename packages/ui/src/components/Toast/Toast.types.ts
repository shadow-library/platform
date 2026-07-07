/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export type ToastIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type ToastPlacement = 'bottom-end' | 'bottom-center' | 'top-end' | 'top-center';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  intent: ToastIntent;
  title: ReactNode;
  /** Optional second line (two lines max). */
  body?: ReactNode;
  /** A single optional action (Undo, View). */
  action?: ToastAction;
  /** Lifetime override in ms; `Infinity` keeps it until dismissed. Defaults by intent. */
  duration?: number;
  /** Promise state — shows a spinner and suppresses auto-dismiss until resolved. */
  loading?: boolean;
}

export type ToastOptions = Partial<Omit<ToastData, 'id' | 'intent' | 'title'>> & { id?: string };

export interface ToastPromiseMessages<T> {
  loading: ReactNode;
  success: ReactNode | ((value: T) => ReactNode);
  error: ReactNode | ((error: unknown) => ReactNode);
}

export interface ToasterProps {
  /** Corner the stack lives in. @default 'bottom-end' */
  placement?: ToastPlacement;
  /** Maximum toasts shown at once; older ones stay in the queue. @default 3 */
  max?: number;
}

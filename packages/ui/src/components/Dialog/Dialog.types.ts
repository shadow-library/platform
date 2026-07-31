/**
 * Importing npm packages
 */
import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type DialogSize = 'sm' | 'md' | 'lg';

export type DialogProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Panel max-width: sm 400 · md 560 · lg 720. @default 'md' */
  size?: DialogSize;
}

export interface DialogHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Heading-3 title (also the dialog's accessible name). */
  title: ReactNode;
  /** Supporting description below the title. */
  description?: ReactNode;
  /** Render the top-right close ×. @default true */
  showClose?: boolean;
}

export type DialogBodyProps = ComponentPropsWithoutRef<'div'>;

export interface DialogFooterProps extends ComponentPropsWithoutRef<'div'> {
  /** Ghost cancel label — closes the dialog. Omit to render your own footer via children. */
  cancel?: ReactNode;
  /** Primary action label. */
  action?: ReactNode;
  /** Fires when the primary action is pressed (does not auto-close — resolve then close yourself). */
  onAction?: () => void;
  /** Puts the primary action in its loading state. */
  loading?: boolean;
}

export interface ConfirmDialogProps {
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  /** Fires when the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** A trigger element wired via asChild (optional when controlled). */
  trigger?: ReactNode;
  /** `danger` uses the Danger primary; `primary` the accent primary. @default 'primary' */
  intent?: 'primary' | 'danger';
  /** Heading-3 question ("Delete workspace?"). */
  title: ReactNode;
  /** Concrete consequences — what, how much, reversibility. */
  description?: ReactNode;
  /** Primary action label (the verb). @default 'Confirm' */
  confirmLabel?: string;
  /** Cancel label — receives initial focus. @default 'Cancel' */
  cancelLabel?: string;
  /** Gate the action until the user types this exact string (irreversible operations). */
  typedConfirmation?: string;
  /** Fires when the confirm action is pressed. */
  onConfirm?: () => void;
  /** Puts the confirm action in its loading state. */
  loading?: boolean;
}

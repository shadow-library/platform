import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

export type DialogProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Panel max-width: sm 400 · md 560 · lg 720 · xl 1180. @default 'md' */
  size?: DialogSize;
}

export interface DialogHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Also the dialog's accessible name. */
  title: ReactNode;
  description?: ReactNode;
  /** Render the top-right close ×. @default true */
  showClose?: boolean;
}

export type DialogBodyProps = ComponentPropsWithoutRef<'div'>;

export interface DialogFooterProps extends ComponentPropsWithoutRef<'div'> {
  /** Ghost cancel label — closes the dialog. Omit to render your own footer via children. */
  cancel?: ReactNode;
  action?: ReactNode;
  /** Fires when the primary action is pressed (does not auto-close — resolve then close yourself). */
  onAction?: () => void;
  loading?: boolean;
}

export interface ConfirmDialogProps {
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  /** Fires when the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Element wired via asChild; optional when controlled. */
  trigger?: ReactNode;
  /** `danger` uses the Danger primary; `primary` the accent primary. @default 'primary' */
  intent?: 'primary' | 'danger';
  title: ReactNode;
  description?: ReactNode;
  /** The verb. @default 'Confirm' */
  confirmLabel?: string;
  /** Cancel label — receives initial focus. @default 'Cancel' */
  cancelLabel?: string;
  /** Gate the action until the user types this exact string (irreversible operations). */
  typedConfirmation?: string;
  /** Fires when the confirm action is pressed. */
  onConfirm?: () => void;
  loading?: boolean;
}

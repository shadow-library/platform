/**
 * Importing npm packages
 */
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type ReactElement, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Button } from '../Button';
import { FormField } from '../FormField';
import { IconButton } from '../IconButton';
import { Input } from '../Input';
import styles from './Dialog.module.css';
import { type ConfirmDialogProps, type DialogBodyProps, type DialogContentProps, type DialogFooterProps, type DialogHeaderProps, type DialogProps } from './Dialog.types';

/**
 * Declaring the constants
 */
function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function DialogRoot(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />;
}

/** The scrim + centered panel (layer-modal, radius-xl, e3). Task dialogs close on scrim click or Esc. */
const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent({ size = 'md', className, children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.scrim} />
      <div className={styles.positioner}>
        <DialogPrimitive.Content ref={ref} className={cn(styles.panel, className)} data-size={size} {...props}>
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
});

/** Header — heading-3 title + optional description, with the top-right close ×. */
function DialogHeader({ title, description, showClose = true, className, ...props }: DialogHeaderProps) {
  return (
    <div className={cn(styles.header, className)} {...props}>
      <div className={styles.heading}>
        <DialogPrimitive.Title className={styles.title}>{title}</DialogPrimitive.Title>
        {description != null ? <DialogPrimitive.Description className={styles.description}>{description}</DialogPrimitive.Description> : null}
      </div>
      {showClose ? (
        <DialogPrimitive.Close asChild>
          <IconButton className={styles.close} variant="ghost" size="sm" aria-label="Close" icon={<CloseIcon />} />
        </DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

/** Body — the content slot; scrolls internally past ~70vh. */
function DialogBody({ className, ...props }: DialogBodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

/** Footer — pass `cancel`/`action` for the standard grammar, or `children` for a custom row. */
function DialogFooter({ cancel, action, onAction, loading = false, className, children, ...props }: DialogFooterProps) {
  return (
    <div className={cn(styles.footer, className)} {...props}>
      {children ?? (
        <>
          {cancel != null ? (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost">{cancel}</Button>
            </DialogPrimitive.Close>
          ) : null}
          {action != null ? (
            <Button variant="primary" loading={loading} onClick={onAction}>
              {action}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * A modal surface for tasks that must be finished or abandoned before the page continues. Wraps Radix
 * Dialog — focus trap, scroll lock, scrim, Esc/scrim dismissal, and focus return to the trigger. For
 * a consequential yes/no, use `ConfirmDialog` (an alertdialog) instead of building one from this.
 */
export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogPrimitive.Trigger,
  Content: DialogContent,
  Header: DialogHeader,
  Body: DialogBody,
  Footer: DialogFooter,
  Close: DialogPrimitive.Close,
});

/**
 * The confirm grammar: a Radix AlertDialog that resolves one question — no × and no scrim-dismiss, so
 * the user must choose, and Cancel takes initial focus (destruction is never default-focused). Set
 * `intent='danger'` for the Danger primary, and `typedConfirmation` to gate irreversible actions until
 * the user retypes the resource name.
 */
export function ConfirmDialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  intent = 'primary',
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  typedConfirmation,
  onConfirm,
  loading = false,
}: ConfirmDialogProps): ReactElement {
  const [typed, setTyped] = useState('');
  const gated = typedConfirmation != null && typed !== typedConfirmation;

  return (
    <AlertDialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger != null ? <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger> : null}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={styles.scrim} />
        <div className={styles.positioner}>
          <AlertDialogPrimitive.Content className={styles.panel} data-size="sm">
            <div className={styles.header}>
              <div className={styles.heading}>
                <AlertDialogPrimitive.Title className={styles.title}>{title}</AlertDialogPrimitive.Title>
                {description != null ? <AlertDialogPrimitive.Description className={styles.description}>{description}</AlertDialogPrimitive.Description> : null}
              </div>
            </div>
            {typedConfirmation != null ? (
              <div className={styles.body}>
                <FormField label={`Type ${typedConfirmation} to confirm`}>
                  <Input value={typed} onValueChange={setTyped} autoComplete="off" spellCheck={false} />
                </FormField>
              </div>
            ) : null}
            <div className={styles.footer}>
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="ghost">{cancelLabel}</Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button variant={intent === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={gated} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              </AlertDialogPrimitive.Action>
            </div>
          </AlertDialogPrimitive.Content>
        </div>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

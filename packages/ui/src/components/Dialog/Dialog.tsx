import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type MouseEvent, type ReactElement, useEffect, useRef, useState } from 'react';

import { useControllableState } from '@/hooks';
import { cn } from '@/lib';

import { Button } from '../Button';
import { FormField } from '../FormField';
import { IconButton } from '../IconButton';
import { Input } from '../Input';
import styles from './Dialog.module.css';
import { type ConfirmDialogProps, type DialogBodyProps, type DialogContentProps, type DialogFooterProps, type DialogHeaderProps, type DialogProps } from './Dialog.types';

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

function DialogBody({ className, ...props }: DialogBodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

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

/** Radix Dialog: focus trap, scroll lock, scrim and Esc dismissal. For a consequential yes/no use `ConfirmDialog` (an alertdialog) instead. */
export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogPrimitive.Trigger,
  Content: DialogContent,
  Header: DialogHeader,
  Body: DialogBody,
  Footer: DialogFooter,
  Close: DialogPrimitive.Close,
});

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null | undefined)?.then === 'function';
}

/**
 * Radix AlertDialog with no × and no scrim dismissal, so the user must choose; Cancel takes initial focus so destruction is never default-focused. An `onConfirm` that
 * returns a promise holds the dialog open with the confirm button loading, Cancel disabled and Escape ignored; it closes when the promise resolves and stays open when it
 * rejects, so the caller can surface the error.
 */
export function ConfirmDialog({
  open: openProp,
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
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen ?? false, onChange: onOpenChange });
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [settledOpen, setSettledOpen] = useState(open);
  const attempt = useRef(0);
  const gated = typedConfirmation != null && typed !== typedConfirmation;

  if (settledOpen !== open) {
    setSettledOpen(open);
    setPending(false);
  }

  // A parent that closes the dialog mid-flight orphans the running confirm, so its settle must not touch the next opening.
  useEffect(() => {
    attempt.current += 1;
  }, [open]);

  // Radix's Action closes after this handler unless it prevents default, which is how an async confirm keeps the dialog open until it settles.
  function handleConfirm(event: MouseEvent<HTMLButtonElement>): void {
    if (pending) return event.preventDefault();
    const result = onConfirm?.();
    if (!isPromiseLike(result)) return;
    event.preventDefault();
    const current = ++attempt.current;
    setPending(true);
    const settle = (resolved: boolean): void => {
      if (attempt.current !== current) return;
      setPending(false);
      if (resolved) setOpen(false);
    };
    result.then(
      () => settle(true),
      () => settle(false),
    );
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {trigger != null ? <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger> : null}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={styles.scrim} />
        <div className={styles.positioner}>
          <AlertDialogPrimitive.Content className={styles.panel} data-size="sm" onEscapeKeyDown={event => pending && event.preventDefault()}>
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
                <Button variant="ghost" disabled={pending}>
                  {cancelLabel}
                </Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button variant={intent === 'danger' ? 'danger' : 'primary'} loading={loading || pending} disabled={gated} onClick={handleConfirm}>
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

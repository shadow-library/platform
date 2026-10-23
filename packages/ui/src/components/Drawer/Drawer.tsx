import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type KeyboardEvent, useContext, useId } from 'react';

import { cn } from '@/lib';

import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { DrawerContext } from './Drawer.context';
import styles from './Drawer.module.css';
import { type DrawerBodyProps, type DrawerFooterProps, type DrawerHeaderProps, type DrawerProps } from './Drawer.types';

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function DrawerHeader({ title, meta, showClose = true, className, ...props }: DrawerHeaderProps) {
  const { modal, titleId, onClose } = useContext(DrawerContext);
  const TitleTag = modal ? DialogPrimitive.Title : 'h2';
  return (
    <div className={cn(styles.header, className)} {...props}>
      <div className={styles.heading}>
        <TitleTag id={titleId} className={styles.title}>
          {title}
        </TitleTag>
        {meta != null ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {showClose ? (
        modal ? (
          <DialogPrimitive.Close asChild>
            <IconButton className={styles.close} variant="ghost" size="sm" aria-label="Close" icon={<CloseIcon />} />
          </DialogPrimitive.Close>
        ) : (
          <IconButton className={styles.close} variant="ghost" size="sm" aria-label="Close" icon={<CloseIcon />} onClick={onClose} />
        )
      ) : null}
    </div>
  );
}

function DrawerBody({ className, ...props }: DrawerBodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

function DrawerFooter({ cancel, action, onAction, loading = false, className, children, ...props }: DrawerFooterProps) {
  const { modal, onClose } = useContext(DrawerContext);
  return (
    <div className={cn(styles.footer, className)} {...props}>
      {children ?? (
        <>
          {cancel != null ? (
            modal ? (
              <DialogPrimitive.Close asChild>
                <Button variant="ghost">{cancel}</Button>
              </DialogPrimitive.Close>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                {cancel}
              </Button>
            )
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

/** Modal mode wraps Radix Dialog; non-modal renders a `role="complementary"` landmark that keeps the page interactive. */
function DrawerRoot({
  open,
  onOpenChange,
  placement = 'right',
  size = 'md',
  modal = true,
  onEscapeKeyDown,
  onOpenAutoFocus,
  className,
  children,
  'aria-label': ariaLabel,
}: DrawerProps) {
  const titleId = useId();
  const onClose = () => onOpenChange?.(false);

  const panelProps = {
    className: cn(styles.panel, className),
    'data-placement': placement,
    'data-size': size,
  };

  if (modal) {
    return (
      <DrawerContext.Provider value={{ modal: true, titleId, onClose }}>
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={styles.scrim} />
            <DialogPrimitive.Content
              {...panelProps}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabel ? undefined : titleId}
              onEscapeKeyDown={onEscapeKeyDown}
              onOpenAutoFocus={onOpenAutoFocus}
            >
              {children}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </DrawerContext.Provider>
    );
  }

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape') return;
    onEscapeKeyDown?.(event.nativeEvent);
    if (!event.nativeEvent.defaultPrevented) onClose();
  }

  return (
    <DrawerContext.Provider value={{ modal: false, titleId, onClose }}>
      <aside {...panelProps} data-nonmodal="" aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId} onKeyDown={handleKeyDown}>
        {children}
      </aside>
    </DrawerContext.Provider>
  );
}

export const Drawer = Object.assign(DrawerRoot, {
  Header: DrawerHeader,
  Body: DrawerBody,
  Footer: DrawerFooter,
});

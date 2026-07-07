/**
 * Importing npm packages
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type KeyboardEvent, useContext, useId } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { DrawerContext } from './Drawer.context';
import styles from './Drawer.module.css';
import { type DrawerBodyProps, type DrawerFooterProps, type DrawerHeaderProps, type DrawerProps } from './Drawer.types';

/**
 * Declaring the constants
 */
function CloseIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M4 4l8 8M12 4l-8 8' />
    </svg>
  );
}

/** Header — title + optional meta, sharing the Dialog header grammar. Close × closes in either mode. */
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
            <IconButton className={styles.close} variant='ghost' size='sm' aria-label='Close' icon={<CloseIcon />} />
          </DialogPrimitive.Close>
        ) : (
          <IconButton className={styles.close} variant='ghost' size='sm' aria-label='Close' icon={<CloseIcon />} onClick={onClose} />
        )
      ) : null}
    </div>
  );
}

/** Body — scrolls independently. */
function DrawerBody({ className, ...props }: DrawerBodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

/** Footer — pinned; shares the Dialog footer grammar. */
function DrawerFooter({ cancel, action, onAction, loading = false, className, children, ...props }: DrawerFooterProps) {
  const { modal, onClose } = useContext(DrawerContext);
  return (
    <div className={cn(styles.footer, className)} {...props}>
      {children ?? (
        <>
          {cancel != null ? (
            modal ? (
              <DialogPrimitive.Close asChild>
                <Button variant='ghost'>{cancel}</Button>
              </DialogPrimitive.Close>
            ) : (
              <Button variant='ghost' onClick={onClose}>
                {cancel}
              </Button>
            )
          ) : null}
          {action != null ? (
            <Button variant='primary' loading={loading} onClick={onAction}>
              {action}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * A full-height edge panel for record detail. Modal mode wraps Radix Dialog (scrim, focus trap,
 * scroll lock — Dialog's rules) for focused edits; non-modal renders a `role="complementary"` landmark
 * that keeps the page interactive for browse-and-inspect, closing via ×, Esc, or the caller. One
 * drawer at a time; slides from its edge with the emphasized curve. Shares the Dialog header/footer.
 */
function DrawerRoot({ open, onOpenChange, placement = 'right', size = 'md', modal = true, className, children, 'aria-label': ariaLabel }: DrawerProps) {
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
            <DialogPrimitive.Content {...panelProps} aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId}>
              {children}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </DrawerContext.Provider>
    );
  }

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') onClose();
  }

  return (
    <DrawerContext.Provider value={{ modal: false, titleId, onClose }}>
      <aside {...panelProps} data-nonmodal='' aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId} onKeyDown={handleKeyDown}>
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

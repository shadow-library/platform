import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { createContext, forwardRef, type MouseEvent, type ReactElement, useCallback, useContext, useMemo } from 'react';

import { cn } from '@/lib';

import styles from './ActionSheet.module.css';
import { type ActionSheetGroupProps, type ActionSheetItemProps, type ActionSheetProps } from './ActionSheet.types';

interface ActionSheetContextValue {
  close: () => void;
}

const ActionSheetContext = createContext<ActionSheetContextValue | null>(null);

/** Touch replacement for an anchored menu: Radix Dialog owns focus trap, scrim, Esc and scroll lock; rows are >=44px and a cancel row is always offered. */
function ActionSheetRoot({ open, onOpenChange, title, description, cancelLabel = 'Cancel', 'aria-label': ariaLabel, children, className }: ActionSheetProps): ReactElement {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const context = useMemo(() => ({ close }), [close]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.scrim} />
        <DialogPrimitive.Content className={cn(styles.surface, className)} aria-label={title == null ? ariaLabel : undefined}>
          {title != null || description != null ? (
            <div className={styles.header}>
              <DialogPrimitive.Title className={title != null ? styles.title : styles.srOnly}>{title ?? ariaLabel ?? 'Actions'}</DialogPrimitive.Title>
              {description != null ? <DialogPrimitive.Description className={styles.description}>{description}</DialogPrimitive.Description> : null}
            </div>
          ) : (
            <DialogPrimitive.Title className={styles.srOnly}>{ariaLabel ?? 'Actions'}</DialogPrimitive.Title>
          )}

          <div className={styles.actions}>
            <ActionSheetContext.Provider value={context}>{children}</ActionSheetContext.Provider>
          </div>

          <DialogPrimitive.Close className={styles.cancel}>{cancelLabel}</DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const ActionSheetItem = forwardRef<HTMLButtonElement, ActionSheetItemProps>(function ActionSheetItem(
  { intent = 'neutral', icon, closeOnSelect = true, asChild = false, type, className, onClick, children, ...props },
  ref,
) {
  const context = useContext(ActionSheetContext);

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    onClick?.(event);
    if (closeOnSelect && !event.defaultPrevented) context?.close();
  }

  const shared = { className: cn(styles.item, className), 'data-intent': intent, onClick: handleClick };

  if (asChild) {
    return (
      <Slot ref={ref} {...shared} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button ref={ref} type={type ?? 'button'} {...shared} {...props}>
      {icon != null ? (
        <span className={styles.itemIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.itemLabel}>{children}</span>
    </button>
  );
});

const ActionSheetGroup = forwardRef<HTMLDivElement, ActionSheetGroupProps>(function ActionSheetGroup({ label, className, children, ...props }, ref) {
  return (
    <div ref={ref} role="group" className={cn(styles.group, className)} {...props}>
      {label != null ? <div className={styles.groupLabel}>{label}</div> : null}
      {children}
    </div>
  );
});

export const ActionSheet = Object.assign(ActionSheetRoot, { Item: ActionSheetItem, Group: ActionSheetGroup });

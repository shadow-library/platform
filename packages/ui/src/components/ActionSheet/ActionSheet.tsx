/**
 * Importing npm packages
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { createContext, forwardRef, type MouseEvent, type ReactElement, useCallback, useContext, useMemo } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './ActionSheet.module.css';
import { type ActionSheetGroupProps, type ActionSheetItemProps, type ActionSheetProps } from './ActionSheet.types';

/**
 * Defining types
 */
interface ActionSheetContextValue {
  close: () => void;
}

/**
 * Declaring the constants
 */
const ActionSheetContext = createContext<ActionSheetContextValue | null>(null);

/**
 * The touch replacement for an anchored menu: a modal sheet of full-width action rows rising from
 * the bottom edge, where DropdownMenu/ContextMenu placement has no anchor worth pointing at. Radix
 * Dialog owns the focus trap, scrim, Esc, and scroll lock; every row is a ≥44px tap target and a
 * separated cancel row always offers an explicit way out. Above md, prefer the anchored menus.
 */
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

  // asChild delegates rendering to the consumer's element (e.g. a router link); the child owns its content.
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

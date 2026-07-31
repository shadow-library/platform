/**
 * Importing npm packages
 */
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { createContext, forwardRef, useContext, useId } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Popover.module.css';
import { type PopoverContentProps, type PopoverHeaderProps, type PopoverProps } from './Popover.types';

/**
 * Declaring the constants
 */
const TitleContext = createContext<string | undefined>(undefined);

function PopoverRoot(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

/**
 * The anchored, non-modal overlay content — the shared overlay surface (raised, border-default, e2),
 * radius-lg, offset 8 with flip/shift and no arrow. The dialog is labelled by its `Popover.Header`
 * title; pass `aria-label` for a headerless popover.
 */
const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  { className, side = 'bottom', align = 'center', sideOffset = 8, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, children, ...props },
  ref,
) {
  const titleId = useId();
  const labelledBy = ariaLabelledby ?? (ariaLabel ? undefined : titleId);
  return (
    <TitleContext.Provider value={titleId}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          className={cn(styles.content, className)}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={16}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          {...props}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </TitleContext.Provider>
  );
});

/** Optional header — title + supporting description, with the title wired as the dialog's label. */
function PopoverHeader({ title, description, className, ...props }: PopoverHeaderProps) {
  const titleId = useContext(TitleContext);
  return (
    <div className={cn(styles.header, className)} {...props}>
      {title != null ? (
        <div id={titleId} className={styles.title}>
          {title}
        </div>
      ) : null}
      {description != null ? <div className={styles.description}>{description}</div> : null}
    </div>
  );
}

/**
 * An anchored, interactive, non-modal overlay: links, quick filters, small forms, entity previews.
 * The page stays interactive behind it and it closes on outside click or Esc. Wraps Radix Popover,
 * which owns positioning, focus movement (to the first focusable, back to the trigger on close,
 * never trapped), and the dialog semantics.
 */
export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverPrimitive.Trigger,
  Anchor: PopoverPrimitive.Anchor,
  Content: PopoverContent,
  Header: PopoverHeader,
  Close: PopoverPrimitive.Close,
});
